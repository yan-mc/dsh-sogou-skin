// @ts-check
/**
 * 光栅操作库。所有函数操作统一的 Raster：
 *   { width, height, data: Uint8Array }   data 为 RGBA8 直通 alpha，长度 = w*h*4
 * 零依赖，热路径直接读写 data，不逐像素建数组。
 */
/** @typedef {{ width: number, height: number, data: Uint8Array }} Raster */

/** @param {number} w @param {number} h @param {number[]} [fill] @returns {Raster} */
export function create(w, h, fill = [0, 0, 0, 0]) {
    const width = Math.max(0, Math.floor(w));
    const height = Math.max(0, Math.floor(h));
    const data = new Uint8Array(width * height * 4);
    if (fill[3] !== 0) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
        }
    }
    return { width, height, data };
}

/** @param {Raster} r @returns {Raster} */
export function clone(r) {
    return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
}

/** @param {Raster} r @param {number} x @param {number} y @returns {number[]} */
export function getPixel(r, x, y) {
    const xi = Math.floor(x); const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= r.width || yi >= r.height) return [0, 0, 0, 0];
    const i = (yi * r.width + xi) * 4;
    return [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
}

/** @param {Raster} r @param {number} x @param {number} y @param {number[]} rgba */
export function setPixel(r, x, y, rgba) {
    const xi = Math.floor(x); const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= r.width || yi >= r.height) return;
    const i = (yi * r.width + xi) * 4;
    r.data[i] = rgba[0]; r.data[i + 1] = rgba[1]; r.data[i + 2] = rgba[2]; r.data[i + 3] = rgba[3] === undefined ? 255 : rgba[3];
}

/** @param {Raster} r @param {number} x @param {number} y @param {number} w @param {number} h @param {number[]} rgba */
export function fillRect(r, x, y, w, h, rgba) {
    const x0 = Math.max(0, Math.floor(x)); const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(r.width, Math.floor(x + w)); const y1 = Math.min(r.height, Math.floor(y + h));
    const a = (rgba[3] === undefined ? 255 : rgba[3]) / 255;
    for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
            const i = (yy * r.width + xx) * 4;
            if (a >= 1) {
                r.data[i] = rgba[0]; r.data[i + 1] = rgba[1]; r.data[i + 2] = rgba[2]; r.data[i + 3] = 255;
            } else {
                const da = r.data[i + 3] / 255;
                const oa = a + da * (1 - a);
                if (oa <= 0) continue;
                r.data[i] = Math.round((rgba[0] * a + r.data[i] * da * (1 - a)) / oa);
                r.data[i + 1] = Math.round((rgba[1] * a + r.data[i + 1] * da * (1 - a)) / oa);
                r.data[i + 2] = Math.round((rgba[2] * a + r.data[i + 2] * da * (1 - a)) / oa);
                r.data[i + 3] = Math.round(oa * 255);
            }
        }
    }
}

/** @param {Raster} r @param {number} w @param {number} h @param {'bilinear'|'nearest'} [mode] @returns {Raster} */
export function resize(r, w, h, mode = 'bilinear') {
    const dw = Math.max(1, Math.floor(w)); const dh = Math.max(1, Math.floor(h));
    if (dw === r.width && dh === r.height) return clone(r);
    const out = create(dw, dh);
    const sw = r.width; const sh = r.height;
    if (mode === 'nearest') {
        for (let y = 0; y < dh; y++) {
            const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
            for (let x = 0; x < dw; x++) {
                const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
                const s = (sy * sw + sx) * 4; const d = (y * dw + x) * 4;
                out.data[d] = r.data[s]; out.data[d + 1] = r.data[s + 1]; out.data[d + 2] = r.data[s + 2]; out.data[d + 3] = r.data[s + 3];
            }
        }
        return out;
    }
    for (let y = 0; y < dh; y++) {
        const fy = ((y + 0.5) * sh / dh) - 0.5;
        const y0 = Math.max(0, Math.floor(fy)); const y1 = Math.min(sh - 1, y0 + 1);
        const wy = Math.max(0, Math.min(1, fy - y0));
        for (let x = 0; x < dw; x++) {
            const fx = ((x + 0.5) * sw / dw) - 0.5;
            const x0 = Math.max(0, Math.floor(fx)); const x1 = Math.min(sw - 1, x0 + 1);
            const wx = Math.max(0, Math.min(1, fx - x0));
            const d = (y * dw + x) * 4;
            // 直通 alpha 的双线性（不预乘，简单加权，够用）
            for (let c = 0; c < 4; c++) {
                const p00 = r.data[(y0 * sw + x0) * 4 + c];
                const p10 = r.data[(y0 * sw + x1) * 4 + c];
                const p01 = r.data[(y1 * sw + x0) * 4 + c];
                const p11 = r.data[(y1 * sw + x1) * 4 + c];
                out.data[d + c] = Math.round((p00 * (1 - wx) + p10 * wx) * (1 - wy) + (p01 * (1 - wx) + p11 * wx) * wy);
            }
        }
    }
    return out;
}

