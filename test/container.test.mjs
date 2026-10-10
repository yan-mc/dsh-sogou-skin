// @ts-check
import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { readSkin, writeSkin, decryptV3, buildV3Inner, parseV3Plain, V3_KEY, V3_IV } from '../src/ssf/container.js';
import { readZip, writeZip, crc32 } from '../src/ssf/zip.js';
import { createHash } from 'node:crypto';

const ROOT = 'F:/Deepseek_harness/输入法皮肤/00-原始样本/';
const A = ROOT + '雷电将军影宝.ssf';
const B = ROOT + '原神—雷电将军.ssf';
const sha = (u8) => createHash('sha256').update(Buffer.from(u8)).digest('hex').slice(0, 16);

console.log('=========== 样本 A（明文 ZIP 代际） ===========');
const a = new Uint8Array(readFileSync(A));
const ra = readSkin(a);
console.log('代际:', ra.generation, '条目:', ra.entries.length);
console.log('SD 本地头长度:', ra.sd?.local?.length, ' 中央目录长度:', ra.sd?.central?.length);

// 无损重打包
const repacked = writeSkin(ra.entries, { sdLocal: ra.sd?.local, sdCentral: ra.sd?.central, ut: true });
const ra2 = readSkin(repacked);
const sameNames = ra2.entries.length === ra.entries.length && ra2.entries.every((e, i) => e.name === ra.entries[i].name);
const sameData = ra2.entries.every((e, i) => sha(e.data) === sha(ra.entries[i].data));
console.log('重打包后条目名一致:', sameNames, ' 内容 SHA 一致:', sameData);
console.log('原大小', a.length, '-> 重打包', repacked.length, '(差 ' + (repacked.length - a.length) + ' 字节)');

console.log('');
console.log('=========== 样本 B（v3 加密代际） ===========');
const b = new Uint8Array(readFileSync(B));
const rb = readSkin(b);
console.log('代际:', rb.generation, 'v' + rb.version, '条目:', rb.entries.length, '填充字节:', rb.paddingBytes);
console.log('条目:', rb.entries.map((e) => e.name).join(', '));

// 1) 内层重建是否字节一致
const plain = decryptV3(b);
const originalInner = inflateSync(Buffer.from(plain.buffer, plain.byteOffset + 4, plain.byteLength - 4));
const rebuiltInner = buildV3Inner(rb.entries.map((e) => ({ name: e.name, data: e.data })));
console.log('内层重建字节一致:', Buffer.from(originalInner).equals(Buffer.from(rebuiltInner)),
    '(' + originalInner.length + ' vs ' + rebuiltInner.length + ')');

// 2) 压缩后再加密，能否复刻原始密文
const myCompressed = deflateSync(Buffer.from(rebuiltInner), { level: 9 });
const origCompressedLen = plain.length - 4 - (rb.paddingBytes ?? 0);
console.log('原始 zlib 长度:', origCompressedLen, ' 我的 zlib 长度:', myCompressed.length,
    ' 长度一致:', origCompressedLen === myCompressed.length);
console.log('原始 plain 总长:', plain.length, '=> zlib+4 =', 4 + origCompressedLen, '=> 填充 =', plain.length - 4 - origCompressedLen);

const mine = writeSkin(rb.entries, { format: 'v3' });
console.log('原始密文大小:', b.length, ' 我的密文大小:', mine.length, ' 大小一致:', b.length === mine.length);
console.log('原始密文 SHA:', sha(b), ' 我的密文 SHA:', sha(mine), ' 完全一致:', sha(b) === sha(mine));
if (b.length === mine.length && sha(b) !== sha(mine)) {
    let diff = 0;
    for (let i = 0; i < b.length; i++) if (b[i] !== mine[i]) diff++;
    console.log('不同字节数:', diff, '/', b.length, '（前 8 字节为头部 magic，若仅密文段不同则说明压缩流字节不同）');
    console.log('头部一致:', Buffer.from(b.subarray(0, 8)).equals(Buffer.from(mine.subarray(0, 8))));
}
// 3) 我的产物能否被自己完整读回
const back = readSkin(mine);
console.log('自产 v3 回读条目数:', back.entries.length,
    ' 内容一致:', back.entries.every((e, i) => sha(e.data) === sha(rb.entries[i].data)));
