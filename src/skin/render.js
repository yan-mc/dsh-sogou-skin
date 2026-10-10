// @ts-check
/**
 * 候选窗/状态栏渲染器 —— 按搜狗引擎的模型把皮肤"真正画一遍"。
 *
 * 与旧的 preview.js 的区别：
 *   · preview.js 画的是【设计示意图】，窗口尺寸是我随手定的，看不出真实渲染的毛病；
 *   · 本模块画的是【按九宫格模型渲染出来的窗口】，窗口尺寸是显式输入，
 *     并且会把"九宫格退化"（内缩之和 ≥ 目标尺寸）这类致命问题直接报出来。
 *
 * 模型（来自对 7 个真实皮肤的实测，以及 UIPlugin.dll 里 SkinConfigFile 的类结构）：
 *   1. 引擎按内容算出一个窗口尺寸 W×H；
 *   2. 用 layout_horizontal = mode,left,right 与 layout_vertical = mode,top,bottom
 *      把底图按九宫格拉伸到 W×H：四角原样、四边单向拉、中间双向拉；
 *   3. 文字按 *_marge = top,bottom,left,right 的内边距摆放；
 *   4. 状态栏按钮按 *_pos 摆放（状态栏底图不参与拉伸）。
 *
 * ⚠️ 这里的 W/H 是【模型假设】。真实引擎怎么算 W/H 我还没拿到确证，
 *    所以本模块把 W/H 暴露成参数，并且提供 renderSizeSweep() 把同一张底图在多个尺寸下渲染出来，
 *    方便和真机截图逐一对齐。
 */
import { create, resize, nineSlice, clone } from '../image/raster.js';
import { decodePng } from '../image/png.js';
import { decodeBmp } from '../image/bmp.js';
import { decodeIni, IniDoc, bgrToRgb, parseIniNumber } from '../ssf/ini.js';
import { drawText, measureText } from '../image/font5x7.js';
import { isPng } from '../image/png.js';
import { isBmp } from '../image/bmp.js';

/** @param {{name:string,data:Uint8Array}[]} files */
export function decodeAll(files) {
    /** @type {Map<string, import('../image/png.js').Raster>} */
    const m = new Map();
    for (const f of files) {
        try {
            if (isPng(f.data)) m.set(f.name, decodePng(f.data));
            else if (isBmp(f.data)) m.set(f.name, decodeBmp(f.data));
        } catch { /* 跳过坏图 */ }
    }
    return m;
}

/** @param {{name:string,data:Uint8Array}[]} files */
export function readIniDoc(files) {
    const e = files.find((f) => f.name.toLowerCase() === 'skin.ini');
    return e ? new IniDoc(decodeIni(e.data)) : null;
}

/** 把 'a,b,c' 解析成数字数组。 */
function nums(s, n) {
    const a = String(s ?? '').split(',').map((x) => Number(x.trim()));
    while (a.length < n) a.push(0);
    return a;
}

/**
 * 把底图按九宫格铺到 targetW×targetH，并把退化情况报出来。
 * @param {import('../image/png.js').Raster} pic
 * @param {{left:number,right:number,top:number,bottom:number}} ns
 * @param {number} targetW @param {number} targetH
 * @returns {{raster: import('../image/png.js').Raster, degenerate: boolean, reason: string}}
 */
