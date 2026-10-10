// @ts-check
/**
 * 皮肤装配器：把「工程配置 + 用户素材」变成一套完整的皮肤文件 + Skin.ini。
 * 这是「AI 扫描素材并组合、对细节做填补和修复」的落地点。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, isAbsolute, basename, extname } from 'node:path';
import { readSkin, writeSkin } from '../ssf/container.js';
import { decodeIni, encodeIni, IniDoc, bgrToHex, hexToBgr } from '../ssf/ini.js';
import { decodePng, encodePng } from '../image/png.js';
import { encodeBmp24 } from '../image/bmp.js';
import { adjust, alphaBBox, autoSheetCells, clone, containFit, create, getPixel, hueShift, resize, trim } from '../image/raster.js';
import { PANEL_SLOTS, BUTTON_SLOTS, STATES, defaultProject, defaultSkinIni } from './spec.js';
import { auditNineSlice, detectNineSlice, detectMargins, findFlatBand } from './layout.js';
import { loadImage } from './probe.js';
import { placeholderBar, placeholderGeometry, placeholderIcon, placeholderPanelH, placeholderPanelV, placeholderStrip } from './placeholder.js';

/** @param {string} projectDir @param {string} rel */
function resolvePath(projectDir, rel) {
    return isAbsolute(rel) ? rel : join(projectDir, rel);
}

/** @param {string} dir */
export function loadProject(dir) {
    const p = join(dir, 'skin.project.json');
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
}

/** @param {string} dir @param {object} project */
export function saveProject(dir, project) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'skin.project.json'), JSON.stringify(project, null, 2), 'utf8');
    return join(dir, 'skin.project.json');
}

/** 新建工程骨架。 @param {string} dir @param {object} meta */
export function initProject(dir, meta = {}) {
    const project = defaultProject(meta);
    mkdirSync(join(dir, project.assetDir), { recursive: true });
    mkdirSync(join(dir, 'preview'), { recursive: true });
    saveProject(dir, project);
    return project;
}

/** 按三态策略派生一张图。 @param {import('../image/png.js').Raster} r @param {object} cfg */
function applyState(r, cfg) {
    if (!cfg) return r;
    const out = clone(r);
    if (cfg.mode === 'lighten') adjust(out, { brightness: 1 + (cfg.amount ?? 0.1), saturation: 0.95 });
    else if (cfg.mode === 'darken') adjust(out, { brightness: 1 - (cfg.amount ?? 0.15), saturation: 1.1 });
    else if (cfg.mode === 'tint' && cfg.color) {
        const c = cfg.color;
        for (let i = 0; i < out.data.length; i += 4) {
            if (out.data[i + 3] === 0) continue;
            out.data[i] = Math.round(out.data[i] * 0.4 + c[0] * 0.6);
            out.data[i + 1] = Math.round(out.data[i + 1] * 0.4 + c[1] * 0.6);
            out.data[i + 2] = Math.round(out.data[i + 2] * 0.4 + c[2] * 0.6);
        }
    }
    return out;
}

/** @param {import('../image/png.js').Raster} r @param {'png'|'bmp'} format @param {object} project */
function encodeIcon(r, format, project) {
    if (format === 'bmp') {
        const bg = project.icon?.bmpBackground ?? [255, 255, 255];
        return { data: encodeBmp24(r, { background: bg }), ext: 'bmp' };
    }
    return { data: encodePng(r), ext: 'png' };
}

/**
 * 装配一套皮肤。
 * @param {object} project
 * @param {string} projectDir
 * @returns {{files:{name:string,data:Uint8Array}[], ini:string, warnings:string[], layoutInfo:object}}
 */
