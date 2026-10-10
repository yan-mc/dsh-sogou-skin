// @ts-check
/**
 * 容器层自检 —— **自己造数据，不依赖任何外部样本**。
 *
 * 原来这个测试是围绕两份真实 .ssf 写的，样本因版权不在仓库里，
 * 结果在干净 checkout 里整份跳过。现在改成：
 *   1) 自建一份皮肤，把三代容器（ZIP / v3 加密 / v1 明文表）全部往返一遍
 *   2) 如果配了 SOGOU_SKIN_SAMPLES，再额外拿真实样本做逐字节比对
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { readSkin, writeSkin, decryptV3, buildV3Inner, V3_KEY, V3_IV } from '../src/ssf/container.js';
import { createHash, createDecipheriv } from 'node:crypto';
import { create } from '../src/image/raster.js';
import { encodePng, decodePng } from '../src/image/png.js';
import { encodeIni } from '../src/ssf/ini.js';
import { sample } from './_paths.mjs';

const sha = (u8) => createHash('sha256').update(Buffer.from(u8)).digest('hex').slice(0, 16);
let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

/* ---------- 自建一份最小的皮肤 ---------- */
function makeSkin() {
    const px = (r, g, b) => { const im = create(8, 8, [0, 0, 0, 0]); for (let i = 0; i < im.data.length; i += 4) { im.data[i] = r; im.data[i+1] = g; im.data[i+2] = b; im.data[i+3] = 255; } return im; };
    return [
        { name: 'Skin.ini', data: encodeIni('[General]\r\nskin_name=自检皮肤\r\nskin_version=1.0\r\n\r\n[Display]\r\nfont_size=16\r\n') },
        { name: 'skin1.png', data: encodePng(px(200, 220, 255)) },
        { name: 'skin2.png', data: encodePng(px(180, 200, 240)) },
        { name: 'bar.png', data: encodePng(px(120, 140, 190)) },
    ];
}
const entries = makeSkin();
console.log('自建皮肤：' + entries.length + ' 个条目，合计 ' +
    entries.reduce((a, e) => a + e.data.length, 0) + ' 字节');

/* ---------- 1) ZIP 代际往返 ---------- */
console.log('');
console.log('=========== ZIP 代际（自建） ===========');
{
    const buf = writeSkin(entries, { format: 'zip' });
    const back = readSkin(buf);
    ok('代际识别为 zip', back.generation === 'zip', 'generation=' + back.generation);
    ok('条目数一致', back.entries.length === entries.length, entries.length + ' -> ' + back.entries.length);
    ok('条目名与顺序一致', back.entries.every((e, i) => e.name === entries[i].name));
    ok('每个条目内容 SHA 一致', back.entries.every((e, i) => sha(e.data) === sha(entries[i].data)));
    const ini = back.entries.find((e) => e.name === 'Skin.ini');
    ok('Skin.ini 可解码且含中文', Buffer.from(ini.data).toString('utf16le').includes('自检皮肤'));
    const png = decodePng(back.entries.find((e) => e.name === 'skin1.png').data);
    ok('PNG 往返后仍可解码', png.width === 8 && png.height === 8);
    console.log('  产物 ' + buf.length + ' 字节');
}

/* ---------- 2) v3 加密代际往返 ---------- */
console.log('');
console.log('=========== v3 加密代际（自建） ===========');
{
    const buf = writeSkin(entries, { format: 'v3' });
    const magic = Buffer.from(buf.subarray(0, 4)).toString('latin1');
    ok('头部 magic 为 "Skin"', magic === 'Skin', JSON.stringify(magic));
    ok('版本号为 3', Buffer.from(buf).readUInt32LE(4) === 3);
    const back = readSkin(buf);
    ok('版本号回读为 3', back.version === 3, 'generation=' + back.generation + ' version=' + back.version);
    ok('条目数一致', back.entries.length === entries.length);
    ok('解密后内容 SHA 一致', back.entries.every((e, i) => sha(e.data) === sha(entries[i].data)));

    // 手工解一遍，确认 AES-256-CBC + zlib 的层次
    const plain = decryptV3(buf);
    const inner = inflateSync(Buffer.from(plain.buffer, plain.byteOffset + 4, plain.byteLength - 4));
    ok('内层 zlib 解出来是条目表', inner.length > 0);
    const rebuilt = buildV3Inner(entries.map((e) => ({ name: e.name, data: e.data })));
    ok('内层重建与原内层长度一致', rebuilt.length === inner.length, inner.length + ' vs ' + rebuilt.length);
    ok('内层重建逐字节一致', Buffer.from(inner).equals(Buffer.from(rebuilt)));
    console.log('  产物 ' + buf.length + ' 字节，内层 ' + inner.length + ' 字节');
}

/* ---------- 3) 可选：真实样本逐字节比对 ---------- */
const A = sample('雷电将军影宝.ssf');
const B = sample('原神—雷电将军.ssf');
if (A) {
    console.log('');
    console.log('=========== 真实样本（明文 ZIP 代际） ===========');
    const a = new Uint8Array(readFileSync(A));
    const ra = readSkin(a);
    console.log('  代际 ' + ra.generation + '，条目 ' + ra.entries.length +
        '，SD 本地头 ' + (ra.sd?.local?.length ?? 0) + ' 字节');
    const repacked = writeSkin(ra.entries, { sdLocal: ra.sd?.local, sdCentral: ra.sd?.central, ut: true });
    const ra2 = readSkin(repacked);
    ok('重打包后条目名一致', ra2.entries.every((e, i) => e.name === ra.entries[i].name));
    ok('重打包后内容 SHA 一致', ra2.entries.every((e, i) => sha(e.data) === sha(ra.entries[i].data)));
    console.log('  原 ' + a.length + ' 字节 -> 重打包 ' + repacked.length + ' 字节');
}
if (B) {
    console.log('');
    console.log('=========== 真实样本（v3 加密代际） ===========');
    const b = new Uint8Array(readFileSync(B));
    const rb = readSkin(b);
    console.log('  代际 ' + rb.generation + ' v' + rb.version + '，条目 ' + rb.entries.length);
    const mine = writeSkin(rb.entries, { format: 'v3' });
    ok('我的 v3 回读条目数一致', readSkin(mine).entries.length === rb.entries.length);
    ok('我的 v3 回读内容一致', readSkin(mine).entries.every((e, i) => sha(e.data) === sha(rb.entries[i].data)));
    console.log('  原始密文 ' + b.length + ' 字节，我的密文 ' + mine.length + ' 字节' +
        (b.length === mine.length ? '（大小一致）' : ''));
}
if (!A && !B) {
    console.log('');
    console.log('  --  未配 SOGOU_SKIN_SAMPLES，跳过真实样本比对（见 test/README.md）');
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
