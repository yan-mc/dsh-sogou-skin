/**
 * 绘图能力展示 —— 不需要任何素材，clone 下来直接跑：
 *
 *   node examples/draw-showcase.mjs
 *
 * 输出到 examples/out/，包含：
 *   primitives.png   绘图原语总览（曲线/渐变/发光/模糊/颗粒/沿轮廓勾边）
 *   panel-h.png      用代码画出一条候选窗横排底图（头 / 中 / 尾三段式）
 *   statusbar.png    用代码画出一个状态栏底图（中心图标 + 环形按钮位）
 *
 * 这是 examples/ 里唯一的示例，因为它**在哪都能跑**。
 * 真正的"像设计师一样做皮肤"的完整流程写在
 * skills/sogou-skin-authoring/SKILL.md 里。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { create, paste, resize, alphaBBox } from '../src/image/raster.js';
import * as D from '../src/image/draw.js';
import { encodePng } from '../src/image/png.js';
import { drawText } from '../src/image/font5x7.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

/** 一套克制的青玉配色 —— 深 / 底 / 主 / 亮 / 浅 / 极浅 / 金 / 墨 */
const C = {
    deep: [10, 40, 46], base: [21, 74, 84], jade: [32, 128, 128], bright: [64, 178, 170],
    light: [168, 228, 205], pale: [222, 248, 236], cream: [240, 252, 246],
    gold: [255, 226, 150], goldD: [176, 138, 64],
    // 勾边色取"配色里稍深一档"，不要用近黑 —— 近黑在白底上就是一道黑边
    ink: [26, 104, 110],
};

/* ------------------------------------------------------------------ */
/* 1. 绘图原语总览                                                      */
/* ------------------------------------------------------------------ */
function primitives() {
    const W = 900, H = 360;
    const r = create(W, H, [14, 30, 34, 255]);

    // 多段线性渐变打底
    D.gradientStops(r, 0, 0, W, H,
        [[0, [10, 40, 46, 255]], [0.5, [22, 78, 88, 255]], [1, [8, 28, 34, 255]]], 70);
    drawText(r, 'DRAW PRIMITIVES', 24, 16, [255, 233, 168, 255], 2);
    drawText(r, 'gradient / curve / glow / blur / grain / contour outline', 24, 34, [140, 200, 195, 255], 1);

    // 不规则形状 + 沿其真实轮廓勾边（不是圆角方框）
    const cloud = create(300, 180);
    D.curve(cloud, [[30, 122], [70, 62], [130, 80], [180, 54], [250, 94], [272, 132]],
        16, [...C.bright, 255], { samples: 14 });
    D.circle(cloud, 96, 94, 30, [...C.bright, 255]);
    D.circle(cloud, 196, 86, 22, [...C.bright, 255]);
    D.outlineAlpha(cloud, [...C.ink, 235], 3);   // ← 贴着剪影外扩，且已反锯齿
    D.innerGlow(cloud, [...C.pale, 150], 6);
    paste(r, cloud, 30, 90);

    // 径向渐变 + 高斯模糊
    const orb = create(220, 180);
    D.radialGradient(orb, 110, 90, 80,
        [[0, [255, 240, 190, 255]], [0.45, [90, 200, 180, 255]], [1, [12, 50, 56, 0]]]);
    D.blurGaussian(orb, 3);
    paste(r, orb, 360, 90);

    // 多段渐变条 + 颗粒
    D.gradientStops(r, 610, 96, 260, 46,
        [[0, [255, 233, 168, 255]], [0.35, [80, 200, 180, 255]], [0.7, [26, 96, 107, 255]], [1, [12, 40, 46, 255]]], 15);
    D.grain(r, { amount: 6, seed: 3, region: [610, 96, 870, 142] });

    // 圆角矩形 + 内发光 + 向内勾边
    D.roundRect(r, 610, 162, 260, 60, 14, [20, 62, 70, 255]);
    D.innerGlow(r, [120, 230, 210, 255], 8);
    D.outlineAlpha(r, [255, 233, 168, 200], 2, { inside: true });

    // 抗锯齿曲线
    D.curve(r, [[40, 320], [140, 250], [260, 330], [380, 260], [500, 320]],
        3, [...C.gold, 220], { samples: 24 });

    return r;
}

