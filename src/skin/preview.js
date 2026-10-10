// @ts-check
/**
 * 皮肤预览渲染器。
 *
 * 目标：让「用户看一眼就能提意见、AI 看一眼就能改」。
 * 预览图直接由【装配产物的实际字节】渲染 —— 不是另画一张示意图，所以预览里看到的
 * 就是装进 .ssf 里的东西。布局参数也从生成出来的 Skin.ini 里读，保证所见即所得。
 *
 * 受限说明：本插件零依赖，不携带中文字库。因此候选词用「词块」示意（UI 线框图惯例），
 * 拼音串用自带的 5x7 点阵字模真实绘制；按钮图标是真实贴图。
 */
import { create, fillRect, paste, resize, nineSlice, getPixel, setPixel } from '../image/raster.js';
import { decodePng, encodePng, isPng } from '../image/png.js';
import { decodeBmp, isBmp } from '../image/bmp.js';
import { decodeIni, IniDoc, bgrToRgb, parseIniNumber, bgrToHex } from '../ssf/ini.js';
import { drawText, measureText } from '../image/font5x7.js';

/** @param {{name:string,data:Uint8Array}} f @returns {import('../image/png.js').Raster|null} */
function decodeEntry(f) {
    try {
        if (isPng(f.data)) return decodePng(f.data);
        if (isBmp(f.data)) return decodeBmp(f.data);
    } catch { /* 忽略坏图 */ }
    return null;
}

/** 把装配产物解成 name -> Raster。 @param {{name:string,data:Uint8Array}[]} files */
export function rasterizeFiles(files) {
    /** @type {Map<string, import('../image/png.js').Raster>} */
    const map = new Map();
    for (const f of files) {
        const r = decodeEntry(f);
        if (r) map.set(f.name, r);
    }
    return map;
}

/** 九宫格拉伸时，把源坐标映射到目标坐标。 */
function makeMapper(srcW, srcH, dstW, dstH, L, R, T, B) {
    const mapX = (x) => {
        if (x <= L) return x;
        if (x >= srcW - R) return dstW - (srcW - x);
        const span = srcW - L - R;
        return span <= 0 ? x : L + (x - L) * ((dstW - L - R) / span);
    };
    const mapY = (y) => {
        if (y <= T) return y;
        if (y >= srcH - B) return dstH - (srcH - y);
        const span = srcH - T - B;
        return span <= 0 ? y : T + (y - T) * ((dstH - T - B) / span);
    };
    return { mapX, mapY };
}

/** 画一块「词块」代表一个候选词。 */
function wordBlock(r, x, y, w, h, rgba, index) {
    const rad = Math.max(1, Math.round(h / 6));
    for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
            const cx = xx < rad ? rad - xx : (xx >= w - rad ? xx - (w - rad - 1) : 0);
            const cy = yy < rad ? rad - yy : (yy >= h - rad ? yy - (h - rad - 1) : 0);
            if (cx > 0 && cy > 0 && (cx * cx + cy * cy) > rad * rad + rad) continue;
            const px = x + xx;
            const py = y + yy;
            if (px < 0 || py < 0 || px >= r.width || py >= r.height) continue;
            const i = (py * r.width + px) * 4;
            const a = rgba[3] / 255;
            r.data[i] = Math.round(r.data[i] * (1 - a) + rgba[0] * a);
            r.data[i + 1] = Math.round(r.data[i + 1] * (1 - a) + rgba[1] * a);
            r.data[i + 2] = Math.round(r.data[i + 2] * (1 - a) + rgba[2] * a);
            r.data[i + 3] = Math.max(r.data[i + 3], rgba[3]);
        }
    }
    if (index) {
        const t = index + '.';
        const m = measureText(t, 1);
        drawText(r, t, x + 2, y + Math.round((h - m.h) / 2), [110, 110, 125, 230], 1);
    }
}

/** 铺一层「假文档」背景，方便看清透明度。 */
function documentBackdrop(r) {
    for (let y = 0; y < r.height; y++) {
        const t = y / r.height;
        const v = Math.round(28 + t * 16);
        for (let x = 0; x < r.width; x++) {
            const i = (y * r.width + x) * 4;
            r.data[i] = v; r.data[i + 1] = v; r.data[i + 2] = v + 6; r.data[i + 3] = 255;
        }
    }
    // 模拟编辑器里的文字行
    let y = 40;
    const lineH = 13;
    let seed = 7;
    while (y < r.height - 20) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const w = Math.round(r.width * (0.18 + (seed % 1000) / 1000 * 0.5));
        fillRect(r, 40, y, w, 6, [255, 255, 255, 26]);
        y += lineH;
    }
}

