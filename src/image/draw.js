// @ts-check
/**
 * 绘图原语库 —— 带抗锯齿的线条/曲线/形状、渐变、发光、模糊与投影。
 * 之前画素材全靠脚本里手写循环，只能画色块；这个模块让「用代码画精细图形」成为可能。
 */
import { create, getPixel, setPixel, clone } from './raster.js';

/** 统一的抗锯齿落点：按覆盖率把颜色叠加到目标像素上。 */
function blend(r, x, y, c, cover) {
    if (cover <= 0) return;
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= r.width || yi >= r.height) return;
    const i = (yi * r.width + xi) * 4;
    const a = Math.min(1, cover) * ((c[3] === undefined ? 255 : c[3]) / 255);
    const da = r.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    r.data[i] = Math.round((c[0] * a + r.data[i] * da * (1 - a)) / oa);
    r.data[i + 1] = Math.round((c[1] * a + r.data[i + 1] * da * (1 - a)) / oa);
    r.data[i + 2] = Math.round((c[2] * a + r.data[i + 2] * da * (1 - a)) / oa);
    r.data[i + 3] = Math.round(oa * 255);
}

/** 点到线段的距离（用于画带宽度的线段并算覆盖率）。 */
function distSeg(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx, qy = y0 + t * dy;
    return Math.hypot(px - qx, py - qy);
}

/**
 * 抗锯齿线段。
 * @param {import('./raster.js').Raster} r
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width @param {number[]} color
 * @param {{cap?:'round'|'butt'}} [opts]
 */
export function line(r, x0, y0, x1, y1, width, color, opts = {}) {
    const hw = Math.max(0.35, width / 2);
    const xa = Math.floor(Math.min(x0, x1) - hw - 2), xb = Math.ceil(Math.max(x0, x1) + hw + 2);
    const ya = Math.floor(Math.min(y0, y1) - hw - 2), yb = Math.ceil(Math.max(y0, y1) + hw + 2);
    for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
            const d = distSeg(x + 0.5, y + 0.5, x0, y0, x1, y1);
            const cover = Math.max(0, Math.min(1, hw + 0.5 - d));
            if (cover > 0) blend(r, x, y, color, cover);
        }
    }
}

/**
 * 抗锯齿贝塞尔 / 折线（Catmull-Rom 转采样后逐段画）。
 * @param {import('./raster.js').Raster} r
 * @param {number[][]} pts [[x,y],...]
 * @param {number} width @param {number[]} color
 * @param {{closed?:boolean, samples?:number}} [opts]
 */
export function polyline(r, pts, width, color, opts = {}) {
    if (pts.length < 2) return;
    const hw = Math.max(0.35, width / 2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const x0 = Math.max(0, Math.floor(minX - hw - 2));
    const y0 = Math.max(0, Math.floor(minY - hw - 2));
    const x1 = Math.min(r.width - 1, Math.ceil(maxX + hw + 2));
    const y1 = Math.min(r.height - 1, Math.ceil(maxY + hw + 2));
    if (x1 < x0 || y1 < y0) return;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    // 关键：先在覆盖度缓冲里对每一段取 max，最后只 blend 一次。
    // 之前是"每段各自画一条抗锯齿线"，段与段重叠处被 blend 两次，
    // 于是接缝处出现深浅不一的结节、外轮廓也呈多边形折线 —— 这就是锯齿的来源。
    const cov = new Float32Array(bw * bh);
    for (let i = 0; i + 1 < pts.length; i++) {
        const ax = pts[i][0], ay = pts[i][1];
        const bx = pts[i + 1][0], by = pts[i + 1][1];
        const sx = Math.max(x0, Math.floor(Math.min(ax, bx) - hw - 2));
        const ex = Math.min(x1, Math.ceil(Math.max(ax, bx) + hw + 2));
        const sy = Math.max(y0, Math.floor(Math.min(ay, by) - hw - 2));
        const ey = Math.min(y1, Math.ceil(Math.max(ay, by) + hw + 2));
        for (let py = sy; py <= ey; py++) {
            for (let px = sx; px <= ex; px++) {
                const d = distSeg(px + 0.5, py + 0.5, ax, ay, bx, by);
                const c = hw + 0.5 - d;
                if (c <= 0) continue;
                const k = (py - y0) * bw + (px - x0);
                if (c > 1) { cov[k] = 1; continue; }
                if (c > cov[k]) cov[k] = c;
            }
        }
    }
    for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
            const c = cov[(py - y0) * bw + (px - x0)];
            if (c > 0) blend(r, px, py, color, c);
        }
    }
}

