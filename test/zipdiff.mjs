import { readFileSync } from 'node:fs';

function zipInfo(buf, label) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const entries = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const sig = dv.getUint32(i, true);
    if (sig === 0x04034b50) {
      const ver = dv.getUint16(i + 4, true), flags = dv.getUint16(i + 6, true);
      const method = dv.getUint16(i + 8, true);
      const nlen = dv.getUint16(i + 26, true), elen = dv.getUint16(i + 28, true);
      const csize = dv.getUint32(i + 18, true);
      const name = buf.toString('utf8', i + 30, i + 30 + nlen);
      const extra = buf.subarray(i + 30 + nlen, i + 30 + nlen + elen);
      entries.push({ name, ver, flags, method, csize, extraLen: elen, extraHex: extra.toString('hex') });
      i += 30 + nlen + elen + csize;
    } else if (sig === 0x02014b50) break;
    else i++;
  }
  // 中央目录
  let cdOff = -1;
  for (let k = buf.length - 22; k >= 0; k--) {
    if (dv.getUint32(k, true) === 0x06054b50) { cdOff = k; break; }
  }
  const info = { label, size: buf.length, entries, cdOff };
  return info;
}
const A = zipInfo(readFileSync('F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf'), '原版');
const B = zipInfo(readFileSync('F:/Deepseek_harness/输入法皮肤/04-生成产物/复刻-雷电将军.ssf'), '我的复刻');
for (const z of [A, B]) {
  console.log('=== ' + z.label + '  ' + z.size + ' 字节  条目 ' + z.entries.length);
  const m = {}; for (const e of z.entries) m[e.method] = (m[e.method] || 0) + 1;
  const v = {}; for (const e of z.entries) v[e.ver] = (v[e.ver] || 0) + 1;
  const ex = {}; for (const e of z.entries) ex[e.extraLen] = (ex[e.extraLen] || 0) + 1;
  console.log('   压缩方法: ' + JSON.stringify(m) + '   version: ' + JSON.stringify(v) + '   扩展字段长度: ' + JSON.stringify(ex));
  const flags = {}; for (const e of z.entries) flags[e.flags] = (flags[e.flags] || 0) + 1;
  console.log('   flags: ' + JSON.stringify(flags));
  console.log('   前 6 个条目: ' + z.entries.slice(0, 6).map(e => e.name + '(' + e.csize + 'B,extra' + e.extraLen + ')').join('  '));
  const uniqExtra = [...new Set(z.entries.map(e => e.extraHex))];
  console.log('   不同的扩展字段 %d 种，最长 %d 字节', uniqExtra.length, Math.max(...uniqExtra.map(x => x.length / 2)));
  if (uniqExtra.length) console.log('   最长扩展字段 hex 前 80: ' + uniqExtra.sort((a,b)=>b.length-a.length)[0].slice(0,80));
}
console.log('');
console.log('条目名集合是否一致: ' + (JSON.stringify(A.entries.map(e=>e.name).sort()) === JSON.stringify(B.entries.map(e=>e.name).sort()) ? '是 ✓' : '否'));
console.log('条目顺序是否一致: ' + (JSON.stringify(A.entries.map(e=>e.name)) === JSON.stringify(B.entries.map(e=>e.name)) ? '是 ✓' : '否'));
