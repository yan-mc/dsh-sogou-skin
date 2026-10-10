import { apply } from '../src/index.js';
const reg = [];
const ctx = { logger: { info(){}, warn(){} }, tools: { register: (d) => reg.push(d) }, skills: { register: () => () => {} }, effect: () => {} };
apply(ctx, {});
const v = reg.find((d) => d.name === 'skin_validate');
for (const [label, dir] of [['复刻-雷电将军','F:/Deepseek_harness/输入法皮肤/07-皮肤工程/复刻-雷电将军'], ['闲云','F:/Deepseek_harness/输入法皮肤/07-皮肤工程/闲云']]) {
  const r = await v.execute({ dir });
  console.log('=== ' + label + '  ' + (r.ok ? '通过' : '失败'));
  console.log('   ' + r.summary + '   文件 ' + r.fileCount);
  for (const e of (r.errors || [])) console.log('   [error] ' + e);
  for (const w of (r.warnings || [])) console.log('   [warn ] ' + w);
}
