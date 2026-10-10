import { readFileSync } from 'node:fs';
import { readSkin } from '../src/ssf/container.js';
import { renderCandidateWindow } from '../src/skin/render.js';
console.log('校验两排文字的落点（真机实测：拼音相对面板顶 +15..+27，候选 +40..+51）:');
for (const [label, path, panelTop] of [
  ['雷电将军影宝', 'F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf', 173],
  ['原神—雷电将军', 'F:/Deepseek_harness/输入法皮肤/00-原始样本/原神—雷电将军.ssf', 88],
]) {
  const s = readSkin(new Uint8Array(readFileSync(path)));
  const files = s.entries.map((e) => ({ name: e.name, data: e.data }));
  const rep = {};
  renderCandidateWindow(files, { scheme: 'Scheme_H1', width: 300, height: 100, report: rep });
  console.log('  ' + label + '  底图 ' + rep.picSize);
  console.log('     拼音行 y=' + rep.row1Y + '  相对面板顶 +' + (rep.row1Y - panelTop) + (rep.row1Y-panelTop >= 10 && rep.row1Y-panelTop <= 30 ? '  ok' : '  ??'));
  console.log('     候选行 y=' + rep.row2Y + '  相对面板顶 +' + (rep.row2Y - panelTop) + (rep.row2Y-panelTop >= 35 && rep.row2Y-panelTop <= 56 ? '  ok' : '  ??'));
}