/** @param {Raster} r @param {number} x @param {number} y @param {number} w @param {number} h @returns {Raster} */
export function crop(r, x, y, w, h) {
    const cw = Math.max(1, Math.floor(w)); const ch = Math.max(1, Math.floor(h));
    const out = create(cw, ch);
    const ox = Math.floor(x); const oy = Math.floor(y);
    for (let yy = 0; yy < ch; yy++) {
        const sy = oy + yy;
        if (sy < 0 || sy >= r.height) continue;
        for (let xx = 0; xx < cw; xx++) {
            const sx = ox + xx;
            if (sx < 0 || sx >= r.width) continue;
            const s = (sy * r.width + sx) * 4; const d = (yy * cw + xx) * 4;
            out.data[d] = r.data[s]; out.data[d + 1] = r.data[s + 1]; out.data[d + 2] = r.data[s + 2]; out.data[d + 3] = r.data[s + 3];
        }
    }
    return out;
}

/** source-over 就地合成。 @param {Raster} dst @param {Raster} src @param {number} x @param {number} y */
export function paste(dst, src, x, y) {
    const ox = Math.floor(x); const oy = Math.floor(y);
    for (let sy = 0; sy < src.height; sy++) {
        const dy = oy + sy;
        if (dy < 0 || dy >= dst.height) continue;
        for (let sx = 0; sx < src.width; sx++) {
            const dx = ox + sx;
            if (dx < 0 || dx >= dst.width) continue;
            const s = (sy * src.width + sx) * 4; const d = (dy * dst.width + dx) * 4;
            const sa = src.data[s + 3] / 255;
            if (sa === 0) continue;
            const da = dst.data[d + 3] / 255;
            const oa = sa + da * (1 - sa);
            if (oa <= 0) continue;
            dst.data[d] = Math.round((src.data[s] * sa + dst.data[d] * da * (1 - sa)) / oa);
            dst.data[d + 1] = Math.round((src.data[s + 1] * sa + dst.data[d + 1] * da * (1 - sa)) / oa);
            dst.data[d + 2] = Math.round((src.data[s + 2] * sa + dst.data[d + 2] * da * (1 - sa)) / oa);
            dst.data[d + 3] = Math.round(oa * 255);
        }
    }
}

/** 等比缩放并居中放入 w×h 的透明画布。 @param {Raster} r @param {number} w @param {number} h @param {'bilinear'|'nearest'} [mode] @returns {Raster} */
export function containFit(r, w, h, mode = 'bilinear') {
    const tw = Math.max(1, Math.floor(w)); const th = Math.max(1, Math.floor(h));
    const scale = Math.min(tw / r.width, th / r.height);
    const nw = Math.max(1, Math.round(r.width * scale));
    const nh = Math.max(1, Math.round(r.height * scale));
    const scaled = resize(r, nw, nh, mode);
    const out = create(tw, th);
    paste(out, scaled, Math.round((tw - nw) / 2), Math.round((th - nh) / 2));
    return out;
}

/**
 * 九宫格拉伸：四角保持原样，四边与中心按 mode 拉伸或平铺。
 * @param {Raster} r @param {number} w @param {number} h
 * @param {{left:number,right:number,top:number,bottom:number,mode?:'stretch'|'tile'}} opts
 * @returns {Raster}
 */