export function assembleSkin(project, projectDir) {
    /** @type {{name:string,data:Uint8Array}[]} */
    const files = [];
    /** @type {string[]} */
    const warnings = [];
    /** @type {Record<string, any>} */
    const layoutInfo = {};
    const doc = new IniDoc(defaultSkinIni({
        name: project.name, author: project.author, info: project.info, email: project.email,
    }));
    // [Display] 配色：工程里是 #rrggbb，Skin.ini 里必须是 0xBBGGRR
    const theme = project.theme || {};
    const colorMap = {
        pinyinColor: 'pinyin_color',
        firstColor: 'zhongwen_first_color',
        zhongwenColor: 'zhongwen_color',
        compHintColor: 'comphint_color',
    };
    for (const [k, iniKey] of Object.entries(colorMap)) {
        if (theme[k]) doc.set('Display', iniKey, '0x' + hexToBgr(theme[k]).toString(16).padStart(6, '0'));
    }

    const roles = project.roles || {};
    const iconW = project.icon?.w ?? 20;
    const iconH = project.icon?.h ?? 20;
    const iconFormat = project.icon?.format ?? 'bmp';

    // ---------- 1. 面板 ----------
    /** @type {Record<string, string>} */
    const panelFile = {};
    for (const spec of PANEL_SLOTS) {
        const role = roles[spec.slot];
        const needIt = !!role || (spec.required && project.autoGenerate !== false);
        if (!needIt) {
            if (spec.required) warnings.push('缺少必需面板「' + spec.label + '」（' + spec.slot + '），已用占位图代替');
            role || (roles[spec.slot] = { generate: true });
        }
        const r = roles[spec.slot] || (roles[spec.slot] = { generate: true });

        /** @type {import('../image/png.js').Raster} */
        let raster;
        let origin;
        /** @type {{raster:import('../image/png.js').Raster, nineSlice:object, margins:object|null}|null} */
        let hint = null;
        if (r.source) {
            const abs = resolvePath(projectDir, r.source);
            const loaded = loadImage(abs);
            if (!loaded.ok) {
                warnings.push(spec.slot + ' 载入失败：' + loaded.error + '，改用占位图');
                hint = makePlaceholder(spec.slot, r); raster = hint.raster; origin = 'placeholder';
            } else { raster = loaded.raster; origin = abs; }
        } else {
            hint = makePlaceholder(spec.slot, r);
            raster = hint.raster;
            origin = 'placeholder';
        }

        // 面板一律输出 PNG（保留 alpha）
        const data = encodePng(raster);
        const name = spec.defaultFile;
        files.push({ name, data });
        panelFile[spec.slot] = name;

        // 反推布局参数
        const fromProject = (project.nineSlice && project.nineSlice[spec.slot]) || r.nineSlice || null;
        const ns = fromProject || (hint ? hint.nineSlice : null);
        const detected = ns
            ? { ...ns, confidence: 1, note: fromProject ? '来自工程配置' : '占位图自带导引线' }
            : detectNineSlice(raster);
        const margins = r.margins || (hint && hint.margins) || detectMargins(raster, {});
        // 九宫格体检：专抓「输入长文本时窗体拉长、边角变形」这类问题
        // 只有真正会用九宫格拉伸的面板才做体检（状态栏底图按原尺寸绘制，不参与拉伸）
        const audit = spec.nineSlice === false
            ? { ok: true, issues: [], skipped: true, hDetail: 0, vDetail: 0, midW: 0, midH: 0 }
            : auditNineSlice(raster, detected, { growAxis: spec.growAxis });
        for (const iss of audit.issues) {
            // 兼容 msg / message 两种写法：我自己就写错过一次，结果每轮都打一行 "[面板] undefined"
            warnings.push('[' + spec.label + '] ' + (iss.msg || iss.message || iss.code || '（未提供说明）'));
        }
        const flatH = findFlatBand(raster, { axis: 'h' });
        layoutInfo[spec.slot] = {
            origin, nineSlice: detected, margins,
            audit: { skipped: !!audit.skipped, hDetail: +audit.hDetail.toFixed(3), vDetail: +audit.vDetail.toFixed(3), midW: audit.midW, midH: audit.midH },
            flatBand: flatH ? { start: flatH.start, end: flatH.end, score: +flatH.score.toFixed(3) } : null,
        };
        // 不参与拉伸的面板（如状态栏底图按原尺寸绘制）不必为九宫格置信度报警
        if (spec.nineSlice !== false && detected.confidence < 0.6) {
            warnings.push(spec.label + ' 的九宫格边界是猜的（' + detected.note + '），请在预览图里复核');
        }
    }

    // ---------- 2. 候选窗段落 ----------
    // layered / pic_mask / *_display 这三类键，真实第三方皮肤【一个都不用】——
    // 我原来默认写进去，等于给引擎换了一条渲染路径。改成只在项目里显式要求时才写。
    const setLayered = (sec) => { if (project.layered !== undefined) doc.set(sec, 'layered', project.layered ? '1' : '0'); };
    const h1 = layoutInfo.panel_h;
    setLayered('Scheme_H1');
    doc.set('Scheme_H1', 'pic', panelFile.panel_h);
    doc.set('Scheme_H1', 'layout_horizontal', '0,' + h1.nineSlice.left + ',' + h1.nineSlice.right);
    doc.set('Scheme_H1', 'layout_vertical', '0,' + h1.nineSlice.top + ',' + h1.nineSlice.bottom);
    doc.set('Scheme_H1', 'pinyin_marge', h1.margins.pinyin_marge.join(','));
    doc.set('Scheme_H1', 'zhongwen_marge', h1.margins.zhongwen_marge.join(','));
    doc.set('Scheme_H1', 'anchor', Math.round(h1.nineSlice.left / 2) + ',' + Math.round(h1.nineSlice.top / 2));

    const v1 = layoutInfo.panel_v;
    setLayered('Scheme_V1');
    doc.set('Scheme_V1', 'pic', panelFile.panel_v);
    doc.set('Scheme_V1', 'layout_horizontal', '0,' + v1.nineSlice.left + ',' + v1.nineSlice.right);
    doc.set('Scheme_V1', 'layout_vertical', '0,' + v1.nineSlice.top + ',' + v1.nineSlice.bottom);
    doc.set('Scheme_V1', 'pinyin_marge', v1.margins.pinyin_marge.join(','));
    doc.set('Scheme_V1', 'zhongwen_marge', v1.margins.zhongwen_marge.join(','));

    // 分体底图（可选段）
    const strips = ['strip_h_pinyin', 'strip_h_cand', 'strip_v_cand'].filter((s) => roles[s]);
    if (strips.length) {
        if (roles.strip_h_pinyin && roles.strip_h_cand) {
            setLayered('Scheme_H2');
            doc.set('Scheme_H2', 'pinyin_pic', panelFile.strip_h_pinyin);
            const a = layoutInfo.strip_h_pinyin.nineSlice;
            doc.set('Scheme_H2', 'pinyin_layout_horizontal', '0,' + a.left + ',' + a.right);
            doc.set('Scheme_H2', 'pinyin_layout_vertical', '0,' + a.top + ',' + a.bottom);
            doc.set('Scheme_H2', 'pinyin_marge', layoutInfo.strip_h_pinyin.margins.pinyin_marge.join(','));
            doc.set('Scheme_H2', 'zhongwen_pic', panelFile.strip_h_cand);
            const b = layoutInfo.strip_h_cand.nineSlice;
            doc.set('Scheme_H2', 'zhongwen_layout_horizontal', '0,' + b.left + ',' + b.right);
            doc.set('Scheme_H2', 'zhongwen_layout_vertical', '0,' + b.top + ',' + b.bottom);
            doc.set('Scheme_H2', 'zhongwen_marge', layoutInfo.strip_h_cand.margins.zhongwen_marge.join(','));
        } else if (roles.strip_h_pinyin || roles.strip_h_cand) {
            warnings.push('Scheme_H2 需要同时提供「横排-拼音串区」和「横排-候选区」两张底图，当前只有一张，已跳过 H2 段');
        }
        if (roles.strip_v_cand) {
            setLayered('Scheme_V2');
            doc.set('Scheme_V2', 'pinyin_pic', panelFile.strip_h_pinyin || panelFile.strip_v_cand);
            doc.set('Scheme_V2', 'zhongwen_pic', panelFile.strip_v_cand);
            const c = layoutInfo.strip_v_cand.nineSlice;
            doc.set('Scheme_V2', 'zhongwen_layout_horizontal', '0,' + c.left + ',' + c.right);
            doc.set('Scheme_V2', 'zhongwen_layout_vertical', '0,' + c.top + ',' + c.bottom);
            doc.set('Scheme_V2', 'zhongwen_marge', layoutInfo.strip_v_cand.margins.zhongwen_marge.join(','));
        }
    }

    // ---------- 3. 状态栏按钮 ----------
    doc.set('StatusBar', 'pic', panelFile.bar);
    // 同理：除非项目显式开 useBarMask，否则不写 pic_mask
    if (project.useBarMask && panelFile.bar_mask) doc.set('StatusBar', 'pic_mask', panelFile.bar_mask);
    const enabled = (project.buttons && project.buttons.enabled) || ['cn_en'];
    const posMap = (project.buttons && project.buttons.pos) || {};
    const missingRequired = [];
    for (const bspec of BUTTON_SLOTS) {
        if (!enabled.includes(bspec.slot)) continue;
        const r = roles[bspec.slot];
        if (!r) {
            if (bspec.required) missingRequired.push(bspec.slot);
            warnings.push('按钮「' + bspec.label + '」在启用列表里但没有素材，已用占位图');
        }
        const role = r || { generate: true };
        const variants = bspec.variants;
        // 取得每个变体的「常态」图
        /** @type {Record<string, import('../image/png.js').Raster>} */
        const base = {};
        if (role.generate || (!role.sources && !role.sheet && !role.source)) {
            const labels = { cn: 'CN', en: 'EN', a: 'A', cn_biaodian: '.,', en_biaodian: '.,', quan: 'F', ban: 'H', quanpin: 'QP', shuanpin: 'SP', jian: 'J', fan: 'F', key: 'KB', menu: 'M', ie: 'S', pass: 'P', passon: 'P', skinmanager: 'SM' };
            for (const v of variants) base[v] = placeholderIcon(labels[v] || v.slice(0, 2).toUpperCase(), { width: iconW, height: iconH, hue: project.hue ?? 0.72, state: 'normal' });
        } else if (role.sheet) {
            const loaded = loadImage(resolvePath(projectDir, role.sheet));
            if (!loaded.ok) { warnings.push(bspec.slot + ' 拼图载入失败：' + loaded.error); continue; }
            const cells = autoSheetCells(loaded.raster, { minCell: Math.max(6, Math.floor(iconW / 2)) });
            if (cells.length < variants.length) {
                warnings.push(bspec.slot + ' 自动切分只得到 ' + cells.length + ' 块，需要 ' + variants.length + ' 块（' + variants.join('/') + '），多余的用占位图补齐');
            }
            variants.forEach((v, i) => { base[v] = cells[i] || placeholderIcon(v.slice(0, 2).toUpperCase(), { width: iconW, height: iconH }); });
        } else if (role.sources) {
            for (const v of variants) {
                const src = role.sources[v];
                if (!src) { warnings.push(bspec.slot + ' 缺少变体「' + v + '」的素材，用占位图代替'); base[v] = placeholderIcon(v.slice(0, 2).toUpperCase(), { width: iconW, height: iconH }); continue; }
                const loaded = loadImage(resolvePath(projectDir, src));
                if (!loaded.ok) { warnings.push(bspec.slot + '/' + v + ' 载入失败：' + loaded.error); continue; }
                base[v] = loaded.raster;
            }
        } else if (role.source) {
            const loaded = loadImage(resolvePath(projectDir, role.source));
            if (!loaded.ok) { warnings.push(bspec.slot + ' 载入失败：' + loaded.error); continue; }
            // 单张图：按变体数均分横向切分；只有一个变体时直接用
            if (variants.length === 1) base[variants[0]] = loaded.raster;
            else {
                const cells = autoSheetCells(loaded.raster, { minCell: Math.max(6, Math.floor(iconW / 2)) });
                variants.forEach((v, i) => { base[v] = cells[i] || loaded.raster; });
                if (cells.length < variants.length) warnings.push(bspec.slot + ' 从单张图切出 ' + cells.length + ' 块 < 需要的 ' + variants.length + ' 块');
            }
        }

        // 每个状态一组合并后的文件名
        /** @type {Record<string, string[]>} */
        const stateFiles = { normal: [], hover: [], down: [] };
        let missing = false;
        for (const v of variants) {
            let src = base[v];
            if (!src) { missing = true; continue; }
            // 归一尺寸：等比缩放后居中贴到 iconW×iconH 透明画布
            const fitted = containFit(src, iconW, iconH, 'bilinear');
            for (const st of STATES) {
                // 优先用作者显式提供的该状态原图；没有才由常态推导
                const explicit = role.states && role.states[st.key] && role.states[st.key][v];
                let baseForState = fitted;
                if (explicit) {
                    const el = loadImage(resolvePath(projectDir, explicit));
                    if (el.ok) baseForState = containFit(el.raster, iconW, iconH, 'bilinear');
                    else warnings.push(bspec.slot + '/' + v + ' 的 ' + st.label + ' 原图载入失败：' + el.error + '，改为自动推导');
                }
                let img = (st.key === 'normal' || explicit) ? baseForState : applyState(baseForState, (project.states || {})[st.key]);
                // 细节修复钩子：三态图如果整块是透明的，就补一个最低可见底板
                const bb = alphaBBox(img, 8);
                if (!bb && st.key !== 'normal' && !explicit) { img = applyState(fitted, { mode: st.key === 'hover' ? 'lighten' : 'darken', amount: 0.08 }); }
                const enc = encodeIcon(img, iconFormat, project);
                const fname = v + st.suffix + '.' + enc.ext;
                files.push({ name: fname, data: enc.data });
                stateFiles[st.key].push(fname);
            }
        }
        if (missing) { warnings.push(bspec.slot + ' 有变体没有可用素材，该按钮可能显示不全'); }
        const pos = posMap[bspec.slot] || [20, 1];
        // 真实第三方皮肤（苍翠欲滴 / 貂蝉）都写了 <按钮>_display=1。
        // 我早先因为"雷电将军没有这个键"把它去掉了 —— 但用户反馈状态栏里看不到按钮，
        // 那就按多数真实皮肤的做法加回来。
        doc.set('StatusBar', bspec.slot + '_display', '1');
        doc.set('StatusBar', bspec.slot + '_pos', pos.join(','));
        doc.set('StatusBar', bspec.slot, stateFiles.normal.join(','));
        doc.set('StatusBar', bspec.slot + '_hover', stateFiles.hover.join(','));
        doc.set('StatusBar', bspec.slot + '_down', stateFiles.down.join(','));
    }
    if (missingRequired.length) warnings.push('启用列表里缺少必需按钮：' + missingRequired.join(', '));

    // ---------- 3.5 候选窗浮层（overlay）----------
    // 这些键用 10 元组 *_align 定位而不是 _pos。本插件【原样透传】作者给的数值，不做任何推导
    // （理由见 spec.js 的 OVERLAY_PRESETS 注释：十元组只被部分逆向）。
    const overlays = project.overlays || [];
    const overlaySections = new Set();
    for (const ov of overlays) {
        const sec = ov.section || 'Scheme_H1';
        if (!['Scheme_H1', 'Scheme_V1', 'Scheme_H2', 'Scheme_V2'].includes(sec)) {
            warnings.push('浮层 ' + ov.name + ' 的段落 ' + sec + ' 非法，已跳过');
            continue;
        }
        if (!ov.name || !ov.align) { warnings.push('浮层缺少 name 或 align，已跳过'); continue; }
        if (!/^[0-9]+(,[0-9]+){9}$/.test(String(ov.align).trim())) {
            warnings.push('浮层 ' + ov.name + ' 的 align 必须是 10 个整数（收到 "' + ov.align + '"），已跳过');
            continue;
        }
        const prefix = ov.prefix || '';
        /** @type {Record<string, string[]>} */
        const stFiles = { normal: [], hover: [], down: [] };
        /** @param {string[]|undefined} list @param {string} suffix */
        const pick = (list, suffix) => {
            const out = [];
            for (const rel of list || []) {
                const loaded = loadImage(resolvePath(projectDir, rel));
                if (!loaded.ok) { warnings.push('浮层 ' + ov.name + ' 的图片载入失败：' + loaded.error); continue; }
                const enc = encodeIcon(loaded.raster, 'png', project);
                const nm = basename(rel).replace(/\.[^.]+$/, '') + suffix + '.' + enc.ext;
                files.push({ name: nm, data: enc.data });
                out.push(nm);
            }
            return out;
        };
        stFiles.normal = pick(ov.normal, '1');
        stFiles.hover = pick(ov.hover, '2');
        stFiles.down = pick(ov.down, '3');
        if (!stFiles.normal.length) { warnings.push('浮层 ' + ov.name + ' 没有常态图，已跳过'); continue; }
        if (!stFiles.hover.length) stFiles.hover = stFiles.normal;
        if (!stFiles.down.length) stFiles.down = stFiles.normal;
        if (project.overlayDisplay) doc.set(sec, prefix + ov.name + '_display', '1');
        doc.set(sec, prefix + ov.name + '_align', String(ov.align).trim());
        doc.set(sec, prefix + ov.name, stFiles.normal.join(','));
        doc.set(sec, prefix + ov.name + '_hover', stFiles.hover.join(','));
        doc.set(sec, prefix + ov.name + '_down', stFiles.down.join(','));
        overlaySections.add(sec);
    }
    if (overlaySections.size) {
        const nCustom = overlays.filter((o) => /^custom/.test(o.name || '')).length;
        if (nCustom) doc.set('Scheme_H1', 'custom_cnt', String(nCustom));
    }

    // ---------- 4. Skin.ini 落盘 ----------
    const ini = doc.toString();
    files.push({ name: 'Skin.ini', data: encodeIni(ini, { crlf: true }) });
    return { files, ini, warnings, layoutInfo };
}

