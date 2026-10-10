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
// 不依赖任何真实文件：随便给个路径，只看它怎么解析安装目标目录
const r1 = await inst.execute({ file: 'C:/does-not-need-to-exist/demo.ssf', dryRun: true });
console.log(JSON.stringify(r1, null, 1).slice(0, 900));
console.log('');
console.log('--- skin_list_installed ---');
const r2 = await list.execute({});
console.log(JSON.stringify(r2, null, 1).slice(0, 700));