export function nineSlice(r, w, h, opts) {
    const tw = Math.max(1, Math.floor(w)); const th = Math.max(1, Math.floor(h));
    const sw = r.width; const sh = r.height;
    const L = Math.max(0, Math.min(Math.floor(opts.left), sw));
    const R = Math.max(0, Math.min(Math.floor(opts.right), sw - L));
    const T = Math.max(0, Math.min(Math.floor(opts.top), sh));
    const B = Math.max(0, Math.min(Math.floor(opts.bottom), sh - T));
    const mode = opts.mode || 'stretch';
    if (L + R >= tw || T + B >= th) {
        // 目标太小装不下四角，退化成整体缩放
        return resize(r, tw, th, 'bilinear');
    }
    const out = create(tw, th);
    const midSrcW = sw - L - R;
    const midSrcH = sh - T - B;
    const midDstW = tw - L - R;
    const midDstH = th - T - B;

    /** 生成中间带的源切片（拉伸=重采样；平铺=重复裁切） */
    const piece = (sx, sy, sW, sH, dW, dH) => {
        if (sW <= 0 || sH <= 0) return null;
        const src = crop(r, sx, sy, sW, sH);
        if (mode === 'tile') {
            const t = create(dW, dH);
            for (let y = 0; y < dH; y += sH) for (let x = 0; x < dW; x += sW) paste(t, src, x, y);
            return t;
        }
        return resize(src, dW, dH, 'bilinear');
    };

    // 四角
    paste(out, crop(r, 0, 0, L, T), 0, 0);
    paste(out, crop(r, sw - R, 0, R, T), tw - R, 0);
    paste(out, crop(r, 0, sh - B, L, B), 0, th - B);
    paste(out, crop(r, sw - R, sh - B, R, B), tw - R, th - B);
    // 四边
    const top = piece(L, 0, midSrcW, T, midDstW, T); if (top) paste(out, top, L, 0);
    const bottom = piece(L, sh - B, midSrcW, B, midDstW, B); if (bottom) paste(out, bottom, L, th - B);
    const left = piece(0, T, L, midSrcH, L, midDstH); if (left) paste(out, left, 0, T);
    const right = piece(sw - R, T, R, midSrcH, R, midDstH); if (right) paste(out, right, tw - R, T);
    // 中心
    const center = piece(L, T, midSrcW, midSrcH, midDstW, midDstH); if (center) paste(out, center, L, T);
    return out;
}

/**
 * 把某个颜色替换成另一个颜色或透明。返回改动像素数。
 * @param {Raster} r @param {number[]} target @param {number} tol @param {number[]|null} replacement
 */
export function replaceColor(r, target, tol, replacement) {
    let n = 0;
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] === 0 && replacement === null) continue;
        const d = Math.max(Math.abs(r.data[i] - target[0]), Math.abs(r.data[i + 1] - target[1]), Math.abs(r.data[i + 2] - target[2]));
        if (d > tol) continue;
        n++;
        if (replacement === null) { r.data[i + 3] = 0; }
        else { r.data[i] = replacement[0]; r.data[i + 1] = replacement[1]; r.data[i + 2] = replacement[2]; if (replacement[3] !== undefined) r.data[i + 3] = replacement[3]; }
    }
    return n;
}

/**
 * 取四角众数当背景色做色键抠除，可带羽化。
 * @param {Raster} r @param {{tol?:number, feather?:number}} [opts]
 * @returns {number} 移除的像素数
 */
export function removeBackground(r, opts = {}) {
    const tol = opts.tol ?? 18;
    const feather = opts.feather ?? 0;
    const corners = [[0, 0], [r.width - 1, 0], [0, r.height - 1], [r.width - 1, r.height - 1]].map(([x, y]) => getPixel(r, x, y));
    /** @type {Map<string,{c:number[],n:number}>} */
    const tally = new Map();
    for (const c of corners) {
        const k = (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3);
        const e = tally.get(k) || { c, n: 0 };
        e.n++; tally.set(k, e);
    }
    let best = corners[0]; let bestN = -1;
    for (const e of tally.values()) if (e.n > bestN) { bestN = e.n; best = e.c; }
    let removed = 0;
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] === 0) continue;
        const d = Math.max(Math.abs(r.data[i] - best[0]), Math.abs(r.data[i + 1] - best[1]), Math.abs(r.data[i + 2] - best[2]));
        if (d <= tol) { r.data[i + 3] = 0; removed++; }
        else if (feather > 0 && d <= tol + feather) {
            const t = (d - tol) / feather;
            r.data[i + 3] = Math.round(r.data[i + 3] * t);
        }
    }
    return removed;
}