/**
 * 生成占位面板，并带上与之严格对应的九宫格 / 边距提示（避免让探测器去猜自己刚画的东西）。
 * @param {string} slot @param {object} role
 */
function makePlaceholder(slot, role) {
    // 默认色相 0.474 = 171°（青玉），与 Skin.ini 的默认主题色一致。
    // 这里原来是 0.72 = 259°（紫罗兰）；而且它【显式传给】 placeholder*，
    // 覆盖掉了 placeholder.js 里的默认值 —— 所以只改那边是没用的。
    const hue = role.hue ?? 0.474;
    const size = role.size || {};
    const geo = placeholderGeometry(slot, size);
    let raster;
    switch (slot) {
        case 'panel_h': raster = placeholderPanelH({ hue, ...size }); break;
        case 'panel_v': raster = placeholderPanelV({ hue, ...size }); break;
        case 'bar': raster = placeholderBar({ hue, ...size }); break;
        default: raster = placeholderStrip(size.width ?? 28, size.height ?? 27, { hue });
    }
    return { raster, nineSlice: geo.nineSlice, margins: geo.margins };
}

/**
 * 把装配结果写成一个皮肤目录。
 * @param {string} outDir
 * @param {{name:string,data:Uint8Array}[]} files
 */
export function writeSkinDir(outDir, files) {
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(join(outDir, f.name), Buffer.from(f.data));
    return outDir;
}

