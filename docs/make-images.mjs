/**
 * 生成 README 用的效果图 —— **全部由代码画出来**。
 *
 *   node docs/make-images.mjs
 *
 * 输出到 docs/images/。刻意不使用任何外部素材：
 * 皮肤用程序化占位素材装配，界面元素用绘图原语画，所以这些图可以随仓库分发。
 *
 * ⚠️ 内置的 5x7 点阵字体只有 ASCII。图里的文字一律用英文，
 *    中文会渲染成方块（这一点是踩过的）。
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initProject, loadProject, assembleSkin } from '../src/skin/assemble.js';
import { renderCandidateWindow } from '../src/skin/render.js';
import { create, paste, resize, fillRect } from '../src/image/raster.js';
import { encodePng } from '../src/image/png.js';
import * as D from '../src/image/draw.js';
import { drawText, measureText } from '../src/image/font5x7.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'images');
mkdirSync(OUT, { recursive: true });

const C = {
    ink: [26, 104, 110], jade: [32, 128, 128], bright: [64, 178, 170],
    pale: [222, 248, 236], gold: [255, 226, 150], goldD: [176, 138, 64],
    dark: [12, 26, 32], dark2: [20, 46, 54], text: [214, 240, 236], dim: [120, 168, 166],
};
const T = (r, s, x, y, col, sc = 1) => drawText(r, s, x, y, col, sc);

/* ---------- 装一份演示皮肤（占位素材，无第三方内容） ---------- */
const proj = mkdtempSync(join(tmpdir(), 'readme-'));
initProject(proj, { name: 'readme-demo' });
const built = assembleSkin(loadProject(proj), proj);

/* ================= 1) hero ================= */
function hero() {
    const W = 1000, H = 460;
    const out = create(W, H, [0, 0, 0, 255]);
    D.gradientStops(out, 0, 0, W, H, [[0, [...C.dark, 255]], [0.5, [...C.dark2, 255]], [1, [...C.dark, 255]]], 70);
    D.glow(out, 180, 120, 230, [...C.jade, 40], 3);
    D.glow(out, 860, 380, 200, [...C.goldD, 24], 3);

    T(out, 'DSH SOGOU SKIN WORKSHOP', 34, 30, [...C.gold, 255], 2);
    T(out, 'parse  /  author  /  preview  /  pack  /  install', 34, 54, [...C.dim, 255], 1);
    T(out, 'zero dependencies  -  no third-party assets', 34, 68, [...C.dim, 200], 1);

    // 横排候选窗：真实引擎模型渲染
    const cand = renderCandidateWindow(built.files, {
        scheme: 'Scheme_H1', width: 760, height: 258,
        pinyin: 'xian yun', candidates: ['A', 'B', 'C', 'D', 'E'],
    });
    paste(out, cand.raster, 120, 128);

    // 状态栏：缩略图放进一块圆角底板
    const bar = renderCandidateWindow(built.files, { scheme: 'Scheme_V1', width: 300, height: 380 });
    if (bar && bar.raster) {
        const th = 176, tw = Math.max(1, Math.round(bar.raster.width * th / bar.raster.height));
        const thumb = resize(bar.raster, tw, th);
        const bx = W - tw - 62, by = 150;
        D.roundRect(out, bx - 12, by - 12, tw + 24, th + 24, 14, [10, 30, 36, 210]);
        D.outlineAlpha(out, [...C.jade, 130], 2);
        paste(out, thumb, bx, by);
        T(out, 'STATUSBAR', bx - 4, by + th + 18, [...C.dim, 255], 1);
    }
    T(out, 'CANDIDATE WINDOW  (engine model, two text rows)', 120, 396, [...C.dim, 255], 1);
    return out;
}

