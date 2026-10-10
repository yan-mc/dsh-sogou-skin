import { apply } from '../src/index.js';
const reg = [];
apply({ logger:{info(){},warn(){}}, tools:{register:(d)=>reg.push(d)}, skills:{register:()=>()=>{}}, effect:()=>{} }, {});
const t = reg.find((d) => d.name === 'skin_preview');
for (const [label, dir] of [['闲云','F:/Deepseek_harness/输入法皮肤/07-皮肤工程/闲云'], ['复刻','F:/Deepseek_harness/输入法皮肤/07-皮肤工程/复刻-雷电将军']]) {
  const r = await t.execute({ dir });
  console.log('=== ' + label + '  ok=' + r.ok + (r.error ? '  err=' + r.error : ''));
  console.log('    白底暗边告警: ' + JSON.stringify(r.bgcheckIssues || []));
  for (const w of (r.warnings || []).slice(0, 4)) console.log('    [warn] ' + w);
}