/**
 * 打包成 .ssf。
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{format?:'zip'|'v3', template?:string|null, skinName?:string}} [opts]
 * @returns {{data:Uint8Array, format:string, bytes:number, warnings:string[]}}
 */
export function buildSsf(files, opts = {}) {
    const warnings = [];
    const format = opts.format ?? 'zip';
    let sdLocal = undefined;
    let sdCentral = undefined;
    if (opts.template) {
        try {
            const t = readSkin(new Uint8Array(readFileSync(opts.template)));
            if (t.sd && t.sd.local) { sdLocal = t.sd.local; sdCentral = t.sd.central ?? undefined; }
            else warnings.push('模板 ' + basename(opts.template) + ' 是 ' + t.generation + ' 代际，没有 SD 字段可继承');
        } catch (e) { warnings.push('读取模板失败：' + String(e)); }
    }
    const data = writeSkin(files.map((f) => ({ name: f.name, data: f.data })), {
        format, sdLocal, sdCentral, ut: true,
    });
    return { data, format, bytes: data.length, warnings };
}

/**
 * 从皮肤目录反读回工程可用的信息（用于「拿别人的皮肤当模板」）。
 * @param {string} ssfPath
 */
export function inspectSsf(ssfPath) {
    const u8 = new Uint8Array(readFileSync(ssfPath));
    const skin = readSkin(u8);
    const iniEntry = skin.entries.find((e) => e.name.toLowerCase() === 'skin.ini');
    const doc = iniEntry ? new IniDoc(decodeIni(iniEntry.data)) : null;
    const images = skin.entries.filter((e) => /\.(png|bmp|jpg|jpeg)$/i.test(e.name)).map((e) => ({
        name: e.name, bytes: e.data.length,
    }));
    return { format: skin.generation, version: skin.version, entries: skin.entries.length, images, ini: doc ? doc.toString() : null, doc };
}
