// @ts-check
/**
 * 程序化占位素材生成器。
 * 重要：这里【不包含任何现成皮肤的数据】—— 所有图形都是运行时用代码画出来的几何形状，
 * 只为让「制作 → 预览 → 迭代」的流水线在没有美术素材时也能跑通。用户随时用真素材替换。
 */
import { create, setPixel, getPixel, fillRect, alphaBBox } from '../image/raster.js';
import { drawText, measureText } from '../image/font5x7.js';

/**
 * 标准 HSV -> RGB（固定 S/V，只取色相）。
 * 之前的实现是拼凑出来的三角波，色相映射是错的 —— hue=0.474（青玉）会算成红色。
 * @param {number} h 0..1
 * @returns {[number,number,number]}
 */
function hueToRgb(h) {
    const hh = ((h % 1) + 1) % 1;
    const s = 0.60, v = 0.82;
    const i = Math.floor(hh * 6);
    const f = hh * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** 圆角矩形填充。 */
function roundRect(r, x0, y0, w, h, radius, rgba) {
    const rad = Math.max(0, Math.min(radius, Math.floor(Math.min(w, h) / 2)));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cx = x < rad ? rad - x : (x >= w - rad ? x - (w - rad - 1) : 0);
            const cy = y < rad ? rad - y : (y >= h - rad ? y - (h - rad - 1) : 0);
            if (cx > 0 && cy > 0 && (cx * cx + cy * cy) > rad * rad + rad) continue;
            setPixel(r, x0 + x, y0 + y, rgba);
        }
    }
}

/** 斜纹「美术保留区」，只在底部条以上的区域画。 */
function artZone(r, x0, x1, y0, y1, color, alpha) {
    for (let y = y0; y < y1; y += 6) {
        for (let x = x0; x < x1; x++) {
            if (((x + y) % 14) < 5) setPixel(r, x, y, [color[0], color[1], color[2], alpha]);
        }
    }
}

/** 面板几何参数：占位图的九宫格与文字边距（与绘制逻辑严格对应）。 */
export function placeholderGeometry(slot, opts = {}) {
    if (slot === 'panel_h') {
        const W = opts.width ?? 620;
        const H = opts.height ?? 200;
        const barH = 46;
        const barY = H - barH - 12;
        return {
            nineSlice: { left: 100, right: Math.round(W * 0.42), top: barY - 4, bottom: 6 },
            margins: {
                pinyin_marge: [barY + 10, 12, 14, Math.round(W * 0.42)],
                zhongwen_marge: [barY + 10, 12, 72, Math.round(W * 0.42)],
            },
        };
    }
    if (slot === 'panel_v') {
        const W = opts.width ?? 300;
        const H = opts.height ?? 380;
        const barX = 10;
        const barW = Math.round(W * 0.52);
        return {
            nineSlice: { left: barX + 6, right: W - barX - barW, top: 30, bottom: 24 },
            margins: {
                pinyin_marge: [14, 14, barX + 12, W - barX - barW + 8],
                zhongwen_marge: [44, 20, barX + 12, W - barX - barW + 8],
            },
        };
    }
    if (slot === 'bar') {
        const W = opts.width ?? 160;
        const H = opts.height ?? 28;
        return { nineSlice: { left: 8, right: 8, top: 4, bottom: 4 }, margins: null };
    }
    const w = opts.width ?? 28;
    const h = opts.height ?? 27;
    return { nineSlice: { left: 2, right: 2, top: 2, bottom: 2 }, margins: null };
}

/** 横排候选窗占位底图：大部分透明，底部一条候选条，右上角斜纹表示留给立绘。 */
export function placeholderPanelH(opts = {}) {
    const W = opts.width ?? 620;
    const H = opts.height ?? 200;
    const hue = opts.hue ?? 0.72;
    const [cr, cg, cb] = hueToRgb(hue);
    const r = create(W, H, [0, 0, 0, 0]);
    const barH = 46;
    const barY = H - barH - 12;
    artZone(r, Math.round(W * 0.58), W - 10, 12, barY - 10, [cr, cg, cb], 90);
    roundRect(r, 4, barY, W - 8 - Math.round(W * 0.42), barH, 9, [cr, cg, cb, 238]);
    roundRect(r, 8, barY + 3, W - 16 - Math.round(W * 0.42), barH - 6, 7, [255, 255, 255, 26]);
    for (let i = 0; i < 13; i++) {
        const cx = 18 + i;
        for (let j = 0; j <= i; j++) {
            setPixel(r, cx, barY + (barH >> 1) - j, [255, 255, 255, 225]);
            setPixel(r, cx, barY + (barH >> 1) + j, [255, 255, 255, 225]);
        }
    }
    return r;
}