export function stretchPanel(pic, ns, targetW, targetH) {
    // 内缩先夹到源图尺寸之内。
    // 真实皮肤里内缩之和可以【超过源图】（苍翠欲滴 30+95=125 > 宽 120），引擎显然是夹住处理的，
    // 不能因此判定退化 —— 之前就是这里判错，把一张正常皮肤画成了废图。
    const L = Math.min(Math.max(0, ns.left | 0), Math.max(0, pic.width - 1));
    const R = Math.min(Math.max(0, ns.right | 0), Math.max(0, pic.width - 1 - L));
    const T = Math.min(Math.max(0, ns.top | 0), Math.max(0, pic.height - 1));
    const B = Math.min(Math.max(0, ns.bottom | 0), Math.max(0, pic.height - 1 - T));
    // layout_* 第一个数是模式：0 = 拉伸，1 = 平铺。（样本里两种都有，例如「苍翠欲滴」用 1,30,95）
    // 平铺模式下中段是重复贴而不是拉伸，所以即使内缩之和大于目标尺寸也不会退化。
    const tiled = (ns.mode | 0) === 1;
    if (tiled && L + R < pic.width && T + B < pic.height) {
        const out = create(targetW, targetH, [0, 0, 0, 0]);
        const midW = pic.width - L - R, midH = pic.height - T - B;
        const corner = (sx, sy, dx, dy) => {
            const w = Math.min(sx === 0 ? L : R, targetW), h = Math.min(sy === 0 ? T : B, targetH);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const s = ((sy === 0 ? y : pic.height - h + y) * pic.width + (sx === 0 ? x : pic.width - w + x)) * 4;
                const d = ((dy === 0 ? y : targetH - h + y) * targetW + (dx === 0 ? x : targetW - w + x)) * 4;
                if (d + 3 < out.data.length) { out.data[d] = pic.data[s]; out.data[d+1] = pic.data[s+1]; out.data[d+2] = pic.data[s+2]; out.data[d+3] = pic.data[s+3]; }
            }
        };
        corner(0, 0, 0, 0); corner(1, 0, 1, 0); corner(0, 1, 0, 1); corner(1, 1, 1, 1);
        // 上下边：横向平铺
        for (let x = 0; x < targetW - L - R; x++) {
            const sx = L + (x % midW);
            for (let y = 0; y < T; y++) {
                for (const [sy, dy] of [[y, y], [pic.height - B + (T - 1 - y), targetH - T + (T - 1 - y)]]) {
                    const s = (sy * pic.width + sx) * 4, d = (dy * targetW + L + x) * 4;
                    if (d + 3 < out.data.length) { out.data[d]=pic.data[s]; out.data[d+1]=pic.data[s+1]; out.data[d+2]=pic.data[s+2]; out.data[d+3]=pic.data[s+3]; }
                }
            }
        }
        // 中间：双向平铺
        for (let y = 0; y < targetH - T - B; y++) {
            const sy = T + (y % midH);
            for (let x = 0; x < targetW - L - R; x++) {
                const sx = L + (x % midW);
                const s = (sy * pic.width + sx) * 4, d = ((T + y) * targetW + L + x) * 4;
                if (d + 3 < out.data.length) { out.data[d]=pic.data[s]; out.data[d+1]=pic.data[s+1]; out.data[d+2]=pic.data[s+2]; out.data[d+3]=pic.data[s+3]; }
            }
        }
        return { raster: out, degenerate: false, reason: '平铺模式' };
    }
    let degenerate = false;
    const why = [];
    // 注意是【严格大于】。原版雷电将军 layout_horizontal=0,100,300，L+R=400 正好等于窗口宽 400，
    // 此时中段为 0、整图 1:1 落位 —— 这是合法设计，不是退化。
    if (L + R > targetW) { degenerate = true; why.push('左右内缩 ' + L + '+' + R + ' > 目标宽 ' + targetW); }
    if (T + B > targetH) { degenerate = true; why.push('上下内缩 ' + T + '+' + B + ' > 目标高 ' + targetH); }
    if (L + R >= pic.width) { degenerate = true; why.push('左右内缩 ' + (L + R) + ' >= 底图宽 ' + pic.width); }
    if (T + B >= pic.height) { degenerate = true; why.push('上下内缩 ' + (T + B) + ' >= 底图高 ' + pic.height); }
    if (degenerate) {
        // 引擎在九宫格无法成立时只能整图缩放 —— 这正是"严重纵向拉伸"的来源
        return { raster: resize(pic, targetW, targetH, 'bilinear'), degenerate: true, reason: why.join('；') };
    }
    return {
        raster: nineSlice(pic, targetW, targetH, { left: L, right: R, top: T, bottom: B, mode: 'stretch' }),
        degenerate: false,
        reason: '',
    };
}

