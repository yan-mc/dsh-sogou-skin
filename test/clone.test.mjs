// @ts-check
/**
 * 克隆保真 —— **自己造数据，不依赖任何第三方样本**。
 *
 * 这个测试守的是一条硬性质：**克隆一份皮肤时，只要配置逐字一致，
 * 渲染结果就必须逐像素一致。**
 *
 * 原来它读两份真实 .ssf（原件与我的克隆件），样本因版权不在仓库里，
 * 干净 checkout 下整份跳过。现在改成：
 *   1) 用程序化占位素材造一份"原创皮肤"
 *   2) 对它做逐字克隆（只改六个身份字段）
 *   3) 两份按同一引擎模型渲染，逐像素比对
 *   4) 再验证配置层面：除身份字段外零差异
 *
 * 配了 SOGOU_SKIN_SAMPLES 时，额外对真实样本跑一遍同样的比对。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSkin } from '../src/ssf/container.js';
import { renderCandidateWindow } from '../src/skin/render.js';
import { decodeIni, encodeIni } from '../src/ssf/ini.js';
import { initProject, loadProject, assembleSkin, buildSsf } from '../src/skin/assemble.js';
import { tmpDir, sample } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

const IDENT = {
    skin_name: '克隆件', skin_version: '1.0', skin_author: 'test',
    skin_email: '', skin_time: '2026-01-01', skin_info: '逐字克隆，只改身份字段',
};

/** 把一份皮肤逐字克隆：只替换身份字段，其余一个字节都不动 */
function cloneSkin(buf) {
    const src = readSkin(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    let text = decodeIni(src.entries.find((e) => e.name.toLowerCase() === 'skin.ini').data);
    for (const [k, v] of Object.entries(IDENT)) {
        text = text.replace(new RegExp('^' + k + '=.*$', 'm'), k + '=' + v);
    }
    const files = src.entries.map((e) => e.name.toLowerCase() === 'skin.ini'
        ? { name: e.name, data: encodeIni(text) }
        : { name: e.name, data: e.data });
    return { buf: buildSsf(files, { format: 'zip' }).data, entries: src.entries };
}

/** 两份皮肤按同一引擎模型渲染，返回逐像素差异通道数 */
function pixelDiff(bufA, bufB, scheme, w, h) {
    const toFiles = (buf) => readSkin(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
        .entries.map((e) => ({ name: e.name, data: e.data }));
    const a = renderCandidateWindow(toFiles(bufA), { scheme, width: w, height: h, pinyin: 'ni hao', candidates: ['a', 'b', 'c'] });
    const b = renderCandidateWindow(toFiles(bufB), { scheme, width: w, height: h, pinyin: 'ni hao', candidates: ['a', 'b', 'c'] });
    if (a.raster.width !== b.raster.width || a.raster.height !== b.raster.height) return -1;
    let d = 0;
    for (let i = 0; i < a.raster.data.length; i++) if (a.raster.data[i] !== b.raster.data[i]) d++;
    return { diff: d, px: a.raster.width * a.raster.height };
}

/** 对比两份 Skin.ini 的键值（只比键值，不比顺序） */
function iniDiff(bufA, bufB) {
    const grab = (buf) => {
        const s = readSkin(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
        const t = decodeIni(s.entries.find((e) => e.name.toLowerCase() === 'skin.ini').data);
        let cur = ''; const m = new Map();
        for (const line of t.split(/\r?\n/)) {
            const x = line.trim();
            const mm = x.match(/^\[(.+)\]$/); if (mm) { cur = mm[1]; continue; }
            const i = x.indexOf('=');
            if (i > 0) m.set(cur + '/' + x.slice(0, i).trim(), x.slice(i + 1).trim());
        }
        return m;
    };
    const A = grab(bufA), B = grab(bufB);
    const keys = [...new Set([...A.keys(), ...B.keys()])];
    const diff = keys.filter((k) => A.get(k) !== B.get(k));
    return { total: keys.length, diff };
}

/* ---------- 1) 自建一份原创皮肤 ---------- */
console.log('=========== 自建皮肤 -> 逐字克隆 ===========');
const dir = tmpDir('clone-src');
initProject(dir, { name: '原创皮肤' });
const project = loadProject(dir);
const built = assembleSkin(project, dir);
const original = buildSsf(built.files, { format: 'zip' }).data;
console.log('  原创皮肤 ' + built.files.length + ' 个文件，打包 ' + original.length + ' 字节');

/* ---------- 2) 逐字克隆 ---------- */
const { buf: cloned } = cloneSkin(original);
console.log('  克隆件   ' + readSkin(cloned).entries.length + ' 个条目，打包 ' + cloned.length + ' 字节');

/* ---------- 3) 配置层面：除身份字段外必须零差异 ---------- */
{
    const { total, diff } = iniDiff(original, cloned);
    const nonIdent = diff.filter((k) => !Object.keys(IDENT).some((id) => k.endsWith('/' + id)));
    ok('身份字段确实被改掉了', diff.length >= 1, '共 ' + diff.length + ' 个键不同');
    ok('除身份字段外零差异', nonIdent.length === 0,
        nonIdent.length ? '意外差异: ' + nonIdent.join(', ') : total + ' 个键，只有身份字段不同');
}

/* ---------- 4) 渲染层面：必须逐像素一致 ---------- */
{
    let allSame = true;
    for (const [scheme, w, h] of [['Scheme_H1', 400, 258], ['Scheme_H1', 700, 258], ['Scheme_V1', 520, 420]]) {
        const r = pixelDiff(original, cloned, scheme, w, h);
        if (r === -1) { ok(scheme + ' ' + w + 'x' + h, false, '尺寸不同'); allSame = false; continue; }
        ok(scheme + ' ' + w + 'x' + h + ' 逐像素一致', r.diff === 0,
            r.diff === 0 ? r.px + ' 像素' : r.diff + ' / ' + (r.px * 4) + ' 通道不同');
        if (r.diff !== 0) allSame = false;
    }
    ok('三组配置全部逐像素一致', allSame);
}

/* ---------- 5) 可选：真实样本 ---------- */
{
    const src = sample('雷电将军影宝.ssf');
    if (!src) {
        console.log('');
        console.log('  --  未配 SOGOU_SKIN_SAMPLES，跳过真实样本比对（见 test/README.md）');
    } else {
        console.log('');
        console.log('=========== 真实样本 ===========');
        const real = readFileSync(src);
        const { buf: realClone } = cloneSkin(real);
        const { total, diff } = iniDiff(real, realClone);
        const nonIdent = diff.filter((k) => !Object.keys(IDENT).some((id) => k.endsWith('/' + id)));
        ok('真实样本：除身份字段外零差异', nonIdent.length === 0, total + ' 个键，' + diff.length + ' 个不同');
        let d = 0;
        for (const [scheme, w, h] of [['Scheme_H1', 650, 258], ['Scheme_V1', 522, 428]]) {
            const r = pixelDiff(real, realClone, scheme, w, h);
            if (r === -1) { ok('真实样本 ' + scheme, false, '尺寸不同'); continue; }
            d += r.diff;
            ok('真实样本 ' + scheme + ' ' + w + 'x' + h + ' 逐像素一致', r.diff === 0,
                r.diff === 0 ? r.px + ' 像素' : r.diff + ' 个通道不同');
        }
    }
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
