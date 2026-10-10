import { create, paste, getPixel, resize } from '../src/image/raster.js';
import * as D from '../src/image/draw.js';
import { decodePng, encodePng } from '../src/image/png.js';
import { readFileSync, writeFileSync } from 'node:fs';

const A = 'F:/Deepseek_harness/输入法皮肤/07-皮肤工程/闲云/assets';
// 参照雷电将军：底子浅、文字深。中段走「浅青 → 中青」，不压深。
const C = {
  deep:[10,40,46], base:[21,74,84], jade:[32,128,128], bright:[64,178,170],
  light:[168,228,205], pale:[222,248,236], cream:[240,252,246],
  gold:[255,226,150], goldD:[176,138,64],
  // 勾边色改用【整体配色里稍深一档】的青，而不是近黑 —— 近黑在白底上就是一道黑边。
  // 用户的原话："边缘用合适的颜色勾个边，一般是选择整体配色的稍微深一点的颜色去勾边"。
  ink:[26,104,110],
};

function panelH() {
  const W = 700, H = 236;
  // 条子必须【贴到图片底边】：候选词列表会往条子下方排，底图那里若是透明的，
  // 列表就会掉到黑色桌面上（真机实测 y590 以下全是 (15,15,15) 就是这个原因）。
  const BAR_Y = 156, BAR_H = 80, RAD = 26;
  const HEAD = 120, MID_END = 430;
  const out = create(W, H, [0,0,0,0]);

  // ---- 图层1：胶囊主体 ----
  const bar = create(W, H);
  D.roundRect(bar, 8, BAR_Y, MID_END + 40 - 8, BAR_H, RAD, [...C.light, 248]);
  // 头：更浅，左端内凹成云口
  {
    const head = create(HEAD + 8, BAR_H);
    D.gradientStops(head, 0, 0, head.width, BAR_H, [
      // 头部渐变必须【收在 pale】—— 中段渐变正是从 pale 起步的。
      // 原来收在 light(168,228,205)，与中段起点 pale(222,248,236) 差 30 多，
      // 交界处 x=118→120 出现 53~64 的跳变，就是那条"截断的线"。
      [0.00, [...C.cream, 252]], [1.00, [...C.pale, 252]],
    ], 4);
    for (let x = 0; x < 24; x++) {
      const cut = Math.round(14 * Math.pow(1 - x / 24, 1.7));
      for (let y = 0; y < BAR_H; y++) if (y < cut || y >= BAR_H - cut) head.data[(y*head.width+x)*4+3] = 0;
    }
    paste(bar, head, 8, BAR_Y);
  }
  // 中：浅 → 中，纯渐变
  {
    const mid = create(MID_END - HEAD, BAR_H);
    D.gradientStops(mid, 0, 0, mid.width, BAR_H, [
      [0.00, [...C.pale, 252]], [0.40, [...C.light, 250]], [1.00, [...C.bright, 250]],
    ], 5);
    paste(bar, mid, HEAD, BAR_Y);
  }
  // 尾：中 → 深一点，给立绘当底
  {
    const t = create(64, BAR_H);
    D.gradientStops(t, 0, 0, 64, BAR_H, [[0, [...C.bright, 250]], [1, [...C.jade, 250]]], 0);
    paste(bar, t, MID_END, BAR_Y);
  }
  // 竖向明暗（厚度的关键）
  {
    const v = create(W, BAR_H);
    D.gradientStops(v, 0, 0, W, BAR_H, [
      [0.00, [255,255,255,96]], [0.22, [255,255,255,26]], [0.55, [0,0,0,0]],
      [0.86, [0,0,0,22]], [1.00, [0,0,0,64]],
    ], 90);
    const cl = create(W, H); paste(cl, v, 0, BAR_Y);
    for (let i = 0; i < cl.data.length; i += 4) if (bar.data[i+3] < 8) cl.data[i+3] = 0;
    paste(bar, cl, 0, 0);
  }
  D.outlineAlpha(bar, [...C.ink, 170], 2);
  paste(out, bar, 0, 0);

  // ---- 图层2：头部金饰（简洁） ----
  D.gradientStops(out, 26, BAR_Y + 10, 78, 2, [[0,[...C.goldD,0]],[0.35,[...C.goldD,215]],[1,[...C.goldD,45]]], 0);
  D.gradientStops(out, 26, BAR_Y + BAR_H - 12, 78, 2, [[0,[...C.goldD,0]],[0.35,[...C.goldD,175]],[1,[...C.goldD,40]]], 0);
  // 左端装饰：原来是单独一个金色环，看着单薄。
  // 改成【如意云头】—— 卷 + 尾，和状态栏四角用同一套语言。
  D.curve(out, [
    [32, BAR_Y + 34], [44, BAR_Y + 41], [56, BAR_Y + 33],
    [54, BAR_Y + 21], [42, BAR_Y + 19], [43, BAR_Y + 28],
  ], 2.0, [...C.goldD, 230], { samples: 16 });
  D.curve(out, [
    [32, BAR_Y + 34], [24, BAR_Y + 37], [16, BAR_Y + 32],
  ], 1.3, [...C.goldD, 155], { samples: 10 });
  // 卷心点一颗小金珠，让云头有"眼"
  D.circle(out, 48, BAR_Y + 30, 1.6, [...C.gold, 200]);

  // ---- 图层3：尾部立绘 + 云纹 ----
  {
    const st = decodePng(new Uint8Array(readFileSync(A + '/xianyun_stand.png')));
    const sc = Math.min(198 / st.width, 210 / st.height);
    const sr = resize(st, Math.round(st.width*sc), Math.round(st.height*sc), 'bilinear');
    D.innerGlow(sr, [...C.pale, 120], 5);
    paste(out, sr, 430, BAR_Y + BAR_H - sr.height + 24);
    for (const [cx, cy, s, dir, a] of [[566, 40, 20, 1, 130], [640, 70, 14, -1, 100], [672, 28, 10, 1, 85]]) {
      D.curve(out, [[cx - dir*s*1.7, cy + s*0.45], [cx - dir*s, cy + s*0.15], [cx - dir*s*0.55, cy - s*0.6], [cx + dir*0.7, cy - s*0.05]],
        2.2, [...C.gold, a], { samples: 10 });
      // 每朵云卷下方再压一道更细更淡的同形线 —— 叠出层次，不增加粗重感
      D.curve(out, [[cx - dir*s*1.7, cy + s*0.45 + 3], [cx - dir*s, cy + s*0.15 + 3],
        [cx - dir*s*0.55, cy - s*0.6 + 3], [cx + dir*0.7, cy - s*0.05 + 3]],
        1.1, [...C.gold, Math.round(a * 0.45)], { samples: 10 });
    }
    // ---- 装饰：立绘周围的青玉光点（呼应"闲云野鹤"的轻盈感）----
    // 只撒在尾部区（x>470），绝不进入可拉伸中段 —— 中段必须保持纯渐变。
    for (const [px, py, pr, a] of [[498, 96, 2.4, 120], [524, 140, 1.7, 95], [556, 74, 1.4, 80],
                                   [612, 128, 2.0, 100], [664, 108, 1.6, 85], [690, 150, 1.2, 70]]) {
      D.glow(out, px, py, pr * 2.6, [...C.bright, Math.round(a * 0.5)], 1.6);
      D.circle(out, px, py, pr, [...C.pale, a]);
    }
    // ---- 装饰：头部右侧一小段金色流线，把视线从条子引向立绘 ----
    D.curve(out, [[126, BAR_Y - 10], [150, BAR_Y - 16], [176, BAR_Y - 8], [200, BAR_Y - 14]],
      1.3, [...C.goldD, 110], { samples: 12 });
  }

  writeFileSync(A + '/panel_h.png', Buffer.from(encodePng(out)));
  writeFileSync(A + '/_ns_h.json', JSON.stringify({ left: HEAD, right: W - MID_END, top: BAR_Y - 4, bottom: 6 }));
  console.log('panel_h ' + W + 'x' + H + '  中段 ' + (MID_END-HEAD) + 'px');
  console.log('  中段亮度: ' + [140,240,340,420].map(x => getPixel(out, x, BAR_Y+BAR_H/2).slice(0,3).join(',')).join('  '));
}
panelH();