/* ================= 2) pipeline ================= */
function pipeline() {
    const steps = [
        ['assets', 'your images'],
        ['skin_init', 'make project'],
        ['skin_assign', 'map roles'],
        ['skin_assemble', 'build tree + ini'],
        ['skin_preview', 'true render + bg check'],
        ['skin_pack', 'zip or v3 .ssf'],
        ['skin_install', 'copy into Sogou'],
    ];
    const BW = 208, BH = 78, GAP = 30, PAD = 36, COLS = 4, ROWS = 2;
    const W = PAD * 2 + COLS * BW + (COLS - 1) * GAP;
    const H = 128 + ROWS * BH + (ROWS - 1) * GAP + 46;
    const out = create(W, H, [0, 0, 0, 255]);
    D.gradientStops(out, 0, 0, W, H, [[0, [...C.dark, 255]], [1, [10, 34, 40, 255]]], 40);
    T(out, 'PIPELINE', PAD, 26, [...C.gold, 255], 2);
    T(out, 'node src/cli.js demo ./my-skin      # one command, placeholder assets', PAD, 50, [...C.dim, 255], 1);
    T(out, 'or drive it step by step through the 14 skin_* tools', PAD, 64, [...C.dim, 200], 1);

    const pos = [];
    for (let i = 0; i < steps.length; i++) {
        const r = Math.floor(i / COLS), c = i % COLS;
        const x = PAD + c * (BW + GAP), y = 100 + r * (BH + GAP);
        pos.push([x, y]);
        const last = i === steps.length - 1;
        D.roundRect(out, x, y, BW, BH, 12, last ? [44, 122, 110, 240] : [22, 62, 72, 235]);
        D.innerGlow(out, last ? [...C.gold, 90] : [...C.bright, 70], 6);
        D.outlineAlpha(out, [...C.ink, 190], 2);
        T(out, steps[i][0], x + 14, y + 16, [...C.pale, 255], 2);
        T(out, steps[i][1], x + 14, y + 42, [...C.gold, 210], 1);
        D.circle(out, x + BW - 20, y + 20, 10, [...C.goldD, 210]);
        T(out, String(i + 1), x + BW - 23, y + 16, [12, 30, 36, 255], 1);
    }
    for (let i = 0; i < steps.length - 1; i++) {
        const [x1, y1] = pos[i], [x2, y2] = pos[i + 1];
        if (y1 === y2) {
            D.line(out, x1 + BW + 5, y1 + BH / 2, x2 - 10, y1 + BH / 2, 2, [...C.bright, 180]);
            D.curve(out, [[x2 - 18, y1 + BH / 2 - 5], [x2 - 10, y1 + BH / 2], [x2 - 18, y1 + BH / 2 + 5]], 2, [...C.bright, 210], { samples: 8 });
        } else {
            const mx = PAD + BW / 2;
            D.curve(out, [[x1 + BW / 2, y1 + BH + 4], [x1 + BW / 2, y2 - 20], [mx, y2 - 20], [mx, y2 - 10]], 2, [...C.bright, 180], { samples: 14 });
            D.curve(out, [[mx - 5, y2 - 18], [mx, y2 - 10], [mx + 5, y2 - 18]], 2, [...C.bright, 210], { samples: 8 });
        }
    }
    return out;
}

