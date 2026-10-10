import { apply } from '../src/index.js';
const reg = [];
const ctx = { logger: { info(){}, warn(m){ console.log('WARN ' + m); } },
  tools: { register: (d) => reg.push(d) },
  skills: { register: () => () => {} }, effect: () => {} };
apply(ctx, {});
console.log('共 ' + reg.length + ' 个工具: ' + reg.map(d => d.name).join(', '));
const inst = reg.find(d => d.name === 'skin_install');
const list = reg.find(d => d.name === 'skin_list_installed');
console.log('');
console.log('--- skin_install dryRun 探测 ---');
const r1 = await inst.execute({ file: 'F:/Deepseek_harness/输入法皮肤/04-生成产物/复刻-雷电将军.ssf', dryRun: true });
console.log(JSON.stringify(r1, null, 1).slice(0, 900));
console.log('');
console.log('--- skin_list_installed ---');
const r2 = await list.execute({});
console.log(JSON.stringify(r2, null, 1).slice(0, 700));