/**
 * 渲染一个候选窗。
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{scheme?:string, width:number, height:number, pinyin?:string, candidates?:string[],
 *          selected?:number, fontScale?:number, report?:object}} opts
 */
export function renderCandidateWindow(files, opts) {
    const doc = readIniDoc(files);
    const rasters = decodeAll(files);
    const scheme = opts.scheme || 'Scheme_H1';
    const W = Math.max(8, Math.round(opts.width));
    const H = Math.max(8, Math.round(opts.height));
    const canvas = create(W, H, [0, 0, 0, 0]);
    const notes = [];
    if (!doc) return { raster: canvas, notes: ['没有 Skin.ini'] };

    const picName = doc.get(scheme, 'pic');
    const pic = picName ? rasters.get(picName) : null;
    if (!pic) return { raster: canvas, notes: [scheme + ' 没有 pic 或图片缺失'] };

    const lh = nums(doc.get(scheme, 'layout_horizontal'), 3);
    const lv = nums(doc.get(scheme, 'layout_vertical'), 3);
    const ns = { mode: lh[0], left: lh[1], right: lh[2], top: lv[1], bottom: lv[2] };
    const st = stretchPanel(pic, ns, W, H);
    canvas.data.set(st.raster.data);
    if (st.degenerate) notes.push('!! 九宫格退化（' + st.reason + '）→ 引擎只能整图缩放，必然变形');
    if (opts.report) {
        opts.report.scheme = scheme; opts.report.pic = picName; opts.report.picSize = pic.width + 'x' + pic.height;
        opts.report.nineSlice = ns; opts.report.target = W + 'x' + H;
        opts.report.degenerate = st.degenerate; opts.report.reason = st.reason;
    }

    const pm = nums(doc.get(scheme, 'pinyin_marge'), 4);
    const zm = nums(doc.get(scheme, 'zhongwen_marge'), 4);
    const fs = parseIniNumber(doc.get('Display', 'font_size')) ?? 16;
    const scale = Math.max(1, Math.round((opts.fontScale ?? 1) * fs / 7));
    const col = (k, def) => { const v = parseIniNumber(doc.get('Display', k)); if (v === undefined) return def; const c = bgrToRgb(v); return [c.r, c.g, c.b]; };
    const cPinyin = col('pinyin_color', [40, 40, 40]);
    const cFirst = col('zhongwen_first_color', [200, 60, 60]);
    const cOther = col('zhongwen_color', [90, 90, 90]);

    // ---- 两排文字的位置模型 ----
    // 用真机渲染标定出来的（对着 Sogou 自己生成的 10 张预览图 + 两个第三方皮肤的 ini 值反推）：
    //   · 拼音行  y = pinyin_marge[0]                      —— 相对窗口原点的绝对 y
    //   · 候选行  y = pinyin_marge[0] + font_size + zhongwen_marge[0]
    // 校验：雷电将军 195+16+7=218（真机 213..224）；原神 104+16+8=128（真机 128..139）。
    // 顺带纠正一个更早的错误：候选窗里是【上下两排】文字（拼音在上、候选在下），不是一个横条。
    const row1Y = pm[0];
    const row2Y = pm[0] + Math.round(fs) + zm[0];
    if (opts.report) { opts.report.row1Y = row1Y; opts.report.row2Y = row2Y; }
    if (opts.pinyin) {
        drawText(canvas, opts.pinyin.toUpperCase(), pm[2], row1Y, [cPinyin[0], cPinyin[1], cPinyin[2], 255], scale);
    }
    // 候选词
    const cands = opts.candidates || [];
    const cw = Math.round(fs * 1.9);
    let x = zm[2];
    const y = row2Y;
    for (let i = 0; i < cands.length; i++) {
        if (x + cw > W - zm[3]) { notes.push('只能放下 ' + i + ' 个候选（右边距 ' + zm[3] + '）'); break; }
        const c = i === (opts.selected ?? 0) ? cFirst : cOther;
        drawText(canvas, String(i + 1) + '.', x + 2, y + 4, [c[0], c[1], c[2], 255], 1);
        // 词本身用块示意（本模块不带中文字库）
        for (let k = 0; k < cw - 14; k++) {
            for (let hh = 0; hh < Math.round(fs * 1.05); hh++) {
                const px = x + 14 + k, py = y + 1 + hh;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                const idx = (py * W + px) * 4;
                const a = 0.80;
                canvas.data[idx] = Math.round(canvas.data[idx] * (1 - a) + c[0] * a);
                canvas.data[idx + 1] = Math.round(canvas.data[idx + 1] * (1 - a) + c[1] * a);
                canvas.data[idx + 2] = Math.round(canvas.data[idx + 2] * (1 - a) + c[2] * a);
                canvas.data[idx + 3] = Math.max(canvas.data[idx + 3], 210);
            }
        }
        x += cw;
    }
    return { raster: canvas, notes };
}

