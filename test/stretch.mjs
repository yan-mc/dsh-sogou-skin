import { loadProject, saveProject, assembleSkin, writeSkinDir, buildSsf } from '../src/skin/assemble.js';
import { renderMock, renderStretchTest, toPng } from '../src/skin/preview.js';
import { writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

// 需要一份真实的皮肤工程（因版权不在仓库里）。没配 SOGOU_SKIN_PROJECTS 就跳过。
import { project, tmpDir, skip } from './_paths.mjs';
const DIR = project('复刻-雷电将军');
const OUT = tmpDir('stretch');
if (skip('九宫格拉伸体检', DIR)) process.exit(0);
const base = loadProject(DIR);

async function build(project, tag) {
  const res = assembleSkin(project, DIR);
  mkdirSync(join(DIR, 'preview'), { recursive: true });
  writeFileSync(join(OUT, tag + '-stretch.png'), Buffer.from(toPng(renderStretchTest(res.files))));
  return res;
}

// A) 复现 bug：left=0
const buggy = JSON.parse(JSON.stringify(base));
buggy.nineSlice.panel_h = { left: 0, right: 300, top: 33, bottom: 11 };
const ra = await build(buggy, 'A-buggy');
console.log('=== A) left=0（你遇到的 bug）===');
console.log('  生成 layout_horizontal = 0,' + ra.layoutInfo.panel_h.nineSlice.left + ',' + ra.layoutInfo.panel_h.nineSlice.right);
console.log('  体检: 水平细节密度=' + ra.layoutInfo.panel_h.audit.hDetail + '  可拉伸中段宽=' + ra.layoutInfo.panel_h.audit.midW);
for (const w of ra.warnings.filter(w => /九宫格|left|拉伸|变形/.test(w))) console.log('  ⚠ ' + w);

// B) 修复版
const fixed = JSON.parse(JSON.stringify(base));
const rb = await build(fixed, 'B-fixed');
console.log('');
console.log('=== B) left=100（修复后，与原皮肤作者标定一致）===');
console.log('  生成 layout_horizontal = 0,' + rb.layoutInfo.panel_h.nineSlice.left + ',' + rb.layoutInfo.panel_h.nineSlice.right);
console.log('  体检: 水平细节密度=' + rb.layoutInfo.panel_h.audit.hDetail + '  可拉伸中段宽=' + rb.layoutInfo.panel_h.audit.midW);
const rel = rb.warnings.filter(w => /九宫格|left|拉伸|变形/.test(w));
if (!rel.length) console.log('  ✅ 九宫格相关警告：0 条');
for (const w of rel) console.log('  ⚠ ' + w);

// 落盘修复后的皮肤
writeSkinDir(join(DIR, 'build'), rb.files);
const built = buildSsf(rb.files, { format: 'zip' });
writeFileSync(join(DIR, '复刻-雷电将军.ssf'), Buffer.from(built.data));
writeFileSync(join(DIR, 'preview', 'stretch.png'), Buffer.from(toPng(renderStretchTest(rb.files))));
writeFileSync(join(DIR, 'preview', 'preview.png'), Buffer.from(toPng(renderMock(rb.files, { title: 'SKIN PREVIEW', warnings: rb.warnings }))));
copyFileSync(join(DIR, '复刻-雷电将军.ssf'), join(OUT, '复刻-雷电将军.ssf'));
console.log('');
console.log('已重新打包 -> ' + built.bytes + ' 字节，总警告 ' + rb.warnings.length + ' 条');
for (const w of rb.warnings) console.log('  ! ' + w);
