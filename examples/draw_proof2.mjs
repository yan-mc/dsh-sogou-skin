import { create, paste } from '../src/image/raster.js';
import * as D from '../src/image/draw.js';
import { encodePng } from '../src/image/png.js';
import { drawText } from '../src/image/font5x7.js';
import { writeFileSync } from 'node:fs';

const W = 900, H = 340;
const r = create(W, H, [14, 30, 34, 255]);
D.gradientStops(r, 0, 0, W, H, [[0, [10, 40, 46, 255]], [0.5, [22, 78, 88, 255]], [1, [8, 28, 34, 255]]], 70);

// 云纹形状（不规则）—— 用来检验「沿轮廓勾边」
const cloud = create(300, 170);
D.glow(cloud, 120, 95, 92, [40, 150, 140, 120], 1.8);
D.curve(cloud, [[30, 120], [70, 60], [130, 78], [180, 52], [250, 92], [270, 130]], 16, [58, 190, 175, 255], { samples: 14 });
D.circle(cloud, 96, 92, 30, [58, 190, 175, 255]);
D.circle(cloud, 196, 84, 22, [58, 190, 175, 255]);
D.radialGradient(cloud, 150, 95, 120, [[0, [200, 255, 240, 120]], [1, [200, 255, 240, 0]]], { elliptical: 1.6 });
D.grain(cloud, { amount: 7, seed: 7 });
paste(r, cloud, 30, 60);
const beforeOutline = create(300, 170); paste(beforeOutline, cloud, 0, 0);
// 沿轮廓勾边（深青色）
D.outlineAlpha(cloud, [10, 46, 50, 255], 3);
D.innerGlow(cloud, [180, 255, 235, 255], 7);
paste(r, cloud, 30, 60);

// 右：径向光 + 高斯模糊 + 多段渐变条
const orb = create(200, 170);
D.radialGradient(orb, 100, 85, 80, [[0, [255, 240, 190, 255]], [0.45, [90, 200, 180, 255]], [1, [12, 50, 56, 0]]]);
D.blurGaussian(orb, 3);
paste(r, orb, 380, 60);
D.gradientStops(r, 610, 70, 260, 46, [[0, [255, 233, 168, 255]], [0.35, [80, 200, 180, 255]], [0.7, [26, 96, 107, 255]], [1, [12, 40, 46, 255]]], 15);
D.grain(r, { amount: 6, seed: 3, region: [610, 70, 870, 116] });
D.roundRect(r, 610, 136, 260, 60, 14, [20, 62, 70, 255]);
D.innerGlow(r, [120, 230, 210, 255], 8);
D.outlineAlpha(r, [255, 233, 168, 200], 2, { inside: true });

drawText(r, 'MULTI-STOP / RADIAL / GRAIN / CONTOUR OUTLINE / INNER GLOW / GAUSSIAN', 24, 310, [140, 200, 195, 255], 1);
drawText(r, 'OUTLINE FOLLOWS THE SHAPE, NOT A ROUNDED BOX', 24, 20, [255, 233, 168, 255], 1);
writeFileSync('F:/Deepseek_harness/输入法皮肤/06-工作记录/draw_proof2.png', Buffer.from(encodePng(r)));
console.log('draw_proof2.png', W + 'x' + H);