/**
 * 同一条底图，在多个目标尺寸下渲染 —— 用来和真机截图逐尺寸对齐。
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{scheme?:string, sizes:number[][], labels?:string[]}} opts
 */
export function renderSizeSweep(files, opts) {
    const scheme = opts.scheme || 'Scheme_H1';
    const items = [];
    for (const [w, h] of opts.sizes) {
        const r = renderCandidateWindow(files, { scheme, width: w, height: h, pinyin: 'ni hao', candidates: ['x', 'x', 'x', 'x', 'x'] });
        items.push({ w, h, raster: r.raster, notes: r.notes });
    }
    const pad = 14, lab = 16;
    const W = pad + items.reduce((a, it) => a + it.raster.width + pad, 0);
    const H = 40 + Math.max(...items.map((it) => it.raster.height)) + lab + pad;
    const sheet = create(Math.max(W, 400), Math.max(H, 80), [22, 22, 28, 255]);
    drawText(sheet, 'SIZE SWEEP  ' + scheme, pad, 8, [235, 235, 245, 255], 1);
    let x = pad;
    for (const it of items) {
        // 棋盘底，方便看透明
        for (let yy = 0; yy < it.raster.height; yy += 8) {
            for (let xx = 0; xx < it.raster.width; xx += 8) {
                const c = (((xx >> 3) + (yy >> 3)) & 1) ? [52, 52, 60] : [40, 40, 48];
                for (let b = 0; b < 8 && xx + b < it.raster.width; b++) {
                    for (let a = 0; a < 8 && yy + a < it.raster.height; a++) {
                        const i = ((yy + a) * sheet.width + (x + xx + b)) * 4;
                        if (i + 3 < sheet.data.length) { sheet.data[i] = c[0]; sheet.data[i+1] = c[1]; sheet.data[i+2] = c[2]; sheet.data[i+3] = 255; }
                    }
                }
            }
        }
        // 贴图
        for (let yy = 0; yy < it.raster.height; yy++) {
            for (let xx = 0; xx < it.raster.width; xx++) {
                const s = (yy * it.raster.width + xx) * 4;
                const d = (yy + 30) * sheet.width + (x + xx);
                if (d * 4 + 3 >= sheet.data.length) continue;
                const a = it.raster.data[s + 3] / 255;
                if (a <= 0) continue;
                sheet.data[d*4] = Math.round(sheet.data[d*4] * (1 - a) + it.raster.data[s] * a);
                sheet.data[d*4+1] = Math.round(sheet.data[d*4+1] * (1 - a) + it.raster.data[s+1] * a);
                sheet.data[d*4+2] = Math.round(sheet.data[d*4+2] * (1 - a) + it.raster.data[s+2] * a);
                sheet.data[d*4+3] = 255;
            }
        }
        const bad = it.notes.some((n) => n.startsWith('!!'));
        drawText(sheet, it.w + 'x' + it.h + (bad ? '  DEGENERATE' : ''), x, 30 + it.raster.height + 2,
            bad ? [255, 110, 110, 255] : [180, 210, 200, 255], 1);
        x += it.raster.width + pad;
    }
    return { raster: sheet, items };
}
/**
 * 「真实渲染」预览 —— 用引擎模型把皮肤画一遍，替代过去那张设计示意图。
 *
 * 画三样东西，全部走九宫格 + marge + pos 的真实路径：
 *   1. 横排候选窗（按引擎最可能给出的尺寸）
 *   2. 竖排候选窗（候选多的样子）
 *   3. 状态栏（底图按原尺寸，按钮按 _pos 摆放）
 *
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{hSize?:number[], vSize?:number[], statusButtons?:string[], title?:string}} [opts]
 */