/** @param {Raster} r @param {number} [threshold] @returns {{x:number,y:number,w:number,h:number}|null} */
export function alphaBBox(r, threshold = 0) {
    let minX = r.width; let minY = r.height; let maxX = -1; let maxY = -1;
    for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
            if (r.data[(y * r.width + x) * 4 + 3] > threshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** @param {Raster} r @param {number} [threshold] @returns {Raster} */
export function trim(r, threshold = 0) {
    const bb = alphaBBox(r, threshold);
    if (!bb) return clone(r);
    if (bb.x === 0 && bb.y === 0 && bb.w === r.width && bb.h === r.height) return clone(r);
    return crop(r, bb.x, bb.y, bb.w, bb.h);
}

function rgbToHsv(rr, gg, bb) {
    const r = rr / 255; const g = gg / 255; const b = bb / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
        if (h < 0) h += 1;
    }
    const s = max === 0 ? 0 : d / max;
    return [h, s, max];
}

function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0; let g = 0; let b = 0;
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

/** @param {Raster} r @param {number} [minSat] @param {number} [minVal] @returns {number|null} 0..1 */
export function dominantHue(r, minSat = 0.15, minVal = 0.12) {
    const buckets = new Int32Array(36);
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] < 40) continue;
        const [h, s, v] = rgbToHsv(r.data[i], r.data[i + 1], r.data[i + 2]);
        if (s < minSat || v < minVal) continue;
        buckets[Math.min(35, Math.floor(h * 36))]++;
    }
    let best = -1; let bestN = 0;
    for (let i = 0; i < 36; i++) if (buckets[i] > bestN) { bestN = buckets[i]; best = i; }
    if (best < 0) return null;
    // 用桶内均值细化
    let sum = 0; let n = 0;
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] < 40) continue;
        const [h, s, v] = rgbToHsv(r.data[i], r.data[i + 1], r.data[i + 2]);
        if (s < minSat || v < minVal) continue;
        if (Math.min(35, Math.floor(h * 36)) === best) { sum += h; n++; }
    }
    return n ? sum / n : best / 36;
}

/** @param {Raster} r @param {number} deltaTurns @param {number} [minSat] */
export function hueShift(r, deltaTurns, minSat = 0.06) {
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] === 0) continue;
        const [h, s, v] = rgbToHsv(r.data[i], r.data[i + 1], r.data[i + 2]);
        if (s < minSat) continue;
        let nh = (h + deltaTurns) % 1;
        if (nh < 0) nh += 1;
        const [rr, gg, bb] = hsvToRgb(nh, s, v);
        r.data[i] = rr; r.data[i + 1] = gg; r.data[i + 2] = bb;
    }
}

/** @param {Raster} r @param {number} targetHue @param {number} [minSat] @returns {number} 实际位移 */
export function normalizeHue(r, targetHue, minSat = 0.15) {
    const dom = dominantHue(r, minSat);
    if (dom === null) return 0;
    const delta = ((targetHue - dom) % 1 + 1) % 1;
    hueShift(r, delta, minSat);
    return delta;
}

