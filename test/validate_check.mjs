import { apply } from '../src/index.js';
const reg = [];
const ctx = { logger: { info(){}, warn(){} }, tools: { register: (d) => reg.push(d) }, skills: { register: () => () => {} }, effect: () => {} };
apply(ctx, {});
const v = reg.find((d) => d.name === 'skin_validate');
import { project, skip } from './_paths.mjs';
// 需要本地皮肤工程（因版权不在仓库里）。用 SOGOU_SKIN_PROJECTS 指一个目录即可（见 test/_paths.mjs）。
const CASES = [['复刻-雷电将军', project('复刻-雷电将军')], ['闲云', project('闲云')]].filter(([, d]) => d);
if (skip('校验器自检（需要本地皮肤工程）', CASES.length ? 'ok' : null)) process.exit(0);
for (const [label, dir] of CASES) {
  const r = await v.execute({ dir });
  console.log('=== ' + label + '  ' + (r.ok ? '通过' : '失败'));
  console.log('   ' + r.summary + '   文件 ' + r.fileCount);
  for (const e of (r.errors || [])) console.log('   [error] ' + e);
  for (const w of (r.warnings || [])) console.log('   [warn ] ' + w);
}