export function renderRealistic(files, opts = {}) {
    const doc = readIniDoc(files);
    const rasters = decodeAll(files);
    // 窗口尺寸默认取底图的【原始尺寸】。
    // 依据：pinyin_marge[0] 是窗口内的绝对 y（雷电将军 195 / 原神 104），
    // 而这两个值都落在各自底图的文字面板里 —— 只有窗口高≈底图高时才对得上。
    // 之前我随手用 820x46 渲染，文字全跑到窗口外面去了，那种预览毫无参考价值。
    const picSize = (scheme) => {
        const n = doc ? doc.get(scheme, 'pic') : null;
        const r = n ? rasters.get(n) : null;
        return r ? [r.width, r.height] : [700, 200];
    };
    const hSize = opts.hSize ?? picSize('Scheme_H1');
    const vSize = opts.vSize ?? picSize('Scheme_V1');
    const pad = 22, gap = 20, labelH = 18, headH = 30;

    const cands = ['x', 'x', 'x', 'x', 'x', 'x'];
    const hw = renderCandidateWindow(files, { scheme: 'Scheme_H1', width: hSize[0], height: hSize[1], pinyin: 'ni hao', candidates: cands, selected: 0 });
    const vw = renderCandidateWindow(files, { scheme: 'Scheme_V1', width: vSize[0], height: vSize[1], pinyin: 'ni hao', candidates: ['x', 'x', 'x', 'x', 'x', 'x', 'x'], selected: 0 });

    // 状态栏
    const barName = doc ? doc.get('StatusBar', 'pic') : null;
    const bar = barName ? rasters.get(barName) : null;
    const btns = opts.statusButtons ?? ['cn_en', 'quan_ban', 'biaodian', 'fan_jian', 'softkeyboard', 'menu'];
    let barW = bar ? bar.width : 0, barH = bar ? bar.height : 0;
    for (const b of btns) {
        const pos = String(doc?.get('StatusBar', b + '_pos') || '').split(',').map(Number);
        if (pos.length === 2 && !isNaN(pos[0])) { barW = Math.max(barW, pos[0] + 20); barH = Math.max(barH, pos[1] + 20); }
    }

    const H1W = hw.raster.width, V1W = vw.raster.width;
    const totalW = pad * 2 + H1W + gap + Math.max(V1W, barW);
    const totalH = headH + hw.raster.height + labelH + gap + Math.max(vw.raster.height, barH + 40) + labelH + pad * 2;
    const sheet = create(Math.max(totalW, 640), Math.max(totalH, 300), [18, 20, 24, 255]);

    drawText(sheet, (opts.title || 'RENDERED SKIN').toUpperCase(), pad, 12, [236, 238, 246, 255], 2);
    let notes = [...hw.notes, ...vw.notes];

    // 横排候选窗
    let y = headH;
    drawText(sheet, 'H1  ' + hSize[0] + 'x' + hSize[1], pad, y - 13, [130, 190, 210, 255], 1);
    blit(sheet, hw.raster, pad, y);
    // 竖排候选窗
    let vy = y + hw.raster.height + labelH + gap;
    drawText(sheet, 'V1  ' + vSize[0] + 'x' + vSize[1], pad, vy - 13, [130, 190, 210, 255], 1);
    blit(sheet, vw.raster, pad, vy);
    // 状态栏
    const sx = pad + H1W + gap;
    const sy = y;
    if (bar) {
        drawText(sheet, 'STATUSBAR  ' + bar.width + 'x' + bar.height, sx, sy - 13, [130, 190, 210, 255], 1);
        blit(sheet, bar, sx, sy);
        for (const b of btns) {
            const v = doc.get('StatusBar', b);
            if (!v) continue;
            const pos = String(doc.get('StatusBar', b + '_pos') || '0,0').split(',').map(Number);
            const img = rasters.get(v.split(',')[0]);
            if (!img) { notes.push('状态栏按钮 ' + b + ' 的图缺失: ' + v); continue; }
            blit(sheet, img, sx + (pos[0] || 0), sy + (pos[1] || 0));
        }
        // 三态对照
        let tx = sx, ty = sy + bar.height + 14;
        drawText(sheet, 'N / H / D', sx, ty - 11, [130, 190, 210, 255], 1);
        for (const b of btns.slice(0, 4)) {
            for (const sfx of ['', '_hover', '_down']) {
                const v = doc.get('StatusBar', b + sfx) || doc.get('StatusBar', b);
                if (!v) continue;
                const img = rasters.get(v.split(',')[0]);
                if (!img) continue;
                blit(sheet, img, tx, ty); tx += img.width + 2;
            }
            tx += 10;
        }
    }
    return { raster: sheet, notes };
}