/**
 * 平滑曲线：先按 Catmull-Rom 采样成密集折线，再交给 polyline 一次性光栅化。
 * 默认采样数比以前高得多，弧线才不会看出折线感。
 * @param {import('./raster.js').Raster} r
 * @param {number[][]} pts 控制点
 * @param {number} width @param {number[]} color
 * @param {{closed?:boolean, samples?:number}} [opts]
 */
export function curve(r, pts, width, color, opts = {}) {
    if (pts.length < 2) return;
    const samples = opts.samples ?? 28;
    const P = opts.closed ? [...pts, pts[0], pts[1]] : pts;
    /** @type {number[][]} */
    const path = [P[0]];
    for (let i = 1; i < P.length - (opts.closed ? 2 : 0); i++) {
        const p0 = P[i - 2] || P[i - 1];
        const p1 = P[i - 1], p2 = P[i], p3 = P[i + 1] || P[i];
        for (let s = 1; s <= samples; s++) {
            const t = s / samples, t2 = t * t, t3 = t2 * t;
            const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
            const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
            path.push([x, y]);
        }
    }
    polyline(r, path, width, color);
}

/**
 * 抗锯齿圆 / 圆环。
 * @param {import('./raster.js').Raster} r
 * @param {number} cx @param {number} cy @param {number} radius
 * @param {number[]} color @param {{ring?:number, alphaFalloff?:number}} [opts] ring>0 时只画环
 */
export function circle(r, cx, cy, radius, color, opts = {}) {
    const ring = opts.ring ?? 0;
    const xa = Math.floor(cx - radius - 2), xb = Math.ceil(cx + radius + 2);
    const ya = Math.floor(cy - radius - 2), yb = Math.ceil(cy + radius + 2);
    for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            let cover;
            if (ring > 0) {
                const inner = radius - ring;
                cover = Math.min(
                    Math.max(0, Math.min(1, radius + 0.5 - d)),
                    Math.max(0, Math.min(1, d - inner + 0.5)));
            } else {
                cover = Math.max(0, Math.min(1, radius + 0.5 - d));
            }
            if (cover > 0) blend(r, x, y, color, cover);
        }
    }
}

/**
 * 抗锯齿圆角矩形（实心或描边）。
 * @param {import('./raster.js').Raster} r
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} radius @param {number[]} color @param {{ring?:number}} [opts]
 */
export function roundRect(r, x, y, w, h, radius, color, opts = {}) {
    const rad = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    const ring = opts.ring ?? 0;
    for (let yy = Math.floor(y - 2); yy <= Math.ceil(y + h + 2); yy++) {
        for (let xx = Math.floor(x - 2); xx <= Math.ceil(x + w + 2); xx++) {
            const px = xx + 0.5, py = yy + 0.5;
            const qx = Math.abs(px - (x + w / 2)) - (w / 2 - rad);
            const qy = Math.abs(py - (y + h / 2)) - (h / 2 - rad);
            const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
            let cover = Math.max(0, Math.min(1, 0.5 - d));
            if (ring > 0) cover = Math.min(cover, Math.max(0, Math.min(1, d + ring + 0.5)));
            if (cover > 0) blend(r, xx, yy, color, cover);
        }
    }
}

/**
 * 线性渐变填充（可指定角度）。
 * @param {import('./raster.js').Raster} r
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number[]} c0 @param {number[]} c1 @param {number} [angleDeg]
 */
