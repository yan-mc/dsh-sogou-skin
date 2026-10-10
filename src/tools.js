// @ts-check
/**
 * 注册给 DSH 的工具面。
 * 设计原则：每个工具只做一件事、返回结构化结果；「怎么组合素材」这类判断留给模型。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename, isAbsolute } from 'node:path';
import { flattenSpec, minimalRequirements, BUTTON_SLOTS, PANEL_SLOTS, isKnownKey, knownSections, OVERLAY_PRESETS } from './skin/spec.js';
import { assembleSkin, buildSsf, initProject, inspectSsf, loadProject, saveProject, writeSkinDir } from './skin/assemble.js';
import { scanDirectory, formatScan, loadImage, probeImage } from './skin/probe.js';
import { suggestSlots } from './skin/spec.js';
import { renderMock, renderSheet, renderStretchTest, toPng, rasterizeFiles } from './skin/preview.js';
import { renderCandidateWindow, renderSizeSweep, renderRealistic, renderBgCheck } from './skin/render.js';
import { readSkin } from './ssf/container.js';
import { decodeIni, encodeIni, IniDoc } from './ssf/ini.js';
import { encodePng, decodePng, isPng } from './image/png.js';
import { encodeBmp24, decodeBmp, isBmp } from './image/bmp.js';
import * as R from './image/raster.js';

/** @param {string} p @param {string} [base] */
function abs(p, base) { return isAbsolute(p) ? p : resolve(base || process.cwd(), p); }