/** @param {Raster} r @param {{brightness?:number,saturation?:number,contrast?:number}} [opts] */
export function adjust(r, opts = {}) {
    const br = opts.brightness ?? 1;
    const sat = opts.saturation ?? 1;
    const con = opts.contrast ?? 1;
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] === 0) continue;
        let rr = r.data[i]; let gg = r.data[i + 1]; let bb = r.data[i + 2];
        if (br !== 1) { rr *= br; gg *= br; bb *= br; }
        if (con !== 1) {
            rr = (rr - 128) * con + 128;
            gg = (gg - 128) * con + 128;
            bb = (bb - 128) * con + 128;
        }
        if (sat !== 1) {
            const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
            rr = l + (rr - l) * sat;
            gg = l + (gg - l) * sat;
            bb = l + (bb - l) * sat;
        }
        r.data[i] = Math.max(0, Math.min(255, Math.round(rr)));
        r.data[i + 1] = Math.max(0, Math.min(255, Math.round(gg)));
        r.data[i + 2] = Math.max(0, Math.min(255, Math.round(bb)));
    }
}

/** 固定网格切分。 @param {Raster} r @param {{cols:number,rows:number,margin?:number,spacing?:number}} opts @returns {Raster[]} */
export function sheetCells(r, opts) {
    const cols = Math.max(1, opts.cols); const rows = Math.max(1, opts.rows);
    const margin = opts.margin ?? 0; const spacing = opts.spacing ?? 0;
    const cw = Math.floor((r.width - margin * 2 - spacing * (cols - 1)) / cols);
    const ch = Math.floor((r.height - margin * 2 - spacing * (rows - 1)) / rows);
    const out = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            out.push(crop(r, margin + x * (cw + spacing), margin + y * (ch + spacing), cw, ch));
        }
    }
    return out;
}

/**
 * 自动按「空槽」切分拼图：找出行/列上完全透明的分隔带。
 * @param {Raster} r @param {{minCell?:number,maxCells?:number,alphaThreshold?:number}} [opts]
 * @returns {Raster[]}
 */
export function autoSheetCells(r, opts = {}) {
    const minCell = opts.minCell ?? 8;
    const maxCells = opts.maxCells ?? 256;
    const at = opts.alphaThreshold ?? 4;
    const colOpaque = new Uint8Array(r.width);
    const rowOpaque = new Uint8Array(r.height);
    for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
            if (r.data[(y * r.width + x) * 4 + 3] > at) { colOpaque[x] = 1; rowOpaque[y] = 1; }
        }
    }
    /** 把布尔游程转成 [start,end] 区间 */
    const runs = (flags, len) => {
        const out = [];
        let s = -1;
        for (let i = 0; i < len; i++) {
            if (flags[i] && s < 0) s = i;
            else if (!flags[i] && s >= 0) { out.push([s, i - 1]); s = -1; }
        }
        if (s >= 0) out.push([s, len - 1]);
        return out.filter(([a, b]) => b - a + 1 >= minCell);
    };
    const xr = runs(colOpaque, r.width);
    const yr = runs(rowOpaque, r.height);
    if (xr.length * yr.length <= 1 || xr.length * yr.length > maxCells) return [clone(r)];
    const out = [];
    for (const [y0, y1] of yr) for (const [x0, x1] of xr) out.push(crop(r, x0, y0, x1 - x0 + 1, y1 - y0 + 1));
    return out;
}

/** 给不透明区域向外加描边（就地）。 @param {Raster} r @param {number[]} rgba @param {number} [thickness] */
export function outline(r, rgba, thickness = 1) {
    let changed = false;
    for (let t = 0; t < Math.max(1, thickness); t++) {
        const src = new Uint8Array(r.data);
        for (let y = 0; y < r.height; y++) {
            for (let x = 0; x < r.width; x++) {
                const i = (y * r.width + x) * 4;
                if (src[i + 3] > 8) continue;
                let near = false;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = x + dx; const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= r.width || ny >= r.height) continue;
                    if (src[(ny * r.width + nx) * 4 + 3] > 128) { near = true; break; }
                }
                if (near) {
                    r.data[i] = rgba[0]; r.data[i + 1] = rgba[1]; r.data[i + 2] = rgba[2]; r.data[i + 3] = rgba[3] === undefined ? 255 : rgba[3];
                    changed = true;
                }
            }
        }
    }
    return changed;
}

/** 把全透明像素的 RGB 清零，避免色键污染。 @param {Raster} r */
export function trimTransparentToOpacity(r) {
    for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] === 0) { r.data[i] = 0; r.data[i + 1] = 0; r.data[i + 2] = 0; }
    }
}