export function linearGradient(r, x, y, w, h, c0, c1, angleDeg = 0) {
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => px * dx + py * dy);
    const lo = Math.min(...pts), hi = Math.max(...pts);
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(r.height, y + h); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(r.width, x + w); xx++) {
            const t = hi > lo ? ((xx + 0.5) * dx + (yy + 0.5) * dy - lo) / (hi - lo) : 0;
            blend(r, xx, yy, [
                Math.round(c0[0] + (c1[0] - c0[0]) * t),
                Math.round(c0[1] + (c1[1] - c0[1]) * t),
                Math.round(c0[2] + (c1[2] - c0[2]) * t),
                Math.round((c0[3] ?? 255) + ((c1[3] ?? 255) - (c0[3] ?? 255)) * t),
            ], 1);
        }
    }
}

/** 径向柔光/光晕。 @param {import('./raster.js').Raster} r */
export function glow(r, cx, cy, radius, color, falloff = 2.2) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
            if (d >= 1) continue;
            blend(r, x, y, color, Math.pow(1 - d, falloff));
        }
    }
}

/**
 * 盒式模糊（就地），用于柔化边缘与做投影。
 * @param {import('./raster.js').Raster} r @param {number} radius
 */
export function blur(r, radius) {
    const rad = Math.max(1, Math.round(radius));
    const { width: W, height: H } = r;
    let src = new Uint8Array(r.data);
    let dst = new Uint8Array(r.data.length);
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
                for (let k = -rad; k <= rad; k++) {
                    const xx = Math.min(W - 1, Math.max(0, x + k));
                    const i = (y * W + xx) * 4;
                    sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; sa += src[i + 3]; n++;
                }
                const o = (y * W + x) * 4;
                dst[o] = sr / n; dst[o + 1] = sg / n; dst[o + 2] = sb / n; dst[o + 3] = sa / n;
            }
        }
        const t = src; src = dst; dst = t;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
                for (let k = -rad; k <= rad; k++) {
                    const yy = Math.min(H - 1, Math.max(0, y + k));
                    const i = (yy * W + x) * 4;
                    sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; sa += src[i + 3]; n++;
                }
                const o = (y * W + x) * 4;
                dst[o] = sr / n; dst[o + 1] = sg / n; dst[o + 2] = sb / n; dst[o + 3] = sa / n;
            }
        }
        const t2 = src; src = dst; dst = t2;
    }
    r.data.set(src);
}

/** 给不透明内容加投影。 @param {import('./raster.js').Raster} r */
export function dropShadow(r, dx, dy, radius, color) {
    const { width: W, height: H } = r;
    const s = create(W, H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const sx = Math.round(x - dx), sy = Math.round(y - dy);
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
            const a = r.data[(sy * W + sx) * 4 + 3];
            const o = (y * W + x) * 4;
            s.data[o] = color[0]; s.data[o + 1] = color[1]; s.data[o + 2] = color[2];
            s.data[o + 3] = Math.round(a * ((color[3] ?? 255) / 255));
        }
    }
    blur(s, radius);
    for (let i = 0; i < r.data.length; i += 4) {
        const sa = s.data[i + 3] / 255;
        if (sa <= 0) continue;
        const da = r.data[i + 3] / 255;
        const oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        r.data[i] = Math.round((s.data[i] * sa + r.data[i] * da * (1 - sa)) / oa);
        r.data[i + 1] = Math.round((s.data[i + 1] * sa + r.data[i + 1] * da * (1 - sa)) / oa);
        r.data[i + 2] = Math.round((s.data[i + 2] * sa + r.data[i + 2] * da * (1 - sa)) / oa);
        r.data[i + 3] = Math.round(oa * 255);
    }
}
/* ============================================================================
 *  以下为「精细绘制」扩展：多段渐变、径向渐变、颗粒、沿轮廓勾边、内发光、真高斯模糊
 * ========================================================================== */

/**
 * 多段线性渐变（stops 形如 [[0,[r,g,b,a]], [0.5,[...]], [1,[...]]]）。
 * @param {import('./raster.js').Raster} r
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Array<[number, number[]]>} stops
 * @param {number} [angleDeg]
 */