/* ================= 3) bgcheck ================= */
function bgcheck() {
    const PW = 452, PH = 300, PAD = 24, GAP = 20;
    // 必须按底图的【原始高度】渲染，否则占位皮肤的拼音行（在 y=152）会落到画布外被裁掉。
    const cand = renderCandidateWindow(built.files, {
        scheme: 'Scheme_H1', width: 560, height: 200,
        pinyin: 'ni hao', candidates: ['A', 'B', 'C', 'D', 'E'],
    });
    const fitW = 420;
    const small = resize(cand.raster, fitW, Math.round(cand.raster.height * fitW / cand.raster.width));
    const W = PAD * 2 + PW * 2 + GAP, H = 108 + PH;
    const out = create(W, H, [0, 0, 0, 255]);
    D.gradientStops(out, 0, 0, W, H, [[0, [...C.dark, 255]], [1, [10, 34, 40, 255]]], 30);
    T(out, 'EVERY CHANGE IS CHECKED ON WHITE AND ON BLACK', PAD, 24, [...C.gold, 255], 2);
    T(out, 'dark outlines are invisible on black and obvious on white', PAD, 48, [...C.dim, 255], 1);
    const cw = small.width, ch = small.height;
    for (const [i, bg] of [[0, [255, 255, 255, 255]], [1, [0, 0, 0, 255]]]) {
        const x = PAD + i * (PW + GAP);
        fillRect(out, x, 72, PW, PH - 24, bg);
        D.outlineAlpha(out, [...C.jade, 150], 2);
        paste(out, small, x + 12, 72 + Math.round((PH - 24 - ch) / 2));
        T(out, i === 0 ? 'ON WHITE' : 'ON BLACK', x + 10, H - 44, [...C.dim, 255], 1);
    }
    return out;
}

/* ================= 4) modules ================= */
function modules() {
    const layers = [
        ['skin/', [['spec', 'keys + presets'], ['layout', 'nine-slice audit'], ['assemble', 'build tree'], ['preview', 'mock + stretch'], ['render', 'engine model'], ['probe', 'asset scan'], ['placeholder', 'code-drawn art']], [32, 128, 128]],
        ['ssf/', [['zip', 'hand-written'], ['container', '3 generations + v3 AES'], ['ini', 'UTF-16LE, BGR']], [64, 178, 170]],
        ['image/', [['png', '8/16-bit, Adam7'], ['bmp', 'incl. Sogou variant'], ['raster', 'scale / 9-slice / cutout'], ['draw', 'anti-aliased primitives'], ['font5x7', 'built-in bitmap font']], [176, 138, 64]],
    ];
    const W = 1000, PAD = 28, ROWH = 96, GAPY = 14;
    const H = 92 + layers.length * (ROWH + GAPY) + 20;
    const out = create(W, H, [0, 0, 0, 255]);
    D.gradientStops(out, 0, 0, W, H, [[0, [...C.dark, 255]], [1, [10, 34, 40, 255]]], 40);
    T(out, 'MODULES', PAD, 24, [...C.gold, 255], 2);
    T(out, 'each layer only depends on the ones below it', PAD, 48, [...C.dim, 255], 1);

    let y = 84;
    for (const [name, items, col] of layers) {
        D.roundRect(out, PAD, y, W - PAD * 2, ROWH, 12, [16, 44, 52, 228]);
        D.outlineAlpha(out, [...col, 150], 2);
        D.roundRect(out, PAD + 12, y + 14, 108, ROWH - 28, 8, [...col, 215]);
        T(out, name, PAD + 24, y + ROWH / 2 - 4, [10, 28, 32, 255], 2);
        // 两行排布，避免溢出
        let x = PAD + 138, row = 0;
        for (const [n, d] of items) {
            const w = Math.max(measureText(n, 1).w, measureText(d, 1).w) + 22;
            if (x + w > W - PAD - 12) { x = PAD + 138; row++; }
            const iy = y + 16 + row * 34;
            D.roundRect(out, x, iy, w, 30, 6, [30, 76, 84, 232]);
            T(out, n, x + 11, iy + 4, [...C.text, 255], 1);
            T(out, d, x + 11, iy + 16, [...C.dim, 220], 1);
            x += w + 8;
        }
        y += ROWH + GAPY;
    }
    return out;
}

for (const [name, r] of [['hero', hero()], ['pipeline', pipeline()], ['bgcheck', bgcheck()], ['modules', modules()]]) {
    const p = join(OUT, name + '.png');
    writeFileSync(p, Buffer.from(encodePng(r)));
    console.log(name.padEnd(10) + r.width + 'x' + r.height + '  ' + p);
}
console.log('\nall output in docs/images/');
