import { create, paste, getPixel, resize } from '../src/image/raster.js';
import * as D from '../src/image/draw.js';
import { decodePng, encodePng } from '../src/image/png.js';
import { readFileSync, writeFileSync } from 'node:fs';
const A = 'F:/Deepseek_harness/输入法皮肤/07-皮肤工程/闲云/assets';
const C = {
  deep:[10,40,46], base:[21,74,84], jade:[32,128,128], bright:[64,178,170],
  light:[168,228,205], pale:[222,248,236], cream:[240,252,246],
  gold:[255,226,150], goldD:[176,138,64],
  // 勾边色改用【整体配色里稍深一档】的青，而不是近黑 —— 近黑在白底上就是一道黑边。
  // 用户的原话："边缘用合适的颜色勾个边，一般是选择整体配色的稍微深一点的颜色去勾边"。
  ink:[26,104,110],
};

function panelV() {
  const W = 340, H = 420;
  const PX = 10, PY = 8, PW = 236, PH = H - 16, RAD = 24;
  const HEAD = 78;                       // 顶部头段高度
  const out = create(W, H, [0,0,0,0]);

  // ---- 图层1：面板主体 ----
  const panel = create(W, H);
  D.roundRect(panel, PX, PY, PW, PH, RAD, [...C.light, 250]);
  // 头：更浅
  {
    const hd = create(PW, HEAD);
    D.gradientStops(hd, 0, 0, PW, HEAD, [[0, [...C.cream, 253]], [1, [...C.pale, 251]]], 90);
    paste(panel, hd, PX, PY);
  }
  // 中：竖向浅→中
  {
    const md = create(PW, PH - HEAD - 90);
    D.gradientStops(md, 0, 0, PW, md.height, [
      [0.00, [...C.pale, 252]], [0.45, [...C.light, 250]], [1.00, [...C.bright, 250]],
    ], 90);
    paste(panel, md, PX, PY + HEAD);
  }
  // 尾：底部压深一点
  {
    const tl = create(PW, 90);
    D.gradientStops(tl, 0, 0, PW, 90, [[0, [...C.bright, 250]], [1, [...C.jade, 250]]], 90);
    paste(panel, tl, PX, PY + PH - 90);
  }
  // 竖向厚度
  {
    const v = create(PW, PH);
    D.gradientStops(v, 0, 0, PW, PH, [[0,[255,255,255,70]],[0.25,[255,255,255,12]],[0.75,[0,0,0,10]],[1,[0,0,0,44]]], 0);
    const cl = create(W, H); paste(cl, v, PX, PY);
    for (let i = 0; i < cl.data.length; i += 4) if (panel.data[i+3] < 8) cl.data[i+3] = 0;
    paste(panel, cl, 0, 0);
  }
  D.outlineAlpha(panel, [...C.ink, 150], 2);
  // 面板右缘渐隐：白底上原来是一条笔直的硬边（描边把它变成一道线）。
  // 文字最远到 x≈130，从 186 开始渐隐是安全的；那一段本来也被立绘盖住。
  {
    const FADE0 = 186, FADE1 = PX + PW + 4;
    for (let y = 0; y < H; y++) {
      for (let x = FADE0; x <= FADE1 && x < W; x++) {
        const k = Math.max(0, 1 - (x - FADE0) / (FADE1 - FADE0));
        const i = (y * W + x) * 4 + 3;
        panel.data[i] = Math.round(panel.data[i] * k);
      }
    }
  }
  paste(out, panel, 0, 0);

  // ---- 图层2：头部金饰（顶部横线 + 云卷） ----
  D.gradientStops(out, PX + 16, PY + 20, PW - 32, 2, [[0,[...C.goldD,0]],[0.3,[...C.goldD,200]],[1,[...C.goldD,60]]], 0);
  D.curve(out, [[PX+34, PY+40], [PX+23, PY+30], [PX+34, PY+22], [PX+45, PY+32], [PX+36, PY+39]], 2.2, [...C.goldD, 215], { samples: 10 });
  D.gradientStops(out, PX + 16, PY + 44, PW - 32, 1, [[0,[...C.goldD,0]],[0.3,[...C.goldD,110]],[1,[...C.goldD,30]]], 0);

  // ---- 图层3：右下立绘 ----
  {
    const st = decodePng(new Uint8Array(readFileSync(A + '/xianyun_stand.png')));
    const sc = Math.min(230 / st.width, 250 / st.height);
    const sr = resize(st, Math.round(st.width*sc), Math.round(st.height*sc), 'bilinear');
    D.innerGlow(sr, [...C.pale, 110], 5);
    paste(out, sr, W - sr.width + 22, H - sr.height + 6);
    for (const [cx, cy, s, dir, a] of [[286, 120, 18, 1, 120], [312, 176, 12, -1, 95]]) {
      D.curve(out, [[cx - dir*s*1.6, cy + s*0.45], [cx - dir*s, cy + s*0.15], [cx - dir*s*0.55, cy - s*0.6], [cx + dir*0.7, cy - s*0.05]],
        2.2, [...C.gold, a], { samples: 10 });
      // 与 panel_h 保持一致：每朵云卷下方压一道更细更淡的同形线做层次
      D.curve(out, [[cx - dir*s*1.6, cy + s*0.45 + 3], [cx - dir*s, cy + s*0.15 + 3],
        [cx - dir*s*0.55, cy - s*0.6 + 3], [cx + dir*0.7, cy - s*0.05 + 3]],
        1.1, [...C.gold, Math.round(a * 0.45)], { samples: 10 });
    }
    // ---- 装饰：立绘周围的青玉光点（与横排窗同一套语言）----
    // 全部落在面板右侧与下方 —— 竖排窗只在纵向拉伸，横向不动，所以这里安全。
    for (const [px, py, pr, a] of [[262, 96, 2.2, 115], [300, 148, 1.6, 90], [252, 214, 1.9, 100],
                                   [296, 250, 1.4, 80], [268, 296, 1.7, 90], [312, 330, 1.2, 70]]) {
      D.glow(out, px, py, pr * 2.6, [...C.bright, Math.round(a * 0.5)], 1.6);
      D.circle(out, px, py, pr, [...C.pale, a]);
    }
    // ---- 装饰：面板右上角一段金色细弧，与横排窗的流线呼应 ----
    D.curve(out, [[PX + PW - 6, PY + 62], [PX + PW + 14, PY + 56], [PX + PW + 36, PY + 68], [PX + PW + 58, PY + 60]],
      1.2, [...C.goldD, 105], { samples: 12 });
  }

  writeFileSync(A + '/panel_v.png', Buffer.from(encodePng(out)));
  const ns = { left: 4, right: W - (PX + PW) + 2, top: HEAD + 2, bottom: 96 };
  writeFileSync(A + '/_ns_v.json', JSON.stringify(ns));
  console.log('panel_v ' + W + 'x' + H + '  nineSlice ' + JSON.stringify(ns) + '  可拉伸中段 ' + (PH - ns.top - ns.bottom) + 'px 高');
}
panelV();