/** 统一的文本渲染器。 */
function textRender(_args, value) {
    if (typeof value === 'string') return [{ type: 'text', text: value }];
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

const emptySchema = { type: 'object', properties: {}, additionalProperties: true };

/**
 * @param {any} ctx
 * @param {{projectsRoot:string}} env
 */
export function registerTools(ctx, env) {
    const tools = ctx?.tools;
    if (!tools || typeof tools.register !== 'function') {
        return { registered: 0, reason: 'ctx.tools 服务不可用' };
    }
    let count = 0;

    /**
     * @param {string} name @param {string} description
     * @param {'read'|'write'|'destroy'|'idempotent'} behavior
     * @param {object} parameters
     * @param {(args:any)=>Promise<any>} execute
     */
    const reg = (name, description, behavior, parameters, execute) => {
        tools.register({
            name,
            description,
            behavior,
            parameters,
            readOnly: behavior === 'read',
            idempotent: behavior !== 'write',
            destructive: behavior === 'destroy',
            output: { schema: {}, render: textRender },
            execute: async (args) => {
                try { return await execute(args || {}); }
                catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
            },
            ...(behavior === 'read' ? { isConcurrencySafe: () => true } : {}),
        });
        count++;
    };

    const projectArgs = {
        type: 'object',
        properties: {
            dir: { type: 'string', description: '皮肤工程目录（含 skin.project.json）' },
        },
        required: ['dir'],
    };

    // ---------------- 1. 需求清单 ----------------
    reg('skin_requirements',
        '列出制作一套搜狗输入法皮肤需要哪些素材：分组、必需/可选、用途、尺寸建议、三态变体。做皮肤的第一步。',
        'read',
        { type: 'object', properties: {}, additionalProperties: false },
        async () => {
            const min = minimalRequirements();
            const groups = new Map();
            for (const s of flattenSpec()) {
                if (!groups.has(s.group)) groups.set(s.group, []);
                groups.get(s.group).push(s);
            }
            return {
                ok: true,
                minimal: min,
                groups: [...groups].map(([group, slots]) => ({ group, slots })),
                hint: '用户提供素材后，用 skin_scan_assets 扫描，再用 skin_assign 分配槽位。没有素材时可以先 skin_init 并让插件生成占位图跑通流程。',
            };
        });

    // ---------------- 2. 新建工程 ----------------
    reg('skin_init',
        '新建一个搜狗皮肤工程目录（skin.project.json + assets/ + preview/）。已有则报错，不会覆盖。',
        'write',
        {
            type: 'object',
            properties: {
                dir: { type: 'string', description: '工程目录；相对路径按 projectsRoot 解析' },
                name: { type: 'string', description: '皮肤名' },
                author: { type: 'string', description: '作者' },
                info: { type: 'string', description: '皮肤简介' },
                generatePlaceholders: { type: 'boolean', description: '是否直接生成占位素材以便立刻预览（默认 true）' },
            },
            required: ['dir'],
        },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            if (existsSync(join(dir, 'skin.project.json'))) {
                return { ok: false, error: '工程已存在：' + dir + '（如需重建请手动删除 skin.project.json）' };
            }
            const project = initProject(dir, { name: args.name || basename(dir), author: args.author, info: args.info });
            return { ok: true, dir, projectFile: join(dir, 'skin.project.json'), project };
        });

    // ---------------- 3. 扫描素材 ----------------
    reg('skin_scan_assets',
        '扫描一个目录里的所有图片，输出每张图的客观特征（尺寸/是否带 alpha/主导色相/内容区/格式），并给出「它最适合哪个槽位」的建议。AI 据此决定如何组合。',
        'read',
        {
            type: 'object',
            properties: {
                dir: { type: 'string', description: '素材目录，或皮肤工程目录（会自动用其 assets/）' },
                includeSuggestions: { type: 'boolean', description: '是否附带槽位建议（默认 true）' },
            },
            required: ['dir'],
        },
        async (args) => {
            const target = abs(args.dir, env.projectsRoot);
            const dir = existsSync(join(target, 'skin.project.json')) ? join(target, 'assets') : target;
            const scan = scanDirectory(dir, { recursive: true });
            const available = flattenSpec().map((s) => ({ slot: s.slot, group: s.group, label: s.label }));
            const files = scan.files.map((f) => ({
                ...f,
                suggestions: args.includeSuggestions === false ? undefined : suggestSlots(f, available),
            }));
            return {
                ok: true,
                dir: scan.dir,
                count: files.length,
                table: formatScan(scan),
                files,
                skipped: scan.skipped,
                next: '把选定的 slot->文件 映射传给 skin_assign；不确定的可以让用户确认。',
            };
        });

    // ---------------- 4. 分配槽位 ----------------
    reg('skin_assign',
        '把素材文件分配到皮肤槽位（写入 skin.project.json）。一次可以分配多个；也可以开 autoGenerate 让插件为缺失槽位生成占位图。',
        'write',
        {
            type: 'object',
            properties: {
                dir: { type: 'string' },
                assignments: {
                    type: 'array',
                    description: '槽位分配列表',
                    items: {
                        type: 'object',
                        properties: {
                            slot: { type: 'string', description: '槽位名，如 panel_h / panel_v / bar / cn_en' },
                            source: { type: 'string', description: '单张素材路径（相对工程目录）' },
                            sources: { type: 'object', description: '按变体分别给图，如 {"cn":"a.png","en":"b.png"}' },
                            sheet: { type: 'string', description: '拼图：由插件自动切分成各变体' },
                            nineSlice: { type: 'object', description: '九宫格边界 {left,right,top,bottom}，不给则自动探测' },
                            margins: { type: 'object', description: '{pinyin_marge:[t,b,l,r], zhongwen_marge:[t,b,l,r]}' },
                            generate: { type: 'boolean', description: '用占位图' },
                        },
                        required: ['slot'],
                    },
                },
                enableButtons: { type: 'array', items: { type: 'string' }, description: '启用哪些状态栏按钮' },
                theme: { type: 'object', description: '配色，例如 {"pinyinColor":"#8e4646"}' },
                overlays: {
                    type: 'array',
                    description: '候选窗浮层按钮（翻页/展开更多候选/自定义）。align 是 10 元组，本插件原样透传不做推导；可直接用 skin_overlay_presets 里的官方预设值。',
                    items: {
                        type: 'object',
                        properties: {
                            section: { type: 'string', enum: ['Scheme_H1', 'Scheme_V1', 'Scheme_H2', 'Scheme_V2'] },
                            name: { type: 'string', description: '如 pageup / pagedown / sugg / custom0；H2/V2 里可用 cand_ 或 comp_ 前缀' },
                            align: { type: 'string', description: '10 个整数，逗号分隔，例如 0,0,0,48,0,0,0,2,6,2' },
                            normal: { type: 'array', items: { type: 'string' }, description: '常态图（可多张，引擎按输入法状态二选一）' },
                            hover: { type: 'array', items: { type: 'string' } },
                            down: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['name', 'align', 'normal'],
                    },
                },
            },
            required: ['dir', 'assignments'],
        },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            const project = loadProject(dir);
            if (!project) return { ok: false, error: '找不到 ' + join(dir, 'skin.project.json') };
            const applied = [];
            for (const a of args.assignments || []) {
                const known = PANEL_SLOTS.some((s) => s.slot === a.slot) || BUTTON_SLOTS.some((s) => s.slot === a.slot);
                if (!known) return { ok: false, error: '未知槽位：' + a.slot, applied };
                const role = {};
                for (const k of ['source', 'sources', 'sheet', 'nineSlice', 'margins', 'generate', 'size', 'hue']) {
                    if (a[k] !== undefined) role[k] = a[k];
                }
                // 素材路径统一转成相对工程目录
                for (const k of ['source', 'sheet']) {
                    if (typeof role[k] === 'string') role[k] = relativeTo(dir, abs(role[k], env.projectsRoot));
                }
                if (role.sources) {
                    for (const [vk, vv] of Object.entries(role.sources)) role.sources[vk] = relativeTo(dir, abs(String(vv), env.projectsRoot));
                }
                project.roles[a.slot] = role;
                applied.push(a.slot);
            }
            if (args.enableButtons) project.buttons.enabled = args.enableButtons;
            if (args.theme) project.theme = { ...project.theme, ...args.theme };
            if (args.overlays) {
                project.overlays = args.overlays.map((o) => ({
                    section: o.section || 'Scheme_H1',
                    name: o.name,
                    align: String(o.align).trim(),
                    normal: (o.normal || []).map((p) => relativeTo(dir, abs(p, env.projectsRoot))),
                    hover: (o.hover || []).map((p) => relativeTo(dir, abs(p, env.projectsRoot))),
                    down: (o.down || []).map((p) => relativeTo(dir, abs(p, env.projectsRoot))),
                }));
            }
            saveProject(dir, project);
            const required = PANEL_SLOTS.filter((s) => s.required).map((s) => s.slot);
            const missingRequired = required.filter((s) => !project.roles[s]);
            return {
                ok: true, dir, applied, missingRequired,
                hint: missingRequired.length ? '这些必需槽位还没有素材：' + missingRequired.join(', ') + '（装配时会用占位图代替）' : '必需素材齐了，可以 skin_assemble。',
            };
        });

    // ---------------- 5. 装配 ----------------
    reg('skin_assemble',
        '按工程配置装配出完整皮肤：尺寸归一、格式转换、三态派生、九宫格推导、Skin.ini 生成。产物写入工程 build/ 目录。',
        'write',
        { ...projectArgs, properties: { ...projectArgs.properties, writeFiles: { type: 'boolean', description: '是否落盘（默认 true）' } } },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            const project = loadProject(dir);
            if (!project) return { ok: false, error: '找不到 skin.project.json' };
            const res = assembleSkin(project, dir);
            let outDir = null;
            if (args.writeFiles !== false) outDir = writeSkinDir(join(dir, project.outDir || 'build'), res.files);
            return {
                ok: true,
                outDir,
                fileCount: res.files.length,
                files: res.files.map((f) => ({ name: f.name, bytes: f.data.length })),
                warnings: res.warnings,
                layout: Object.fromEntries(Object.entries(res.layoutInfo).map(([k, v]) => [k, {
                    nineSlice: { left: v.nineSlice.left, right: v.nineSlice.right, top: v.nineSlice.top, bottom: v.nineSlice.bottom },
                    confidence: v.nineSlice.confidence, note: v.nineSlice.note,
                    margins: v.margins,
                }])),
                ini: res.ini,
            };
        });

    // ---------------- 6. 预览 ----------------
    reg('skin_preview',
        '生成皮肤预览图：一张「拟真图」（候选窗 + 状态栏 + 真实配色，直接由将要打包的字节渲染）和一张「素材总览表」。返回文件路径，可用 read_image 查看。',
        'write',
        {
            type: 'object',
            properties: {
                dir: { type: 'string' },
                width: { type: 'number', description: '预览画布宽度（默认 1180）' },
                sheet: { type: 'boolean', description: '是否同时输出素材总览表（默认 true）' },
            },
            required: ['dir'],
        },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            const project = loadProject(dir);
            if (!project) return { ok: false, error: '找不到 skin.project.json' };
            const res = assembleSkin(project, dir);
            const pvDir = join(dir, 'preview');
            mkdirSync(pvDir, { recursive: true });
            const mock = renderMock(res.files, { title: project.name || '皮肤预览', warnings: res.warnings, width: args.width });
            const mockPath = join(pvDir, 'preview.png');
            writeFileSync(mockPath, Buffer.from(toPng(mock)));
            let sheetPath = null;
            if (args.sheet !== false) {
                const sheet = renderSheet(res.files);
                sheetPath = join(pvDir, 'assets.png');
                writeFileSync(sheetPath, Buffer.from(toPng(sheet)));
            }
            const stretch = renderStretchTest(res.files);
            const stretchPath = join(pvDir, 'stretch.png');
            writeFileSync(stretchPath, Buffer.from(toPng(stretch)));
            // 引擎模型渲染出的"真实结果"，替代设计示意图
            const real = renderRealistic(res.files, { title: project.name || 'rendered skin' });
            const realPath = join(pvDir, 'render.png');
            writeFileSync(realPath, Buffer.from(toPng(real.raster)));
            // 白底/黑底对照：黑边类缺陷只在白底暴露。以前全在黑底上测，所以一直没发现。
            const bg = renderBgCheck(res.files);
            const bgPath = join(pvDir, 'bgcheck.png');
            writeFileSync(bgPath, Buffer.from(toPng(bg.raster)));
            if (bg.worst.length) {
                for (const w of bg.worst) res.warnings.push(w.name + '：边缘平均亮度 ' + w.avgEdgeLuma +
                    '，内部 ' + w.avgInterior + '（' + w.semi + ' 个边缘像素）。**请打开 bgcheck.png 在白底那一侧看一眼**——' +
                    '若确实是一圈比内部暗的硬边，就把勾边色从近黑换成整体配色里稍深一档的颜色；' +
                    '若那只是立绘本身的深色线稿，忽略即可（这条指标区分不了两者）。');
            }
            return {
                ok: true,
                render: realPath,
                bgcheck: bgPath,
                bgcheckIssues: bg.worst,
                renderNotes: real.notes,
                preview: mockPath,
                sheet: sheetPath,
                stretch: stretchPath,
                size: mock.width + 'x' + mock.height,
                warnings: res.warnings,
                hint: '**优先看 render.png** —— 那是按引擎模型（九宫格 + marge + pos）真渲染出来的结果，' +
                    '不是设计示意图。再看 assets（素材齐整度）与 stretch（九宫格在不同尺寸下会不会退化）。' +
                    'renderNotes 里出现 !! 说明九宫格退化，底图会被整图压扁。',
            };
        });

    // ---------------- 7. 细节修复 / 图片编辑 ----------------
    reg('skin_repair',
        '对单张素材做细节修复与编辑（这就是内置的小型图片编辑器）。支持：去背景色键、替换颜色、裁剪、缩放、等比适应、去透明边、色相迁移/归一、亮度饱和对比调整、加描边、拼图切分。可一次串联多个操作。',
        'write',
        {
            type: 'object',
            properties: {
                src: { type: 'string', description: '输入图片路径（PNG 或 BMP）' },
                out: { type: 'string', description: '输出图片路径（.png 或 .bmp）' },
                ops: {
                    type: 'array',
                    description: '按顺序执行的操作',
                    items: {
                        type: 'object',
                        properties: {
                            op: {
                                type: 'string',
                                enum: ['removeBackground', 'replaceColor', 'crop', 'resize', 'containFit', 'trim',
                                    'normalizeHue', 'hueShift', 'adjust', 'outline', 'flatten', 'describe'],
                            },
                            tol: { type: 'number' }, color: { type: 'string', description: '#rrggbb' },
                            x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
                            target: { type: 'string' }, replacement: { type: 'string' },
                            turns: { type: 'number' }, brightness: { type: 'number' }, saturation: { type: 'number' },
                            contrast: { type: 'number' }, thickness: { type: 'number' }, feather: { type: 'number' },
                        },
                        required: ['op'],
                    },
                },
            },
            required: ['src', 'ops'],
        },
        async (args) => {
            const src = abs(args.src, env.projectsRoot);
            const loaded = loadImage(src);
            if (!loaded.ok) return { ok: false, error: loaded.error };
            let r = loaded.raster;
            const log = [];
            const parseHex = (h) => {
                const n = parseInt(String(h).replace('#', ''), 16);
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            };
            for (const op of args.ops || []) {
                switch (op.op) {
                    case 'removeBackground': {
                        const n = R.removeBackground(r, { tol: op.tol ?? 18, feather: op.feather ?? 0 });
                        log.push('removeBackground tol=' + (op.tol ?? 18) + ' -> 移除 ' + n + ' 像素');
                        break;
                    }
                    case 'replaceColor': {
                        const t = parseHex(op.target); const rep = op.replacement ? parseHex(op.replacement) : null;
                        const n = R.replaceColor(r, [t[0], t[1], t[2], 255], op.tol ?? 12, rep ? [rep[0], rep[1], rep[2], 255] : null);
                        log.push('replaceColor -> ' + n + ' 像素');
                        break;
                    }
                    case 'crop': r = R.crop(r, op.x ?? 0, op.y ?? 0, op.width ?? r.width, op.height ?? r.height); log.push('crop -> ' + r.width + 'x' + r.height); break;
                    case 'resize': r = R.resize(r, op.width ?? r.width, op.height ?? r.height, 'bilinear'); log.push('resize -> ' + r.width + 'x' + r.height); break;
                    case 'containFit': r = R.containFit(r, op.width ?? r.width, op.height ?? r.height, 'bilinear'); log.push('containFit -> ' + r.width + 'x' + r.height); break;
                    case 'trim': r = R.trim(r, op.tol ?? 2); log.push('trim -> ' + r.width + 'x' + r.height); break;
                    case 'normalizeHue': { const d = R.normalizeHue(r, op.turns ?? 0.5); log.push('normalizeHue -> 位移 ' + (d * 360).toFixed(0) + '°'); break; }
                    case 'hueShift': R.hueShift(r, op.turns ?? 0); log.push('hueShift ' + ((op.turns ?? 0) * 360).toFixed(0) + '°'); break;
                    case 'adjust': R.adjust(r, { brightness: op.brightness ?? 1, saturation: op.saturation ?? 1, contrast: op.contrast ?? 1 }); log.push('adjust'); break;
                    case 'outline': { const c = parseHex(op.color || '#ffffff'); R.outline(r, [c[0], c[1], c[2], 255], op.thickness ?? 1); log.push('outline'); break; }
                    case 'flatten': {
                        const bg = op.color ? parseHex(op.color) : [255, 255, 255];
                        for (let i = 0; i < r.data.length; i += 4) {
                            const a = r.data[i + 3] / 255;
                            r.data[i] = Math.round(r.data[i] * a + bg[0] * (1 - a));
                            r.data[i + 1] = Math.round(r.data[i + 1] * a + bg[1] * (1 - a));
                            r.data[i + 2] = Math.round(r.data[i + 2] * a + bg[2] * (1 - a));
                            r.data[i + 3] = 255;
                        }
                        log.push('flatten');
                        break;
                    }
                    case 'describe': log.push('describe: ' + JSON.stringify(probeImage(r))); break;
                    default: return { ok: false, error: '未知操作：' + op.op, log };
                }
            }
            const out = abs(args.out || src.replace(/\.[^.]+$/, '') + '.edited.png', env.projectsRoot);
            mkdirSync(join(out, '..'), { recursive: true });
            const ext = out.toLowerCase().endsWith('.bmp') ? 'bmp' : 'png';
            writeFileSync(out, Buffer.from(ext === 'bmp' ? encodeBmp24(r) : encodePng(r)));
            return { ok: true, out, size: r.width + 'x' + r.height, log, probe: probeImage(r) };
        });

    // ---------------- 8. 打包 ----------------
    reg('skin_pack',
        '把皮肤工程打包成 .ssf。format=zip 产出明文 ZIP 代际（皮肤编辑器可再打开、社区通行）；format=v3 产出商店加密代际。可用 template 继承模板的私有 SD 字段。',
        'write',
        {
            type: 'object',
            properties: {
                dir: { type: 'string' },
                out: { type: 'string', description: '.ssf 输出路径；默认写到工程根目录' },
                format: { type: 'string', enum: ['zip', 'v3'], description: '默认 zip' },
                template: { type: 'string', description: '可选：从某个已有 .ssf 继承私有字段' },
            },
            required: ['dir'],
        },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            const project = loadProject(dir);
            if (!project) return { ok: false, error: '找不到 skin.project.json' };
            const res = assembleSkin(project, dir);
            const format = args.format === 'v3' ? 'v3' : 'zip';
            const out = abs(args.out || join(dir, (project.name || 'skin') + (format === 'v3' ? '.store.ssf' : '.ssf')), env.projectsRoot);
            const built = buildSsf(res.files, { format, template: args.template ? abs(args.template, env.projectsRoot) : null });
            mkdirSync(join(out, '..'), { recursive: true });
            writeFileSync(out, Buffer.from(built.data));
            const back = readSkin(built.data);
            return {
                ok: true, out, bytes: built.bytes, format: built.format,
                entries: back.entries.length,
                warnings: [...res.warnings, ...built.warnings],
                ini: res.ini,
            };
        });

    // ---------------- 9. 解析皮肤包 ----------------
    reg('skin_inspect',
        '解析一个 .ssf 皮肤包：识别代际（明文 ZIP / 加密 v3）、列出全部条目、输出完整 Skin.ini。可用来「拿别人的皮肤当参考」。',
        'read',
        { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] },
        async (args) => {
            const f = abs(args.file, env.projectsRoot);
            const info = inspectSsf(f);
            return { ok: true, file: f, format: info.format, version: info.version, entries: info.entries, images: info.images, ini: info.ini };
        });

    // ---------------- 10. 解包 ----------------
    reg('skin_unpack',
        '把 .ssf 解包到目录（v3 加密代际会自动解密），并额外导出一份 UTF-8 的 Skin.ini 便于查看。',
        'write',
        {
            type: 'object',
            properties: { file: { type: 'string' }, outDir: { type: 'string' } },
            required: ['file'],
        },
        async (args) => {
            const f = abs(args.file, env.projectsRoot);
            const outDir = abs(args.outDir || join(env.projectsRoot, basename(f).replace(/\.[^.]+$/, '') + '_unpacked'), env.projectsRoot);
            const skin = readSkin(new Uint8Array(readFileSync(f)));
            mkdirSync(outDir, { recursive: true });
            for (const e of skin.entries) writeFileSync(join(outDir, e.name), Buffer.from(e.data));
            const ini = skin.entries.find((e) => e.name.toLowerCase() === 'skin.ini');
            if (ini) writeFileSync(join(outDir, 'Skin.ini.utf8.txt'), decodeIni(ini.data), 'utf8');
            return { ok: true, outDir, format: skin.generation, files: skin.entries.map((e) => e.name) };
        });

    // ---------------- 11. 校验 ----------------
    reg('skin_validate',
        '校验一套皮肤是否完整可用：必需面板是否齐、Skin.ini 引用的文件是否存在、图标尺寸是否一致、颜色是否是合法 BGR、体积是否超限。',
        'read',
        { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] },
        async (args) => {
            const dir = abs(args.dir, env.projectsRoot);
            const project = loadProject(dir);
            if (!project) return { ok: false, error: '找不到 skin.project.json' };
            const res = assembleSkin(project, dir);
            const names = new Set(res.files.map((f) => f.name));
            const doc = new IniDoc(res.ini);
            const errors = [];
            const warns = [...res.warnings];
            // Skin.ini 里引用的每个文件都要存在
            for (const sec of doc.sections()) {
                for (const [k, v] of Object.entries(doc.section(sec))) {
                    if (!/^(pic|.*_pic|cn_en|.*_hover|.*_down|biaodian|quan_ban|quan_shuang|fan_jian|softkeyboard|menu|sogousearch|passport|skinmanager)$/.test(k)) continue;
                    for (const fn of String(v).split(',')) {
                        const t = fn.trim();
                        if (t && !names.has(t)) errors.push('[' + sec + '] ' + k + ' 引用了不存在的文件 ' + t);
                    }
                }
            }
            // 键名对照官方默认皮肤词表（Skin.dat 里那份 8964 字节的 Skin.ini）
            const unknownSection = [];
            const unknownKeys = [];
            for (const sec of doc.sections()) {
                if (!knownSections().includes(sec)) { unknownSection.push(sec); continue; }
                for (const k of Object.keys(doc.section(sec))) {
                    if (!isKnownKey(sec, k)) unknownKeys.push('[' + sec + '] ' + k);
                }
            }
            if (unknownSection.length) warns.push('段落名不在官方词表内（可能是拼写错误）：' + unknownSection.join(', '));
            if (unknownKeys.length) warns.push('键名不在官方词表内（引擎可能忽略它们）：' + unknownKeys.slice(0, 12).join(', ') + (unknownKeys.length > 12 ? ' 等 ' + unknownKeys.length + ' 个' : ''));
            // ---- 九宫格退化体检（这是"整张图被压扁/拉长"的根因）----
            // 引擎要按九宫格把底图铺到 W×H。若 left+right >= W 或 top+bottom >= H，
            // 九宫格不成立，引擎只能整图缩放 —— 变形就是这么来的。
            const probe = (scheme, sizes) => {
                const bad = [];
                for (const [w, h] of sizes) {
                    try {
                        const r = renderCandidateWindow(res.files, { scheme, width: w, height: h });
                        if (r.notes.some((n) => n.startsWith('!!'))) bad.push(w + 'x' + h);
                    } catch { /* 忽略单点失败 */ }
                }
                return bad;
            };
            // 尺寸要取【真机实测过的量级】。早先我填 26/32/44 这种高度，结果把两张正常皮肤
            // 全报成"退化"——真实横排窗高约等于底图高（实测 251~268 逻辑像素），根本不会那么矮。
            const hBad = probe('Scheme_H1', [[460, 236], [640, 258], [900, 258], [1100, 268]]);
            const vBad = probe('Scheme_V1', [[420, 300], [520, 428], [640, 560], [720, 700]]);
            if (hBad.length) errors.push('九宫格退化：横排候选窗在 ' + hBad.join(' / ') + ' 这些尺寸下，左右或上下内缩之和 ≥ 目标尺寸，' +
                '引擎会退回整图缩放 → 整张底图被压扁拉长。**只在真正会变的那根轴上给内缩，另一轴给 0,1**');
            if (vBad.length) errors.push('九宫格退化：竖排候选窗在 ' + vBad.join(' / ') + ' 这些尺寸下会整图缩放，同上');

            // 体积
            const total = res.files.reduce((a, f) => a + f.data.length, 0);
            if (total > 600 * 1024) warns.push('未压缩总体积 ' + Math.round(total / 1024) + ' KB，超过商店 600KB 上限（打包后会压缩，但仍建议留意）');
            return {
                ok: errors.length === 0,
                fileCount: res.files.length,
                rawBytes: total,
                errors, warnings: warns,
                summary: errors.length === 0 ? '校验通过' : errors.length + ' 个错误',
            };
        });

    // ---------------- 11.5 浮层定位预设 ----------------
    reg('skin_overlay_presets',
        '列出从本机 5 个官方内置皮肤里抽出的 *_align 十元组预设，以及目前对十元组语义的逆向结论。做候选窗翻页/展开浮层时从这里取值，不要自己编。',
        'read',
        { type: 'object', properties: {}, additionalProperties: false },
        async () => ({
            ok: true,
            presets: OVERLAY_PRESETS,
            decoded: {
                confirmed: [
                    'a[2] / a[3] = 按钮中心相对锚点的 (dx, dy) 偏移 —— 竖排里只有 a[2] 变、横排里只有 a[3] 变；三个皮肤竖排下 a[2] 之和恒为 32（两按钮居中排在 32px 带子上），间距与图标宽度+间隙吻合',
                    'a[7] / a[8] 是布局常量：横排 (2,6)，竖排 (0,8) —— 三个皮肤完全一致',
                    'a[9] 与方案族相关：Scheme_*1 → 2，Scheme_*2 → 0（custom 类浮层例外）',
                ],
                unknown: 'a[0] a[1] a[4] a[5] a[6] 的确切含义未解。因此本插件原样透传 align，不做推导。',
            },
            usage: '把预设值直接传给 skin_assign 的 overlays[].align，并配好自己的箭头/图标图片。',
        }));

    // ---------------- 12. 安装到本机搜狗 ----------------
    reg('skin_install',
        '把打包好的 .ssf 复制进本机搜狗输入法的皮肤目录（自动探测安装位置）。只做文件复制，不改注册表、不改配置。可用 dryRun 先看会写到哪。',
        'write',
        {
            type: 'object',
            properties: {
                file: { type: 'string', description: '.ssf 皮肤包路径' },
                target: { type: 'string', description: '可选：手动指定皮肤目录，覆盖自动探测' },
                dryRun: { type: 'boolean', description: '只探测与校验，不实际写入（默认 false）' },
            },
            required: ['file'],
        },
        async (args) => {
            const file = abs(args.file, env.projectsRoot);
            if (!existsSync(file)) return { ok: false, error: '找不到皮肤包：' + file };
            const size = readFileSync(file).length;
            // 先验证是合法皮肤包
            let info;
            try { info = inspectSsf(file); }
            catch (e) { return { ok: false, error: '不是合法皮肤包：' + String(e) }; }
            const targets = args.target ? [abs(args.target, env.projectsRoot)] : detectSogouSkinDirs();
            if (!targets.length) {
                return {
                    ok: false,
                    error: '没有找到本机搜狗输入法的皮肤目录。请用 target 手动指定，或确认已安装搜狗输入法。',
                    searched: SOGOU_HINTS,
                };
            }
            const written = [];
            for (const dir of targets) {
                const dest = join(dir, basename(file));
                if (args.dryRun) { written.push({ dir, dest, written: false, exists: existsSync(dest) }); continue; }
                try {
                    mkdirSync(dir, { recursive: true });
                    writeFileSync(dest, readFileSync(file));
                    written.push({ dir, dest, written: true, exists: true });
                } catch (e) {
                    written.push({ dir, dest, written: false, error: String(e && e.message ? e.message : e) });
                }
            }
            return {
                ok: written.some((w) => w.written) || !!args.dryRun,
                file, bytes: size, format: info.format, version: info.version, entries: info.entries,
                dryRun: !!args.dryRun, targets: written,
                hint: '文件已就位。若搜狗输入法正在运行，到「属性设置 → 皮肤」里应能看到它；' +
                    '没看到就重启一下输入法（皮肤目录是启动时扫描的）。',
            };
        });

    reg('skin_list_installed',
        '列出本机搜狗输入法皮肤目录里已安装的皮肤。',
        'read',
        { type: 'object', properties: { target: { type: 'string' } }, additionalProperties: false },
        async (args) => {
            const dirs = args.target ? [abs(args.target, env.projectsRoot)] : detectSogouSkinDirs();
            const out = [];
            for (const dir of dirs) {
                const items = [];
                if (existsSync(dir)) {
                    for (const n of readdirSync(dir)) {
                        if (!/\.ssf$/i.test(n)) continue;
                        const p = join(dir, n);
                        let meta = {};
                        try {
                            const i = inspectSsf(p);
                            meta = { format: i.format, version: i.version, entries: i.entries };
                        } catch (e) { meta = { error: '无法解析' }; }
                        items.push({ name: n, bytes: readFileSync(p).length, ...meta });
                    }
                }
                out.push({ dir, exists: existsSync(dir), count: items.length, skins: items });
            }
            return { ok: true, dirs: out };
        });

    return { registered: count };
}