/** 把 src 叠加到 dst 的 (x,y)（source-over）。 */
function blit(dst, src, x, y) {
    for (let yy = 0; yy < src.height; yy++) {
        const dy = y + yy;
        if (dy < 0 || dy >= dst.height) continue;
        for (let xx = 0; xx < src.width; xx++) {
            const dx = x + xx;
            if (dx < 0 || dx >= dst.width) continue;
            const s = (yy * src.width + xx) * 4;
            const a = src.data[s + 3] / 255;
            if (a <= 0) continue;
            const d = (dy * dst.width + dx) * 4;
            const da = dst.data[d + 3] / 255;
            const oa = a + da * (1 - a);
            if (oa <= 0) continue;
            dst.data[d] = Math.round((src.data[s] * a + dst.data[d] * da * (1 - a)) / oa);
            dst.data[d + 1] = Math.round((src.data[s + 1] * a + dst.data[d + 1] * da * (1 - a)) / oa);
            dst.data[d + 2] = Math.round((src.data[s + 2] * a + dst.data[d + 2] * da * (1 - a)) / oa);
            dst.data[d + 3] = Math.round(oa * 255);
        }
    }
}
/**
 * 白底 / 黑底对照表 —— **黑边类缺陷只在白底暴露**。
 *
 * 我在黑底上测了整整十几轮，一直没发现所有描边用的都是近黑色 ink，
 * 白底上就是一圈硬黑边。这个检查必须固化进流程，不能靠人记得。
 *
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{only?:string[]}} [opts]
 */
