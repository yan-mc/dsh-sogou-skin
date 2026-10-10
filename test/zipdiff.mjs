// @ts-check
/**
 * ZIP 结构不变量 —— **自建数据**。
 *
 * 搜狗对 .ssf 的 ZIP 结构比一般工具挑剔：条目顺序、压缩方法、
 * version 字段、以及那个 125 字节的私有 SD 扩展字段，都得跟它自己产出的包一致。
 * 这个测试守住这些不变量，防止 ZIP 写入器被改坏。
 *
 * 配了 SOGOU_SKIN_SAMPLES 时，额外把真实样本拿来对拍。
 */
import { readFileSync } from 'node:fs';
import { readSkin, writeSkin } from '../src/ssf/container.js';
import { initProject, loadProject, assembleSkin, buildSsf } from '../src/skin/assemble.js';
import { sample } from './_paths.mjs';
import { tmpDir } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

/** 走一遍 ZIP 的本地头，把每个条目的结构信息取出来 */
function zipInfo(buf, label) {
    const b = Buffer.from(buf);
    const entries = [];
    let i = 0, sdLen = 0, utLen = 0;
    while (i + 4 <= b.length) {
        const sig = b.readUInt32LE(i);
        if (sig !== 0x04034b50) break;
        const ver = b.readUInt16LE(i + 4);
        const flags = b.readUInt16LE(i + 6);
        const method = b.readUInt16LE(i + 8);
        const csize = b.readUInt32LE(i + 18);
        const nlen = b.readUInt16LE(i + 26);
        const elen = b.readUInt16LE(i + 28);
        const name = b.toString('utf8', i + 30, i + 30 + nlen);
        const extra = b.subarray(i + 30 + nlen, i + 30 + nlen + elen);
        if (extra.length >= 4 && extra.readUInt16LE(0) === 0x4453) sdLen = extra.length;
        if (extra.length >= 4 && extra.readUInt16LE(0) === 0x5455) utLen = extra.length;
        entries.push({ name, ver, flags, method, csize, extraLen: elen });
        i += 30 + nlen + elen + csize;
    }
    return { label, size: b.length, entries, sdLen, utLen };
}

/* ---------- 自建皮肤 -> ZIP ---------- */
console.log('=========== 自建皮肤打 ZIP ===========');
const dir = tmpDir('zipdiff');
initProject(dir, { name: '结构自检' });
const project = loadProject(dir);
const res = assembleSkin(project, dir);
const buf = buildSsf(res.files, { format: 'zip' }).data;
const z = zipInfo(buf, '自建');
const back = readSkin(buf);

ok('条目数与装配结果一致', z.entries.length === res.files.length,
    res.files.length + ' 文件 -> ' + z.entries.length + ' 条目');
ok('条目名与顺序和装配顺序一致', z.entries.every((e, i) => e.name === res.files[i].name));
ok('flags 全为 0', z.entries.every((e) => e.flags === 0));
ok('压缩方法只用 0(存储) 与 8(deflate)',
    z.entries.every((e) => e.method === 0 || e.method === 8),
    '方法分布 ' + JSON.stringify(z.entries.reduce((a, e) => (a[e.method] = (a[e.method] || 0) + 1, a), {})));
ok('version 字段：存储=10 / 压缩=20',
    z.entries.every((e) => e.ver === (e.method === 0 ? 10 : 20)),
    'version 分布 ' + JSON.stringify(z.entries.reduce((a, e) => (a[e.ver] = (a[e.ver] || 0) + 1, a), {})));
ok('每个条目都带搜狗私有 SD 扩展字段', z.entries.every((e) => e.extraLen >= 125),
    'SD 段 ' + z.sdLen + ' 字节');
ok('回读条目数与写入一致', back.entries.length === res.files.length);
ok('回读每个条目内容一致',
    back.entries.every((e) => { const f = res.files.find((x) => x.name === e.name); return f && Buffer.from(f.data).equals(Buffer.from(e.data)); }));

/* ---------- 边界：空内容与超大内容 ---------- */
console.log('');
console.log('=========== 边界 ===========');
{
    const tiny = [{ name: 'empty.bin', data: new Uint8Array(0) }, { name: 'one.bin', data: new Uint8Array([7]) }];
    const tb = buildSsf(tiny, { format: 'zip' }).data;
    const tz = zipInfo(tb, '边界');
    const tback = readSkin(tb);
    ok('空文件与单字节文件都能往返', tback.entries.length === 2 &&
        tback.entries[0].data.length === 0 && tback.entries[1].data.length === 1,
        tz.entries.length + ' 条目');
}

/* ---------- 可选：与真实样本对拍 ---------- */
const src = sample('雷电将军影宝.ssf');
if (!src) {
    console.log('');
    console.log('  --  未配 SOGOU_SKIN_SAMPLES，跳过真实样本对拍（见 test/README.md）');
} else {
    console.log('');
    console.log('=========== 与真实样本对拍 ===========');
    const real = zipInfo(readFileSync(src), '原版');
    console.log('  原版 ' + real.size + ' 字节 / ' + real.entries.length + ' 条目 / ' +
        '方法 ' + JSON.stringify(real.entries.reduce((a, e) => (a[e.method] = (a[e.method] || 0) + 1, a), {})) +
        ' / version ' + JSON.stringify(real.entries.reduce((a, e) => (a[e.ver] = (a[e.ver] || 0) + 1, a), {})));
    console.log('  我的 ' + z.size + ' 字节 / ' + z.entries.length + ' 条目 / ' +
        '方法 ' + JSON.stringify(z.entries.reduce((a, e) => (a[e.method] = (a[e.method] || 0) + 1, a), {})) +
        ' / version ' + JSON.stringify(z.entries.reduce((a, e) => (a[e.ver] = (a[e.ver] || 0) + 1, a), {})));
    ok('压缩方法集合一致',
        JSON.stringify(Object.keys(real.entries.reduce((a, e) => (a[e.method] = 1, a), {})).sort()) ===
        JSON.stringify(Object.keys(z.entries.reduce((a, e) => (a[e.method] = 1, a), {})).sort()));
    ok('version 字段集合一致',
        JSON.stringify([...new Set(real.entries.map((e) => e.ver))].sort()) ===
        JSON.stringify([...new Set(z.entries.map((e) => e.ver))].sort()));
    ok('SD 扩展字段长度一致', real.sdLen === z.sdLen, real.sdLen + ' vs ' + z.sdLen);
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
