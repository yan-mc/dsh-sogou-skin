import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readSkin } from '../src/ssf/container.js';
import { renderCandidateWindow } from '../src/skin/render.js';
import { decodePng, encodePng } from '../src/image/png.js';
import { create, paste } from '../src/image/raster.js';
import { drawText } from '../src/image/font5x7.js';

import { tmpDir, skip } from './_paths.mjs';
// 需要从搜狗皮肤站下载的「皮肤包 + 官方渲染图」配对（因版权不在仓库里）。
const D = process.env.SOGOU_SKIN_REFSKINS || '';
const OUT = tmpDir('compare-sogou');
if (skip('与官方渲染逐像素对比（需要 SOGOU_SKIN_REFSKINS 指向 refskins 目录）', D)) process.exit(0);
mkdirSync(OUT, { recursive: true });
const items = [];
for (const [id, label] of [['623069','苍翠欲滴'], ['621752','貂蝉'], ['623089','小白熊']]) {
  const s = readSkin(new Uint8Array(readFileSync(D + '/' + id + '.ssf')));
  const files = s.entries.map((e) => ({ name: e.name, data: e.data }));
  const sogou = decodePng(new Uint8Array(readFileSync(D + '/' + id + '_0.png')));
  // 按测出来的规律渲染：宽 400，高 = 底图原始高
  const mine = renderCandidateWindow(files, { scheme: 'Scheme_H1', width: 400, height: sogou.height,
    pinyin: 'sogou pinyin', candidates: ['a','b','c','d','e'], selected: 0 });
  items.push({ label, sogou, mine: mine.raster, notes: mine.notes });
}
const pad = 10, lab = 16;
const rowW = Math.max(...items.map((it) => it.sogou.width + it.mine.width + 12)) + pad * 2;
const H = 28 + items.reduce((a, it) => a + Math.max(it.sogou.height, it.mine.height) + lab + 14, 0) + pad;
const sheet = create(rowW, H, [24, 24, 30, 255]);
drawText(sheet, 'SOGOU RENDER (left)  vs  MY MODEL (right)', pad, 8, [240, 240, 250, 255], 1);
let y = 28;
for (const it of items) {
  drawText(sheet, it.label, pad, y - 12, [140, 200, 230, 255], 1);
  paste(sheet, it.sogou, pad, y);
  paste(sheet, it.mine, pad + it.sogou.width + 12, y);
  if (it.notes.length) drawText(sheet, it.notes[0].slice(0, 60), pad, y + it.sogou.height + 2, [255, 160, 120, 255], 1);
  y += Math.max(it.sogou.height, it.mine.height) + lab + 14;
}
writeFileSync(OUT + '/compare_sogou.png', Buffer.from(encodePng(sheet)));
console.log('compare_sogou.png ' + sheet.width + 'x' + sheet.height);
for (const it of items) console.log('  ' + it.label + '  底图渲染 ' + it.mine.width + 'x' + it.mine.height + '  vs  搜狗 ' + it.sogou.width + 'x' + it.sogou.height);
