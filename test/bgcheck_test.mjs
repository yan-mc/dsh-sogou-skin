import { apply } from '../src/index.js';
const reg = [];
apply({ logger:{info(){},warn(){}}, tools:{register:(d)=>reg.push(d)}, skills:{register:()=>()=>{}}, effect:()=>{} }, {});
const t = reg.find((d) => d.name === 'skin_preview');
import { project, skip } from './_paths.mjs';
const CASES = [['闲云', project('闲云')], ['复刻', project('复刻-雷电将军')]].filter(([, d]) => d);
if (skip('白底对照（需要本地皮肤工程）', CASES.length ? 'ok' : null)) process.exit(0);
for (const [label, dir] of CASES) {
  const r = await t.execute({ dir });
  console.log('=== ' + label + '  ok=' + r.ok + (r.error ? '  err=' + r.error : ''));
  console.log('    白底暗边告警: ' + JSON.stringify(r.bgcheckIssues || []));
  for (const w of (r.warnings || []).slice(0, 4)) console.log('    [warn] ' + w);
}
