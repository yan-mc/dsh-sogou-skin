// 可重复的「真克隆」构建：原版逐字照抄，只改身份字段，条目顺序也保持原样。
import { readFileSync, writeFileSync } from 'node:fs';
import { readSkin } from '../src/ssf/container.js';
import { decodeIni, encodeIni } from '../src/ssf/ini.js';
import { buildSsf } from '../src/skin/assemble.js';

const SRC = 'F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf';
const OUT = 'F:/Deepseek_harness/输入法皮肤/04-生成产物/复刻-雷电将军.ssf';
const IDENT = {
  skin_name: '复刻-雷电将军', skin_version: '1.0', skin_author: 'DSH 皮肤工坊',
  skin_email: '', skin_time: '2026.10.10', skin_info: '按原始结构 1:1 复刻，配置与原版完全一致',
};
const A = readSkin(new Uint8Array(readFileSync(SRC)));
let text = decodeIni(A.entries.find((e) => e.name.toLowerCase() === 'skin.ini').data);
for (const [k, v] of Object.entries(IDENT)) text = text.replace(new RegExp('^' + k + '=.*$', 'm'), k + '=' + v);
// 保持原版条目顺序
const files = A.entries.map((e) => e.name.toLowerCase() === 'skin.ini'
  ? { name: e.name, data: encodeIni(text) } : { name: e.name, data: e.data });
const built = buildSsf(files, { format: 'zip' });
writeFileSync(OUT, Buffer.from(built.data));
console.log('复刻 -> ' + OUT + '  ' + built.bytes + ' 字节, ' + files.length + ' 个文件');
