// 状态栏重做：去掉外层方框，Q 版直接呈现 + 沿其真实轮廓细勾边
import { create, paste, resize, alphaBBox } from '../src/image/raster.js';
import * as D from '../src/image/draw.js';
import { decodePng, encodePng } from '../src/image/png.js';
import { readFileSync, writeFileSync } from 'node:fs';
const A = 'F:/Deepseek_harness/输入法皮肤/07-皮肤工程/闲云/assets';
// 青玉色板（勾边用"整体配色里稍深一点"的颜色，而不是近黑 —— 近黑在白底上就是一道黑边）
const C = { deep:[18,62,68], jade:[32,128,128], bright:[64,178,170], light:[168,228,205], pale:[222,248,236], gold:[255,226,150], goldD:[176,138,64] };

function statusBar() {
  const W = 122, H = 122;
  const out = create(W, H, [0,0,0,0]);
  // ---- Q 版：放大到 84px，居中 ----
  const q = decodePng(new Uint8Array(readFileSync(A + '/xianyun_q.png')));
  // Q 版缩到 76px：122x122 里要在它周围留出一圈放 9 个 20x20 的按钮，
  // 84px 时四周只剩 19px，放不下一圈图标。
  const sc = Math.min(76 / q.width, 76 / q.height);
  const qr = resize(q, Math.max(1, Math.round(q.width*sc)), Math.max(1, Math.round(q.height*sc)), 'bilinear');
  const cx = Math.round(W/2), cy = Math.round(H/2);
  const qx = cx - Math.round(qr.width/2), qy = cy - Math.round(qr.height/2);

  // ---- 底层：极淡的柔光，让 Q 版在白底上也能浮起来（不是方框）----
  const glow = create(W, H);
  D.glow(glow, cx, cy, Math.round(qr.width*0.62), [...C.jade, 58], 2.0);
  paste(out, glow, 0, 0);

  // ---- 勾边：沿着 Q 版自身的 alpha 轮廓走，用"配色里稍深的一档"而不是近黑 ----
  const layer = create(W, H);
  paste(layer, qr, qx, qy);
  D.outlineAlpha(layer, [...C.deep, 200], 2);          // 贴着人物剪影外扩 2px
  D.innerGlow(layer, [...C.pale, 90], 3);               // 内侧一圈极淡亮边，增加分离度
  paste(out, layer, 0, 0);

  // ---- 四角云纹（细，金色，不构成框）----
  // 四角：如意云头（一个卷 + 一条尾），比单纯的弧线更像"云纹"
  const yunwen = (cx, cy, s, dx, dy, a) => {
    D.curve(out, [
      [cx - dx * s * 2.3, cy + dy * s * 0.35],
      [cx - dx * s * 1.25, cy + dy * s * 0.95],
      [cx - dx * s * 0.15, cy + dy * s * 0.62],
      [cx - dx * s * 0.42, cy - dy * s * 0.18],
      [cx - dx * s * 1.28, cy - dy * s * 0.02],
      [cx - dx * s * 1.12, cy + dy * s * 0.42],
    ], 1.5, [...C.goldD, a], { samples: 12 });
    // 尾巴：从卷的右侧甩出去一小段，收细
    // 尾巴：以前甩到 3.7*s，在角上会直接跑出画布被切掉。收到 2.4*s 以内，全部留在画布内。
    D.curve(out, [
      [cx - dx * s * 1.7, cy + dy * s * 0.5],
      [cx - dx * s * 2.1, cy + dy * s * 0.72],
      [cx - dx * s * 2.4, cy + dy * s * 0.5],
    ], 1.1, [...C.goldD, Math.round(a * 0.7)], { samples: 10 });
  };
  yunwen(20, 20, 6.5, 1, 1, 165);
  yunwen(102, 20, 6.5, -1, 1, 165);
  yunwen(20, 102, 6.0, 1, -1, 150);
  yunwen(102, 102, 6.0, -1, -1, 150);
  return out;
}
const bar = statusBar();
writeFileSync(A + '/bar.png', Buffer.from(encodePng(bar)));
const bb = alphaBBox(bar, 8);
console.log('新状态栏 -> ' + bar.width + 'x' + bar.height + '   内容区 ' + JSON.stringify(bb));
console.log('（旧版是 122x122 的圆角方框铺满整张，现在只有 Q 版与四角云纹）');