/** 本机搜狗输入法皮肤目录的候选位置（只做存在性探测，不做任何写入）。 */
const SOGOU_HINTS = [
    'C:\\Program Files (x86)\\SogouYSInput\\*\\AllSkin',
    'C:\\Program Files\\SogouYSInput\\*\\AllSkin',
    'C:\\Program Files (x86)\\SogouInput\\*\\AllSkin',
    'C:\\Program Files\\SogouInput\\*\\AllSkin',
    'D:\\SogouInput\\*\\AllSkin',
    '%APPDATA%\\SogouInput\\*\\AllSkin',
    '%LOCALAPPDATA%\\SogouInput\\*\\AllSkin',
];

/** @returns {string[]} 实际存在的皮肤目录 */
function detectSogouSkinDirs() {
    /** @type {string[]} */
    const found = [];
    const roots = [
        'C:\\Program Files (x86)\\SogouYSInput',
        'C:\\Program Files\\SogouYSInput',
        'C:\\Program Files (x86)\\SogouInput',
        'C:\\Program Files\\SogouInput',
        'D:\\SogouInput',
        join(process.env.APPDATA || '', 'SogouInput'),
        join(process.env.LOCALAPPDATA || '', 'SogouInput'),
        // 实测有效：搜狗医生版把用户皮肤放在 LocalLow\SogouYS 下（不是 Local，也不是 APPDATA）
        join(process.env.LOCALAPPDATA || '', 'Low', 'SogouYS'),
        join(process.env.LOCALAPPDATA || '', 'Low', 'SogouInput'),
        join(process.env.USERPROFILE || '', 'AppData', 'LocalLow', 'SogouYS'),
        join(process.env.USERPROFILE || '', 'AppData', 'LocalLow', 'SogouInput'),
    ];
    for (const root of roots) {
        if (!root || !existsSync(root)) continue;
        // 直接就是 AllSkin 的情况
        const direct = join(root, 'AllSkin');
        if (existsSync(direct)) found.push(direct);
        // 版本子目录里的 AllSkin
        try {
            for (const sub of readdirSync(root)) {
                const p = join(root, sub, 'AllSkin');
                if (existsSync(p)) found.push(p);
            }
        } catch { /* 无权限就跳过 */ }
    }
    return [...new Set(found)];
}

/** @param {string} from @param {string} to */
function relativeTo(from, to) {
    const f = from.replace(/\\/g, '/').replace(/\/$/, '');
    const t = to.replace(/\\/g, '/');
    if (t.startsWith(f + '/')) return t.slice(f.length + 1);
    return t;
}