export function gradientStops(r, x, y, w, h, stops, angleDeg = 90) {
    const st = [...stops].sort((a, b) => a[0] - b[0]);
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => px * dx + py * dy);
    const lo = Math.min(...corners), hi = Math.max(...corners);
    const sample = (t) => {
        if (t <= st[0][0]) return st[0][1];
        if (t >= st[st.length - 1][0]) return st[st.length - 1][1];
        for (let i = 1; i < st.length; i++) {
            if (t <= st[i][0]) {
                const f = (t - st[i - 1][0]) / Math.max(1e-6, st[i][0] - st[i - 1][0]);
                const c0 = st[i - 1][1], c1 = st[i][1];
                return [
                    c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f,
                    c0[2] + (c1[2] - c0[2]) * f, (c0[3] ?? 255) + ((c1[3] ?? 255) - (c0[3] ?? 255)) * f,
                ];
            }
        }
        return st[st.length - 1][1];
    };
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(r.height, y + h); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(r.width, x + w); xx++) {
            const t = hi > lo ? ((xx + 0.5) * dx + (yy + 0.5) * dy - lo) / (hi - lo) : 0;
            const c = sample(t);
            blend(r, xx, yy, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(c[3])], 1);
        }
    }
}

/**
 * 径向渐变（从中心向外按 stops 过渡）。
 * @param {import('./raster.js').Raster} r
 * @param {number} cx @param {number} cy @param {number} radius
 * @param {Array<[number, number[]]>} stops
 * @param {{elliptical?:number}} [opts] elliptical>1 时纵向压扁，做成椭圆光
 */
export function radialGradient(r, cx, cy, radius, stops, opts = {}) {
    const st = [...stops].sort((a, b) => a[0] - b[0]);
    const ey = opts.elliptical ?? 1;
    const sample = (t) => {
        if (t <= st[0][0]) return st[0][1];
        if (t >= st[st.length - 1][0]) return st[st.length - 1][1];
        for (let i = 1; i < st.length; i++) {
            if (t <= st[i][0]) {
                const f = (t - st[i - 1][0]) / Math.max(1e-6, st[i][0] - st[i - 1][0]);
                const c0 = st[i - 1][1], c1 = st[i][1];
                return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f,
                    c0[2] + (c1[2] - c0[2]) * f, (c0[3] ?? 255) + ((c1[3] ?? 255) - (c0[3] ?? 255)) * f];
            }
        }
        return st[st.length - 1][1];
    };
    const ry = radius * ey;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            const d = Math.hypot((x + 0.5 - cx) / radius, (y + 0.5 - cy) / ry);
            if (d > 1) continue;
            const c = sample(d);
            blend(r, x, y, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(c[3])], 1);
        }
    }
}