/** 画一个色卡 + 十六进制标注。 */
function swatch(r, x, y, hex, label) {
    const n = parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    fillRect(r, x, y, 22, 12, [rgb[0], rgb[1], rgb[2], 255]);
    fillRect(r, x, y, 22, 1, [255, 255, 255, 60]);
    drawText(r, label.toUpperCase() + ' ' + hex.toUpperCase(), x + 28, y + 3, [200, 200, 214, 255], 1);
}

/**
 * 渲染「拟真预览」主图。
 * @param {{name:string,data:Uint8Array}[]} files 装配产物
 * @param {{width?:number,statusBarWidth?:number,title?:string,warnings?:string[]}} [opts]
 * @returns {import('../image/png.js').Raster}
 */
export function renderMock(files, opts = {}) {
    const W = opts.width ?? 1180;
    const H = opts.height ?? 820;
    const canvas = create(W, H, [20, 20, 26, 255]);
    documentBackdrop(canvas);

    const rasters = rasterizeFiles(files);
    const iniEntry = files.find((f) => f.name === 'Skin.ini');
    const doc = iniEntry ? new IniDoc(decodeIni(iniEntry.data)) : null;
    const num = (s, k) => parseIniNumber(doc ? doc.get(s, k) : undefined);

    const title = opts.title ?? '皮肤预览';
    drawText(canvas, title, 24, 18, [240, 240, 250, 255], 2);
    drawText(canvas, 'PREVIEW GENERATED FROM THE ACTUAL .SSF PAYLOAD', 24, 40, [130, 130, 150, 255], 1);

    /** @type {string[]} */
    const notes = [];

    // ---------- 横排候选窗 ----------
    const hPicName = doc?.get('Scheme_H1', 'pic');
    const hPic = hPicName ? rasters.get(hPicName) : null;
    if (hPic) {
        const lh = (doc?.get('Scheme_H1', 'layout_horizontal') || '0,0,0').split(',').map(Number);
        const lv = (doc?.get('Scheme_H1', 'layout_vertical') || '0,0,0').split(',').map(Number);
        const L = lh[1] || 0, R = lh[2] || 0, T = lv[1] || 0, B = lv[2] || 0;
        const pm = (doc?.get('Scheme_H1', 'pinyin_marge') || '4,4,4,4').split(',').map(Number);
        const zm = (doc?.get('Scheme_H1', 'zhongwen_marge') || '4,4,4,4').split(',').map(Number);
        const dstW = opts.hWidth ?? 620;
        // 目标高度：保留源图竖直方向的原样（真实皮肤横向拉伸远大于纵向）
        const dstH = hPic.height;
        const stretched = nineSlice(hPic, dstW, dstH, { left: L, right: R, top: T, bottom: B, mode: 'stretch' });
        const m = makeMapper(hPic.width, hPic.height, dstW, dstH, L, R, T, B);
        const ox = 40, oy = 120;
        paste(canvas, stretched, ox, oy);

        const pinyinRGB = (() => { const v = num('Display', 'pinyin_color'); if (v === undefined) return [220, 100, 110]; const c = bgrToRgb(v); return [c.r, c.g, c.b]; })();
        const firstRGB = (() => { const v = num('Display', 'zhongwen_first_color'); if (v === undefined) return [255, 90, 160]; const c = bgrToRgb(v); return [c.r, c.g, c.b]; })();
        const otherRGB = (() => { const v = num('Display', 'zhongwen_color'); if (v === undefined) return [200, 90, 100]; const c = bgrToRgb(v); return [c.r, c.g, c.b]; })();
        const fontSize = num('Display', 'font_size') ?? 16;
        const scale = Math.max(1, Math.round(fontSize / 8));

        const px0 = ox + Math.round(m.mapX(pm[2] ?? 8));
        const py0 = oy + Math.round(m.mapY(pm[0] ?? 8));
        const pinyinSample = 'NI HAO';
        drawText(canvas, pinyinSample, px0, py0, [pinyinRGB[0], pinyinRGB[1], pinyinRGB[2], 255], scale);
        notes.push('横排：拼音串画在 pinyin_marge 的 (left,top) = (' + (pm[2] ?? '?') + ',' + (pm[0] ?? '?') + ')');

        const pinW = measureText(pinyinSample, scale).w;
        let candX = ox + Math.round(m.mapX(zm[2] ?? 8));
        const candY = oy + Math.round(m.mapY(zm[0] ?? 8));
        if (candX < px0 + pinW + 6) {
            // 拼音串与候选区几乎重叠 —— 这是布局参数本身的问题，抬开并在图上标出来
            candX = px0 + pinW + 6;
            notes.push('拼音串与候选区在水平方向重叠，预览已自动抬开；建议调大 pinyin_marge 右边距或 zhongwen_marge 左边距');
        }
        const rightLimit = ox + dstW - Math.round((hPic.width - (zm[2] ?? 8) - 0) * 0 + (zm[3] ?? 60));
        const blockW = Math.round(fontSize * 1.9);
        const blockH = Math.round(fontSize * 1.25);
        for (let i = 0; i < 6; i++) {
            const bx = candX + i * (blockW + 4);
            if (bx + blockW > rightLimit) { notes.push('横排候选只放得下 ' + i + ' 个词（zhongwen_marge 右边距 = ' + zm[3] + '）'); break; }
            const col = i === 0 ? firstRGB : otherRGB;
            wordBlock(canvas, bx, candY, blockW, blockH, [col[0], col[1], col[2], i === 0 ? 235 : 150], String(i + 1));
        }
        drawText(canvas, 'H1  ' + hPicName + '  ' + hPic.width + 'x' + hPic.height + '  ->  stretch to ' + dstW + 'x' + dstH,
            40, oy + dstH + 8, [120, 200, 255, 255], 1);
        drawText(canvas, 'layout_h=' + lh.join(',') + '   layout_v=' + lv.join(','), 40, oy + dstH + 22, [140, 140, 160, 255], 1);
    } else {
        notes.push('没有找到横排候选窗底图（Scheme_H1.pic），横排预览已跳过');
    }

    // ---------- 竖排候选窗 ----------
    const vPicName = doc?.get('Scheme_V1', 'pic');
    const vPic = vPicName ? rasters.get(vPicName) : null;
    if (vPic) {
        const lh = (doc?.get('Scheme_V1', 'layout_horizontal') || '0,0,0').split(',').map(Number);
        const lv = (doc?.get('Scheme_V1', 'layout_vertical') || '0,0,0').split(',').map(Number);
        const dstW = Math.min(vPic.width, 300);
        const dstH = 330;
        const stretched = nineSlice(vPic, dstW, dstH, { left: lh[1] || 0, right: lh[2] || 0, top: lv[1] || 0, bottom: lv[2] || 0, mode: 'stretch' });
        const ox = 740, oy = 120;
        paste(canvas, stretched, ox, oy);
        const zm = (doc?.get('Scheme_V1', 'zhongwen_marge') || '8,8,8,8').split(',').map(Number);
        const m = makeMapper(vPic.width, vPic.height, dstW, dstH, lh[1] || 0, lh[2] || 0, lv[1] || 0, lv[2] || 0);
        const firstRGB = (() => { const v = num('Display', 'zhongwen_first_color'); const c = bgrToRgb(v ?? 0x9b1562); return [c.r, c.g, c.b]; })();
        const otherRGB = (() => { const v = num('Display', 'zhongwen_color'); const c = bgrToRgb(v ?? 0xaf5f5f); return [c.r, c.g, c.b]; })();
        const fontSize = num('Display', 'font_size') ?? 16;
        const bx0 = ox + Math.round(m.mapX(zm[2] ?? 8));
        const by0 = oy + Math.round(m.mapY(zm[0] ?? 8));
        const blockH = Math.round(fontSize * 1.25);
        const blockW = Math.round(fontSize * 1.9);
        for (let i = 0; i < 7; i++) {
            const by = by0 + i * (blockH + 6);
            if (by + blockH > oy + dstH - 10) break;
            const col = i === 0 ? firstRGB : otherRGB;
            wordBlock(canvas, bx0, by, blockW, blockH, [col[0], col[1], col[2], i === 0 ? 235 : 150], String(i + 1));
        }
        drawText(canvas, 'V1  ' + vPicName + '  ->  ' + dstW + 'x' + dstH, 740, oy + dstH + 8, [120, 200, 255, 255], 1);
    }

    // ---------- 状态栏 ----------
    const barName = doc?.get('StatusBar', 'pic');
    const bar = barName ? rasters.get(barName) : null;
    if (bar) {
        const buttons = ['cn_en', 'quan_ban', 'biaodian', 'softkeyboard', 'menu', 'fan_jian'];
        const present = buttons.filter((b) => doc?.get('StatusBar', b));
        let maxX = 40;
        for (const b of present) {
            const pos = (doc?.get('StatusBar', b + '_pos') || '0,0').split(',').map(Number);
            maxX = Math.max(maxX, pos[0] + 24);
        }
        // 状态栏有两种形态：官方那种「横条」，和玩家皮肤常见的「以图案为中心的方块」。
        // 后者绝不能被压成横条，否则完全是另一个东西了。
        const isStrip = bar.width / bar.height >= 2.2;
        const dstW = isStrip ? Math.min(560, maxX + 20) : bar.width;
        const dstH = isStrip ? Math.max(24, Math.min(bar.height, 40)) : bar.height;
        const barS = isStrip
            ? nineSlice(bar, dstW, dstH, { left: 4, right: 4, top: 4, bottom: 4, mode: 'stretch' })
            : bar;
        const ox = 40, oy = 640;
        paste(canvas, barS, ox, oy);
        for (const b of present) {
            const pos = (doc?.get('StatusBar', b + '_pos') || '0,0').split(',').map(Number);
            const img = rasters.get(doc.get('StatusBar', b).split(',')[0]);
            if (img) paste(canvas, resize(img, img.width, img.height, 'nearest'), ox + pos[0], oy + pos[1]);
        }
        drawText(canvas, 'STATUSBAR  ' + barName + ' -> ' + dstW + 'x' + dstH + '   BUTTONS: ' + present.join(' '),
            40, oy + dstH + 10, [120, 200, 255, 255], 1);
        // 三态对照
        let sx = ox;
        const sy = oy + dstH + 30;
        for (const b of present.slice(0, 4)) {
            for (const [sfx, tag] of [['', 'N'], ['_hover', 'H'], ['_down', 'D']]) {
                const v = doc.get('StatusBar', b + sfx);
                if (!v) continue;
                const img = rasters.get(v.split(',')[0]);
                if (!img) continue;
                paste(canvas, img, sx, sy);
                drawText(canvas, tag, sx + 2, sy + img.height + 1, [150, 150, 170, 255], 1);
                sx += img.width + 4;
            }
            sx += 10;
        }
        drawText(canvas, 'N/H/D = 常态/悬停/按下', ox + 300, sy + 4, [150, 150, 170, 255], 1);
    }

    // ---------- 图例 ----------
    const theme = {
        pinyin: num('Display', 'pinyin_color'),
        first: num('Display', 'zhongwen_first_color'),
        zhongwen: num('Display', 'zhongwen_color'),
        hint: num('Display', 'comphint_color'),
    };
    let ly = 740;
    const lx = 740;
    drawText(canvas, 'COLORS (0xBBGGRR IN INI)', lx, ly - 14, [200, 200, 214, 255], 1);
    const sw = [['pinyin', theme.pinyin], ['first', theme.first], ['zhongwen', theme.zhongwen], ['hint', theme.hint]];
    for (const [label, v] of sw) {
        if (v === undefined) continue;
        swatch(canvas, lx, ly, bgrToHex(v), label);
        ly += 16;
    }
    if (opts.warnings && opts.warnings.length) {
        let wy = ly + 6;
        drawText(canvas, 'WARNINGS (' + opts.warnings.length + ')', lx, wy, [255, 200, 120, 255], 1);
        wy += 12;
        for (const w of opts.warnings.slice(0, 5)) {
            drawText(canvas, w.slice(0, 46).toUpperCase(), lx, wy, [230, 180, 120, 255], 1);
            wy += 10;
        }
    }
    return canvas;
}