/* ------------------------------------------------------------------ */
/* 2. 横排候选窗底图：头 / 中 / 尾三段式                                 */
/* ------------------------------------------------------------------ */
function panelH() {
    const W = 700, H = 236;
    const BAR_Y = 156, BAR_H = 80, RAD = 26;     // 条子下沿必须贴到图片底边
    const HEAD = 120, MID_END = 430;
    const out = create(W, H, [0, 0, 0, 0]);

    // 主体胶囊
    const bar = create(W, H);
    D.roundRect(bar, 8, BAR_Y, MID_END + 40 - 8, BAR_H, RAD, [...C.light, 248]);

    // 头：浅色收口 + 左端云口内凹
    const head = create(HEAD + 8, BAR_H);
    D.gradientStops(head, 0, 0, head.width, BAR_H,
        [[0, [...C.cream, 252]], [1, [...C.pale, 252]]], 4);
    for (let x = 0; x < 24; x++) {
        const cut = Math.round(14 * Math.pow(1 - x / 24, 1.7));
        for (let y = 0; y < BAR_H; y++) {
            if (y < cut || y >= BAR_H - cut) head.data[(y * head.width + x) * 4 + 3] = 0;
        }
    }
    paste(bar, head, 8, BAR_Y);

    // 中：纯渐变（这一段会被九宫格无限拉伸，所以绝不能有任何花纹）
    const mid = create(MID_END - HEAD, BAR_H);
    D.gradientStops(mid, 0, 0, mid.width, BAR_H,
        [[0, [...C.pale, 252]], [0.4, [...C.light, 250]], [1, [...C.bright, 250]]], 5);
    paste(bar, mid, HEAD, BAR_Y);

    // 尾部
    const tail = create(64, BAR_H);
    D.gradientStops(tail, 0, 0, 64, BAR_H, [[0, [...C.bright, 250]], [1, [...C.jade, 250]]], 0);
    paste(bar, tail, MID_END, BAR_Y);

    // 竖向明暗，给条子厚度
    const v = create(W, BAR_H);
    D.gradientStops(v, 0, 0, W, BAR_H,
        [[0, [255, 255, 255, 96]], [0.22, [255, 255, 255, 26]], [0.55, [0, 0, 0, 0]],
         [0.86, [0, 0, 0, 22]], [1, [0, 0, 0, 64]]], 90);
    const clipped = create(W, H);
    paste(clipped, v, 0, BAR_Y);
    for (let i = 0; i < clipped.data.length; i += 4) if (bar.data[i + 3] < 8) clipped.data[i + 3] = 0;
    paste(bar, clipped, 0, 0);

    D.outlineAlpha(bar, [...C.ink, 170], 2);
    paste(out, bar, 0, 0);

    // 头部金饰（简洁：云头 + 两道金线）
    D.curve(out, [[32, BAR_Y + 34], [44, BAR_Y + 41], [56, BAR_Y + 33],
                  [54, BAR_Y + 21], [42, BAR_Y + 19], [43, BAR_Y + 28]],
        2.0, [...C.goldD, 230], { samples: 16 });
    D.circle(out, 48, BAR_Y + 30, 1.6, [...C.gold, 200]);
    D.gradientStops(out, 22, BAR_Y + 9, 82, 2, [[0, [...C.gold, 0]], [0.35, [...C.gold, 205]], [1, [...C.gold, 40]]], 0);
    D.gradientStops(out, 22, BAR_Y + BAR_H - 11, 82, 2, [[0, [...C.goldD, 0]], [0.35, [...C.goldD, 160]], [1, [...C.goldD, 35]]], 0);

    // 尾部装饰（全部限制在 x>470，绝不进中段）
    for (const [cx, cy, s, dir, a] of [[566, 40, 20, 1, 130], [640, 70, 14, -1, 100]]) {
        D.curve(out, [[cx - dir * s * 1.7, cy + s * 0.45], [cx - dir * s, cy + s * 0.15],
                      [cx - dir * s * 0.55, cy - s * 0.6], [cx + dir * 0.7, cy - s * 0.05]],
            2.2, [...C.gold, a], { samples: 10 });
        D.curve(out, [[cx - dir * s * 1.7, cy + s * 0.45 + 3], [cx - dir * s, cy + s * 0.15 + 3],
                      [cx - dir * s * 0.55, cy - s * 0.6 + 3], [cx + dir * 0.7, cy - s * 0.05 + 3]],
            1.1, [...C.gold, Math.round(a * 0.45)], { samples: 10 });
    }
    for (const [px, py, pr, a] of [[498, 96, 2.4, 120], [556, 74, 1.4, 80], [612, 128, 2.0, 100]]) {
        D.glow(out, px, py, pr * 2.6, [...C.bright, Math.round(a * 0.5)], 1.6);
        D.circle(out, px, py, pr, [...C.pale, a]);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* 3. 状态栏底图：中心图案 + 环形按钮位                                  */
/* ------------------------------------------------------------------ */
function statusBar() {
    const W = 122, H = 122;
    const out = create(W, H, [0, 0, 0, 0]);
    const cx = 61, cy = 61;

    // 中心图案这里用一个几何徽记代替（真实皮肤里放 Q 版立绘）
    D.glow(out, cx, cy, 40, [...C.jade, 58], 2.0);
    const mark = create(76, 76);
    D.circle(mark, 38, 38, 30, [...C.jade, 240]);
    D.circle(mark, 38, 38, 22, [...C.pale, 255]);
    D.circle(mark, 38, 38, 30, [...C.gold, 200], { ring: 2 });
    D.curve(mark, [[22, 44], [32, 26], [44, 42], [54, 24]], 3, [...C.deep, 220], { samples: 16 });
    // 沿徽记真实轮廓勾边（不是圆角方框）
    D.outlineAlpha(mark, [...C.deep, 200], 2);
    paste(out, mark, cx - 38, cy - 38);

    // 四角如意云头
    const yunwen = (x0, y0, s, dx, dy, a) => {
        D.curve(out, [[x0 - dx * s * 2.3, y0 + dy * s * 0.35], [x0 - dx * s * 1.25, y0 + dy * s * 0.95],
                      [x0 - dx * s * 0.15, y0 + dy * s * 0.62], [x0 - dx * s * 0.42, y0 - dy * s * 0.18],
                      [x0 - dx * s * 1.28, y0 - dy * s * 0.02], [x0 - dx * s * 1.12, y0 + dy * s * 0.42]],
            1.5, [...C.goldD, a], { samples: 12 });
        D.curve(out, [[x0 - dx * s * 1.7, y0 + dy * s * 0.5], [x0 - dx * s * 2.1, y0 + dy * s * 0.72],
                      [x0 - dx * s * 2.4, y0 + dy * s * 0.5]],
            1.1, [...C.goldD, Math.round(a * 0.7)], { samples: 10 });
    };
    yunwen(20, 20, 6.5, 1, 1, 165);
    yunwen(102, 20, 6.5, -1, 1, 165);
    yunwen(20, 102, 6.0, 1, -1, 150);
    yunwen(102, 102, 6.0, -1, -1, 150);

    // 环形按钮位示意（真实皮肤里这是 <按钮>_pos 的落点）
    const POS = [[30, 2], [51, 2], [72, 2], [2, 33], [2, 71], [100, 33], [100, 71], [40, 100], [62, 100]];
    for (const [x, y] of POS) {
        D.roundRect(out, x, y, 20, 20, 5, [18, 74, 82, 200]);
        D.roundRect(out, x, y, 20, 10, 5, [255, 255, 255, 16]);
    }
    return out;
}

/* ------------------------------------------------------------------ */
for (const [name, raster] of [['primitives', primitives()], ['panel-h', panelH()], ['statusbar', statusBar()]]) {
    const p = join(OUT, name + '.png');
    writeFileSync(p, Buffer.from(encodePng(raster)));
    const bb = alphaBBox(raster, 8);
    console.log(name.padEnd(12) + raster.width + 'x' + raster.height + '  内容区 ' + JSON.stringify(bb) + '  ->  ' + p);
}
console.log('\n全部输出在 examples/out/');