/** 确定性伪随机（同一个 seed 出同样的颗粒，方便复现）。 */
function rnd(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * 颗粒/噪点 —— 给渐变加质感，避免"塑料感"。
 * @param {import('./raster.js').Raster} r
 * @param {{amount?:number, seed?:number, mono?:boolean, region?:number[]}} [opts]
 */
export function grain(r, opts = {}) {
    const amount = opts.amount ?? 8;
    const next = rnd(opts.seed ?? 12345);
    const [x0, y0, x1, y1] = opts.region ?? [0, 0, r.width, r.height];
    for (let y = Math.max(0, y0); y < Math.min(r.height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(r.width, x1); x++) {
            const i = (y * r.width + x) * 4;
            if (r.data[i + 3] === 0) continue;
            const n = (next() - 0.5) * 2 * amount;
            const n2 = opts.mono ? n : (next() - 0.5) * 2 * amount;
            r.data[i] = Math.max(0, Math.min(255, r.data[i] + n));
            r.data[i + 1] = Math.max(0, Math.min(255, r.data[i + 1] + n2));
            r.data[i + 2] = Math.max(0, Math.min(255, r.data[i + 2] - n * 0.5));
        }
    }
}

/**
 * 沿【不透明区域的轮廓】勾边 —— 不是圆角方框，而是真正贴着图形边界走。
 * 原理：把 alpha 通道做形态学膨胀，减去自身，得到的就是一圈贴着轮廓的带。
 * @param {import('./raster.js').Raster} r
 * @param {number[]} color
 * @param {number} [width] 勾边宽度（像素）
 * @param {{inside?:boolean, threshold?:number, softness?:number}} [opts] inside=true 改为向内勾
 */
export function outlineAlpha(r, color, width = 2, opts = {}) {
    const W = r.width, H = r.height;
    const th = opts.threshold ?? 40;
    const w = Math.max(1, Math.round(width));
    const inside = !!opts.inside;
    const src = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < r.data.length; i += 4, p++) src[p] = r.data[i + 3];
    // 沿 3x3 结构元做形态学运算，走 w 轮。
    // 向外勾边 = 膨胀 - 原图；向内勾边 = 原图 - 腐蚀（之前这里用错了算子，
    // 向内模式会把整张不透明画布全涂满）。
    const step = (a, dilate) => {
        const out = new Uint8Array(a);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const p = y * W + x;
                if (dilate ? a[p] >= th : a[p] < th) continue;
                let hit = false;
                for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { if (!dilate) { hit = true; } continue; }
                    const q = a[ny * W + nx];
                    if (dilate ? q >= th : q < th) { hit = true; break; }
                }
                if (hit) out[p] = dilate ? 255 : 0;
            }
        }
        return out;
    };
    let cur = new Uint8Array(src);
    for (let k = 0; k < w; k++) cur = step(cur, !inside);
    // 先收集成覆盖度图，再做两次 3x3 盒式模糊（近似高斯）后混合。
    // 纯形态学膨胀得到的是二值边缘，放大看轮廓是阶梯状的 —— 4 倍放大一眼就看得出来。
    let cov = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = y * W + x;
            const inBand = inside
                ? (src[p] >= th && cur[p] < th)     // 原图内、但腐蚀后落到外面 -> 贴边内侧
                : (src[p] < th && cur[p] >= th);    // 原图外、但膨胀后落到里面 -> 贴边外侧
            if (inBand) cov[p] = 255;
        }
    }
    const tmp = new Uint8Array(W * H);
    // 一遍就够：两遍会把 2px 的边糊成 3px 的光晕，看着不像"勾边"而像发光。
    for (let pass = 0; pass < 1; pass++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let s = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy; if (ny < 0 || ny >= H) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx; if (nx < 0 || nx >= W) continue;
                        s += cov[ny * W + nx]; n++;
                    }
                }
                tmp[y * W + x] = Math.round(s / n);
            }
        }
        const sw = cov; cov = tmp.slice(); void sw;
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = cov[y * W + x];
            if (c > 0) blend(r, x, y, color, c / 255);
        }
    }
}

/**
 * 内发光：沿轮廓向内的一圈柔光，让图案从背景里"浮"起来。
 * @param {import('./raster.js').Raster} r @param {number[]} color @param {number} [radius]
 */
export function innerGlow(r, color, radius = 6) {
    const W = r.width, H = r.height;
    const src = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < r.data.length; i += 4, p++) src[p] = r.data[i + 3];
    let cur = new Uint8Array(src);
    const dist = new Int16Array(W * H).fill(9999);
    for (let p = 0; p < src.length; p++) if (src[p] < 40) dist[p] = 0;
    for (let k = 1; k <= radius; k++) {
        const nxt = new Uint8Array(cur);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const p = y * W + x;
            if (cur[p] >= 40) continue;
            let m = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                m = Math.max(m, cur[ny * W + nx]);
            }
            if (m >= 40) { nxt[p] = m; dist[p] = k; }
        }
        cur = nxt;
    }
    for (let p = 0; p < src.length; p++) {
        if (src[p] < 40 || dist[p] === 0 || dist[p] > radius) continue;
        const t = 1 - dist[p] / radius;
        blend(r, p % W, Math.floor(p / W), color, t * t);
    }
}

/**
 * 近似高斯模糊：连做三次盒式模糊，比单次盒式平滑得多。
 * @param {import('./raster.js').Raster} r @param {number} radius
 */
export function blurGaussian(r, radius) {
    const rad = Math.max(1, Math.round(radius / 2));
    blur(r, rad); blur(r, rad); blur(r, rad);
}