/**
 * 渲染「素材总览表」：把装配产物里所有图片平铺出来并标注文件名与尺寸，方便 AI 一次看全。
 * @param {{name:string,data:Uint8Array}[]} files
 * @returns {import('../image/png.js').Raster}
 */
export function renderSheet(files) {
    const rasters = rasterizeFiles(files).entries();
    const items = [...rasters].map(([name, r]) => ({ name, r }));
    const icons = items.filter((i) => i.r.width <= 64 && i.r.height <= 64);
    const panels = items.filter((i) => !(i.r.width <= 64 && i.r.height <= 64));
    const iconCols = 10;
    const cell = 64;
    const iconRows = Math.max(1, Math.ceil(icons.length / iconCols));
    const panelH = panels.reduce((a, p) => a + Math.min(p.r.height, 140) + 18, 0);
    const W = Math.max(760, iconCols * (cell + 8) + 40);
    const H = 60 + panelH + iconRows * (cell + 18) + 60;
    const canvas = create(W, H, [22, 22, 28, 255]);
    drawText(canvas, 'ASSET SHEET  ' + files.length + ' FILES', 20, 18, [240, 240, 250, 255], 2);
    let y = 52;
    for (const p of panels) {
        const scale = Math.min(1, 700 / p.r.width, 140 / p.r.height);
        const rr = resize(p.r, Math.max(1, Math.round(p.r.width * scale)), Math.max(1, Math.round(p.r.height * scale)), 'bilinear');
        // 透明处铺棋盘格
        for (let yy = 0; yy < rr.height; yy += 8) {
            for (let xx = 0; xx < rr.width; xx += 8) {
                if (getPixel(rr, xx, yy)[3] < 250) {
                    fillRect(canvas, 20 + xx, y + yy, Math.min(8, rr.width - xx), Math.min(8, rr.height - yy),
                        (((xx / 8 | 0) + (yy / 8 | 0)) % 2) ? [70, 70, 78, 255] : [54, 54, 62, 255]);
                }
            }
        }
        paste(canvas, rr, 20, y);
        drawText(canvas, p.name.toUpperCase() + '  ' + p.r.width + 'X' + p.r.height, 20 + rr.width + 10, y + 4, [150, 210, 255, 255], 1);
        y += Math.min(p.r.height, 140) + 18;
    }
    let ix = 20;
    let iy = y + 10;
    drawText(canvas, 'ICONS / STRIPS', 20, iy - 12, [200, 200, 214, 255], 1);
    for (const it of icons) {
        for (let yy = 0; yy < cell; yy += 8) {
            for (let xx = 0; xx < cell; xx += 8) {
                fillRect(canvas, ix + xx, iy + yy, 8, 8, (((xx / 8 | 0) + (yy / 8 | 0)) % 2) ? [64, 64, 72, 255] : [50, 50, 58, 255]);
            }
        }
        const scale = Math.min(3, Math.floor(cell / Math.max(it.r.width, it.r.height)) || 1);
        paste(canvas, resize(it.r, it.r.width * scale, it.r.height * scale, 'nearest'),
            ix + Math.round((cell - it.r.width * scale) / 2), iy + Math.round((cell - it.r.height * scale) / 2));
        drawText(canvas, it.name.replace(/\.[a-z]+$/i, '').toUpperCase().slice(0, 9), ix, iy + cell + 2, [170, 170, 190, 255], 1);
        ix += cell + 8;
        if (ix + cell > W - 20) { ix = 20; iy += cell + 18; }
    }
    return canvas;
}