/** 竖排候选窗占位底图。 */
export function placeholderPanelV(opts = {}) {
    const W = opts.width ?? 300;
    const H = opts.height ?? 380;
    const hue = opts.hue ?? 0.72;
    const [cr, cg, cb] = hueToRgb(hue);
    const r = create(W, H, [0, 0, 0, 0]);
    const barX = 10;
    const barW = Math.round(W * 0.52);
    artZone(r, barX + barW + 6, W - 10, 40, H - 40, [cr, cg, cb], 90);
    roundRect(r, barX, 22, barW, H - 46, 10, [cr, cg, cb, 238]);
    roundRect(r, barX + 4, 26, barW - 8, H - 54, 8, [255, 255, 255, 26]);
    return r;
}

/** 状态栏底图占位。 */
export function placeholderBar(opts = {}) {
    const W = opts.width ?? 160;
    const H = opts.height ?? 28;
    const hue = opts.hue ?? 0.72;
    const [cr, cg, cb] = hueToRgb(hue);
    const r = create(W, H, [0, 0, 0, 0]);
    roundRect(r, 0, 0, W, H, 7, [cr, cg, cb, 215]);
    roundRect(r, 2, 2, W - 4, H - 4, 6, [255, 255, 255, 36]);
    return r;
}

/**
 * 状态栏图标占位：圆角磁贴 + 标签文字。三态亮度不同。
 * @param {string} label 1~4 个字符，例如 CN / EN / FAN
 */
export function placeholderIcon(label, opts = {}) {
    const W = opts.width ?? 20;
    const H = opts.height ?? 20;
    const hue = opts.hue ?? 0.72;
    const state = opts.state ?? 'normal';
    const [br, bg, bb] = hueToRgb(hue);
    const shade = state === 'hover' ? 1.12 : state === 'down' ? 0.82 : 1.0;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * shade)));
    const r = create(W, H, [0, 0, 0, 0]);
    // 状态栏是浮在各个窗口之上的，底下可能是白底网页、也可能是黑底编辑器。
    // 早先用"浅色半透明底 + 高明度字"，白底上整块糊成一片看不见。
    // 改成【深青玉实底 + 金色字形】—— 两种底色下都有对比。
    const plateA = state === 'normal' ? 200 : state === 'hover' ? 226 : 244;
    const base = state === 'hover' ? 1.28 : state === 'down' ? 0.78 : 1.0;
    roundRect(r, 0, 0, W, H, 5, [
        Math.min(255, Math.round(18 * base)), Math.min(255, Math.round(74 * base)), Math.min(255, Math.round(82 * base)), plateA,
    ]);
    // 这里原来有一行"上半部高光"：roundRect(r, 0, 0, W, H/2, 5, [255,255,255,16])。
    // 但本文件的 roundRect 是【覆盖写】而不是混合，alpha=16 的高光直接把按钮上半块擦成了近乎透明
    // （实测中列 alpha：上半 16，下半 200）。已删除。 */

    const m = measureText(label, 1);
    const tx = Math.max(0, Math.round((W - m.w) / 2));
    const ty = Math.max(0, Math.round((H - m.h) / 2));
    // 字形用配色里的金色；悬停提亮、按下转白
    const fg = state === 'hover' ? [255, 244, 205] : state === 'down' ? [255, 255, 255] : [255, 226, 150];
    drawText(r, label, tx, ty, [fg[0], fg[1], fg[2], state === 'normal' ? 236 : 250], 1);
    return r;
}

/** 分体底图占位（窄拉伸条）。 */
export function placeholderStrip(w, h, opts = {}) {
    const hue = opts.hue ?? 0.72;
    const [cr, cg, cb] = hueToRgb(hue);
    const r = create(w, h, [0, 0, 0, 0]);
    roundRect(r, 0, 0, w, h, Math.min(4, Math.floor(Math.min(w, h) / 3)), [cr, cg, cb, 225]);
    return r;
}