export function renderBgCheck(files, opts = {}) {
    const rasters = decodeAll(files);
    const want = opts.only || ['bar.png', 'skin1.png', 'skin2.png'];
    const items = [];
    for (const n of want) {
        const r = rasters.get(n);
        if (r) items.push({ name: n, raster: r });
    }
    if (!items.length) return { raster: create(320, 80, [40, 40, 48, 255]), items: [], worst: [] };

    const pad = 8, labelH = 14, colW = Math.max(...items.map((it) => it.raster.width)) + pad * 2;
    const rowsH = items.map((it) => it.raster.height + labelH + pad);
    const W = colW * 2 + pad, H = rowsH.reduce((a, b) => a + b, 0) + pad + 18;
    const sheet = create(W, H, [90, 90, 96, 255]);
    drawText(sheet, 'BG CHECK   left=WHITE (black edges show here)   right=BLACK', pad, 4, [235, 235, 245, 255], 1);

    /** 把 r 叠到底色上 */
    const over = (r, bg, x, y) => {
        for (let yy = 0; yy < r.height; yy++) {
            for (let xx = 0; xx < r.width; xx++) {
                const s = (yy * r.width + xx) * 4;
                const a = r.data[s + 3] / 255;
                const dx = x + xx, dy = y + yy;
                if (dx < 0 || dy < 0 || dx >= sheet.width || dy >= sheet.height) continue;
                const d = (dy * sheet.width + dx) * 4;
                sheet.data[d] = Math.round(sheet.data[d] * (1 - a) + r.data[s] * a);
                sheet.data[d + 1] = Math.round(sheet.data[d + 1] * (1 - a) + r.data[s + 1] * a);
                sheet.data[d + 2] = Math.round(sheet.data[d + 2] * (1 - a) + r.data[s + 2] * a);
                sheet.data[d + 3] = 255;
            }
        }
    };

    // 最差边缘的量化：半透明边缘像素的平均亮度，白底上偏暗 = 有黑边
    const worst = [];
    let y = 18;
    for (const it of items) {
        for (let ci = 0; ci < 2; ci++) {
            const bg = ci === 0 ? [255, 255, 255] : [0, 0, 0];
            const x = pad + ci * (colW + pad);
            for (let a = 0; a < it.raster.width + pad * 2; a++) for (let b = 0; b < it.raster.height + labelH; b++) {
                const d = ((y + b) * sheet.width + (x + a)) * 4;
                if (d + 3 < sheet.data.length) { sheet.data[d] = bg[0]; sheet.data[d+1] = bg[1]; sheet.data[d+2] = bg[2]; sheet.data[d+3] = 255; }
            }
            over(it.raster, bg, x + pad, y);
            drawText(sheet, it.name + (ci ? ' on BLACK' : ' on WHITE'), x + 2, y + it.raster.height + 1, [220, 220, 235, 255], 1);
        }
        // 量化：半透明边缘像素 vs 不透明内部像素的平均亮度。
        // 只有【画面本身明亮、边缘却明显偏暗】才算黑边 —— 否则深色立绘会被全量误报。
        let sum = 0, n = 0, isum = 0, inum = 0;
        for (let i = 0; i < it.raster.data.length; i += 4) {
            const al = it.raster.data[i + 3];
            const luma = (it.raster.data[i] + it.raster.data[i + 1] + it.raster.data[i + 2]) / 3;
            if (al >= 40 && al <= 200) { sum += luma; n++; }
            else if (al > 230) { isum += luma; inum++; }
        }
        const avg = n ? sum / n : 0;
        const interior = inum ? isum / inum : 0;
        const flag = (n > 200 && interior > 170 && avg < interior - 45) ? 'DARK EDGE' : 'ok';
        if (flag !== 'ok') worst.push({ name: it.name, avgEdgeLuma: Math.round(avg), avgInterior: Math.round(interior), semi: n });
        drawText(sheet, flag + '  edge ' + Math.round(avg) + ' vs interior ' + Math.round(interior) + '  (' + n + ' px)',
            colW + pad + 2, y + it.raster.height + 1, flag === 'ok' ? [150, 230, 190, 255] : [255, 120, 120, 255], 1);
        y += it.raster.height + labelH + pad;
    }
    return { raster: sheet, items, worst };
}
