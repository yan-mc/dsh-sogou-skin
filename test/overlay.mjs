import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { create, setPixel, fillRect, paste, replaceColor, removeBackground, outline, adjust, hueShift,
         alphaBBox, getPixel, containFit, clone, resize } from '../src/image/raster.js';
import { encodePng, decodePng } from '../src/image/png.js';
import { decodeBmp } from '../src/image/bmp.js';
import { drawText, measureText } from '../src/image/font5x7.js';
import { initProject, saveProject, loadProject, assembleSkin, writeSkinDir, buildSsf } from '../src/skin/assemble.js';
import { OVERLAY_PRESETS } from '../src/skin/spec.js';

const DIR = 'F:/Deepseek_harness/输入法皮肤/07-皮肤工程/演示-浮层按钮';
mkdirSync(join(DIR, 'assets'), { recursive: true });

// ---- 1) 程序化画两个翻页箭头（不涉及任何第三方素材） ----
function arrow(dir) {
  const r = create(17, 15, [0, 0, 0, 0]);
  for (let y = 0; y < 15; y++) {
    const half = dir === 'up' ? y : 14 - y;
    for (let x = 8 - half; x <= 8 + half; x++) setPixel(r, x, y, [235, 235, 245, 235]);
  }
  for (let y = 0; y < 15; y++) for (let x = 0; x < 17; x++) {
    const p = getPixel(r, x, y);
    if (p[3] > 0) setPixel(r, x, y, [40, 40, 55, p[3]]);
  }
  return r;
}
writeFileSync(join(DIR, 'assets', 'arrow_up.png'), Buffer.from(encodePng(arrow('up'))));
writeFileSync(join(DIR, 'assets', 'arrow_down.png'), Buffer.from(encodePng(arrow('down'))));

// ---- 2) 装配带浮层的皮肤 ----
const project = existsSync(join(DIR, 'skin.project.json')) ? loadProject(DIR) : initProject(DIR, { name: '浮层按钮演示', author: 'DSH 搜狗皮肤工坊' });
project.roles.panel_h = { generate: true };
project.roles.panel_v = { generate: true };
project.roles.bar = { generate: true };
project.roles.cn_en = { generate: true };
project.buttons.enabled = ['cn_en'];
project.overlays = [
  { section: 'Scheme_H1', name: 'pageup',   align: OVERLAY_PRESETS['H1-pageup-医生版'],   normal: ['assets/arrow_up.png'] },
  { section: 'Scheme_H1', name: 'pagedown', align: OVERLAY_PRESETS['H1-pagedown-医生版'], normal: ['assets/arrow_down.png'] },
  { section: 'Scheme_V1', name: 'pageup',   align: OVERLAY_PRESETS['V1-pageup-医生版'],   normal: ['assets/arrow_up.png'] },
  { section: 'Scheme_V1', name: 'pagedown', align: OVERLAY_PRESETS['V1-pagedown-医生版'], normal: ['assets/arrow_down.png'] },
];
saveProject(DIR, project);
const res = assembleSkin(project, DIR);
writeSkinDir(join(DIR, 'build'), res.files);
const built = buildSsf(res.files, { format: 'zip' });
writeFileSync(join(DIR, '浮层演示.ssf'), Buffer.from(built.data));
console.log('=== 浮层装配 ===');
console.log('文件 ' + res.files.length + ' 个，打包 ' + built.bytes + ' 字节，警告 ' + res.warnings.length + ' 条');
for (const w of res.warnings) console.log('  ! ' + w);
console.log('');
console.log('--- 生成的 Scheme_H1 浮层条目 ---');
console.log(res.ini.split('[Scheme_H1]')[1].split('[Scheme_H2]')[0].split('\n').filter(l => /pageup|pagedown|layered/.test(l)).join('\n'));
console.log('--- 生成的 Scheme_V1 浮层条目 ---');
console.log(res.ini.split('[Scheme_V1]')[1].split('[Scheme_V2]')[0].split('\n').filter(l => /pageup|pagedown|layered/.test(l)).join('\n'));

// ---- 3) 演示「AI 修图」：拿用户自己皮肤里的一张图标做修复 ----
console.log('');
console.log('=== skin_repair 修图演示（用你自己皮肤里的 cn1.bmp） ===');
const raw = new Uint8Array((await import('node:fs')).readFileSync('F:/Deepseek_harness/输入法皮肤/06-工作记录/extracted/cn1.bmp'));
let img = decodeBmp(raw);
console.log('原图: ' + img.width + 'x' + img.height + ' 四角颜色 ' + [getPixel(img,0,0).slice(0,3), getPixel(img,19,19).slice(0,3)].map(c=>c.join(',')).join(' / '));
let beforeAfter = [];

// 步骤1 去背景
let s1 = clone(img);
const removed = removeBackground(s1, { tol: 26, feather: 8 });
console.log('1. removeBackground(tol=26, feather=8) -> 抠掉 ' + removed + ' 像素，剩余内容区 ' + JSON.stringify(alphaBBox(s1, 8)));

// 步骤2 收紧到内容
let s2 = containFit(s1, 20, 20);
// 步骤3 加描边（让图标在任何底图上都清晰）
outline(s2, [255, 255, 255, 255], 1);
console.log('2. containFit(20x20) + outline(white,1) -> 完成');

// 步骤4 换色（示范"改主题色"）
let s3 = clone(s2);
hueShift(s3, 0.42, 0.05);
console.log('3. hueShift(+151°) -> 主题色改成青绿');

// 拼一张前后对比
const CELL = 90;
const canvas = create(CELL * 4 + 40, CELL + 46, [22, 22, 28, 255]);
const labels = ['原图', '去背景', '加描边', '换色'];
const stages = [img, s1, s2, s3];
stages.forEach((st, i) => {
  const scaled = resize(st, CELL, CELL, 'nearest');
  const x = 10 + i * (CELL + 7);
  fillRect(canvas, x, 24, CELL, CELL, [48, 48, 56, 255]);
  paste(canvas, scaled, x, 24);
  drawText(canvas, labels[i].charCodeAt(0) > 127 ? 'STEP ' + (i + 1) : labels[i], x, 8, [220, 220, 235, 255], 1);
});
writeFileSync('F:/Deepseek_harness/输入法皮肤/04-生成产物/预览图/修图演示.png', Buffer.from(encodePng(canvas)));
console.log('对比图 -> 04-生成产物/预览图/修图演示.png');