/** @param {import('../image/png.js').Raster} r @returns {Uint8Array} */
export function toPng(r) {
    return encodePng(r);
}
/**
 * 拉伸测试条 —— 这是「输入长文本时窗体被拉长、边角变形」这类问题的专用体检图。
 *
 * 把候选窗底图按九宫格分别拉到多个宽度，并排画出来：如果 left/right 选错了，
 * 尖角/箭头/圆角会在宽的那几条里被明显拉长，一眼就能看出来。
 * 同时画出左右边界导引线、把「可拉伸中间带」高亮出来。
 *
 * @param {{name:string,data:Uint8Array}[]} files
 * @param {{widths?:number[], title?:string}} [opts]
 * @returns {import('../image/png.js').Raster}
 */
export function renderStretchTest(files, opts = {}) {
    const rasters = rasterizeFiles(files);
    const iniEntry = files.find((f) => f.name === 'Skin.ini');
    const doc = iniEntry ? new IniDoc(decodeIni(iniEntry.data)) : null;

    const rows = [];
    // H1 是横向变宽（打字变长），V1 是纵向变高（候选变多）—— 必须沿各自的真实方向拉伸，
    // 否则测的是引擎根本不会走的那条路径。
    for (const [sec, picKey, lhKey, lvKey, axis] of [
        ['Scheme_H1', 'pic', 'layout_horizontal', 'layout_vertical', 'w'],
        ['Scheme_V1', 'pic', 'layout_horizontal', 'layout_vertical', 'h'],
    ]) {
        const picName = doc ? doc.get(sec, picKey) : null;
        const pic = picName ? rasters.get(picName) : null;
        if (!pic) continue;
        const lh = (doc.get(sec, lhKey) || '0,0,0').split(',').map(Number);
        const lv = (doc.get(sec, lvKey) || '0,0,0').split(',').map(Number);
        rows.push({ sec, picName, pic, axis, L: lh[1] || 0, R: lh[2] || 0, T: lv[1] || 0, B: lv[2] || 0 });
    }
    if (!rows.length) return create(600, 120, [22, 22, 28, 255]);

    const pad = 24, gap = 14, headH = 38, labelH = 16;
    const hSizes = [760, 940, 1120];   // H1：横向延长（打字变长）；都取 ≥ 源宽，测的是"延长"而不是"压缩"
    const vSizes = [460, 600, 740];    // V1：纵向加高（候选变多）

    // 先做一次布局预演，按【拉伸后】的真实尺寸计算画布，避免行与行重叠
    const plan = [];
    for (const r of rows) {
        const sizes = r.axis === 'h' ? hSizes : vSizes;
        const items = sizes.map((s) => {
            const dstW = r.axis === 'h' ? s : r.pic.width;
            const dstH = r.axis === 'h' ? r.pic.height : s;
            return { size: s, dstW, dstH, stretched: nineSlice(r.pic, dstW, dstH, { left: r.L, right: r.R, top: r.T, bottom: r.B, mode: 'stretch' }) };
        });
        const vertical = r.axis === 'w';   // H1 横幅很宽 -> 竖着排；V1 竖幅窄 -> 横着排，方便直接比高度
        const w = vertical
            ? Math.max(...items.map((i) => i.dstW))
            : items.reduce((a, i) => a + i.dstW + gap, -gap);
        const h = vertical
            ? items.reduce((a, i) => a + i.dstH + gap + labelH, -gap - labelH)
            : Math.max(...items.map((i) => i.dstH)) + labelH;
        plan.push({ row: r, items, vertical, w, h });
    }
    const W = pad * 2 + Math.max(...plan.map((p) => p.w), 640);
    const H = 62 + plan.reduce((a, p) => a + headH + p.h + gap, 0) + pad;
    const canvas = create(W, H, [22, 22, 28, 255]);
    drawText(canvas, 'STRETCH TEST', pad, 16, [240, 240, 250, 255], 2);
    drawText(canvas, 'EACH PANEL PULLED ALONG ITS REAL AXIS - CORNERS MUST NOT DEFORM', pad, 38, [140, 140, 165, 255], 1);

    let y = 62;
    for (const p of plan) {
        const r = p.row;
        drawText(canvas, r.sec + '  ' + r.picName + '  ' + r.pic.width + 'x' + r.pic.height +
            '   left=' + r.L + ' right=' + r.R + ' top=' + r.T + ' bottom=' + r.B +
            '   沿' + (r.axis === 'h' ? '横轴延长' : '纵轴加高'), pad, y, [120, 200, 255, 255], 1);
        if (r.L === 0) drawText(canvas, '!! left = 0 -> 左端装饰会被拉变形', pad, y + 13, [255, 120, 120, 255], 1);

        let x = pad;
        let yy = y + headH - 14;
        for (const it of p.items) {
            paste(canvas, it.stretched, x, yy);
            if (r.axis === 'h') {
                // 可拉伸中段高亮 + 左右边界导引
                const bw = it.dstW - r.L - r.R;
                if (bw > 1) fillRect(canvas, x + r.L, yy + Math.round(it.dstH / 2) - 8, bw, 16, [120, 220, 255, 30]);
                fillRect(canvas, x + r.L, yy, 1, it.dstH, [255, 80, 80, 190]);
                fillRect(canvas, x + it.dstW - r.R, yy, 1, it.dstH, [255, 80, 80, 190]);
            } else {
                const bh = it.dstH - r.T - r.B;
                if (bh > 1) fillRect(canvas, x + Math.round(it.dstW / 2) - 8, yy + r.T, 16, bh, [120, 220, 255, 30]);
                fillRect(canvas, x, yy + r.T, it.dstW, 1, [255, 80, 80, 190]);
                fillRect(canvas, x, yy + it.dstH - r.B, it.dstW, 1, [255, 80, 80, 190]);
            }
            drawText(canvas, (r.axis === 'w' ? 'W' : 'H') + it.size, x, yy + it.dstH + 3, [180, 180, 200, 255], 1);
            if (p.vertical) yy += it.dstH + labelH + gap; else x += it.dstW + gap;
        }
        y += headH + p.h + gap;
    }
    return canvas;
}
