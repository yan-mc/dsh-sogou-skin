// @ts-check
/**
 * 两排文字的位置公式 —— **自建数据**。
 *
 * 横排候选窗里其实是【上下两排】文字（拼音在上、候选在下）。
 * 这个位置公式是从搜狗自己渲染的预览图 + 真实皮肤反推、并用真机截图验证过的：
 *
 *   拼音行 y = pinyin_marge[0]                                  （窗口内的绝对 y）
 *   候选行 y = pinyin_marge[0] + font_size + zhongwen_marge[0]
 *
 * 真机实测的合理区间：拼音行在文字面板顶往下 15..27，候选行 40..51。
 *
 * 这个测试守住 render.js 确实按这个公式摆放两排文字。
 * 配了 SOGOU_SKIN_SAMPLES 时，额外对真实皮肤验算一遍。
 */
import { readFileSync } from 'node:fs';
import { readSkin } from '../src/ssf/container.js';
import { renderCandidateWindow } from '../src/skin/render.js';
import { decodeIni } from '../src/ssf/ini.js';
import { initProject, loadProject, assembleSkin } from '../src/skin/assemble.js';
import { tmpDir, sample } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

/** 从一份皮肤的 Skin.ini 里读出 Scheme_H1 的 marge 与 font_size */
function h1Params(buf) {
    const s = readSkin(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const t = decodeIni(s.entries.find((e) => e.name.toLowerCase() === 'skin.ini').data);
    let cur = ''; const m = {};
    for (const line of t.split(/\r?\n/)) {
        const x = line.trim();
        const mm = x.match(/^\[(.+)\]$/); if (mm) { cur = mm[1]; continue; }
        const i = x.indexOf('=');
        if (i > 0) m[cur + '/' + x.slice(0, i).trim()] = x.slice(i + 1).trim();
    }
    return {
        pinyin: String(m['Scheme_H1/pinyin_marge'] || '').split(',').map(Number),
        zhongwen: String(m['Scheme_H1/zhongwen_marge'] || '').split(',').map(Number),
        font: Number(m['Display/font_size']) || 16,
    };
}

/* ---------- 1) 自建皮肤：公式必须被正确应用 ---------- */
console.log('=========== 自建皮肤（公式应用） ===========');
const dir = tmpDir('rowmodel');
initProject(dir, { name: '排布自检' });
const project = loadProject(dir);
const res = assembleSkin(project, dir);
{
    // 直接拿 Skin.ini 的字节来解析
    const iniEntry = res.files.find((f) => f.name.toLowerCase() === 'skin.ini');
    const t = decodeIni(iniEntry.data);
    let cur = ''; const m = {};
    for (const line of t.split(/\r?\n/)) {
        const x = line.trim();
        const mm = x.match(/^\[(.+)\]$/); if (mm) { cur = mm[1]; continue; }
        const i = x.indexOf('=');
        if (i > 0) m[cur + '/' + x.slice(0, i).trim()] = x.slice(i + 1).trim();
    }
    const py = String(m['Scheme_H1/pinyin_marge']).split(',').map(Number);
    const zw = String(m['Scheme_H1/zhongwen_marge']).split(',').map(Number);
    const fs = Number(m['Display/font_size']) || 16;
    console.log('  pinyin_marge   = [' + py.join(', ') + ']');
    console.log('  zhongwen_marge = [' + zw.join(', ') + ']');
    console.log('  font_size      = ' + fs);

    const rep = {};
    renderCandidateWindow(res.files, { scheme: 'Scheme_H1', width: 460, height: 260, report: rep });
    ok('拼音行 y === pinyin_marge[0]', rep.row1Y === py[0], '报表 ' + rep.row1Y + '，期望 ' + py[0]);
    ok('候选行 y === pinyin_marge[0] + font_size + zhongwen_marge[0]',
        rep.row2Y === py[0] + fs + zw[0], '报表 ' + rep.row2Y + '，期望 ' + (py[0] + fs + zw[0]));
    ok('候选行确实在拼音行下方', rep.row2Y > rep.row1Y, '相差 ' + (rep.row2Y - rep.row1Y) + ' 像素');
    ok('两排间距落在合理区间（10..40）',
        rep.row2Y - rep.row1Y >= 10 && rep.row2Y - rep.row1Y <= 40, (rep.row2Y - rep.row1Y) + ' 像素');
}

/* ---------- 2) 同一份皮肤、不同窗口尺寸：两排必须同步位移 ---------- */
console.log('');
console.log('=========== 窗口尺寸变化时的稳定性 ===========');
{
    const a = {}; renderCandidateWindow(res.files, { scheme: 'Scheme_H1', width: 460, height: 260, report: a });
    const b = {}; renderCandidateWindow(res.files, { scheme: 'Scheme_H1', width: 900, height: 260, report: b });
    ok('窗口变宽不影响两排的 y', a.row1Y === b.row1Y && a.row2Y === b.row2Y,
        a.row1Y + '/' + a.row2Y + ' vs ' + b.row1Y + '/' + b.row2Y);
    ok('两排间距与窗口宽度无关', (a.row2Y - a.row1Y) === (b.row2Y - b.row1Y),
        (a.row2Y - a.row1Y) + ' 像素');
}

/* ---------- 3) 可选：真实皮肤验算 ---------- */
const CASES = [
    ['雷电将军影宝', sample('雷电将军影宝.ssf'), 173],
    ['原神—雷电将军', sample('原神—雷电将军.ssf'), 88],
].filter(([, p]) => p);
if (!CASES.length) {
    console.log('');
    console.log('  --  未配 SOGOU_SKIN_SAMPLES，跳过真实皮肤验算（见 test/README.md）');
} else {
    console.log('');
    console.log('=========== 真实皮肤（验算公式） ===========');
    console.log('  真机实测合理区间：拼音 +15..+27，候选 +40..+51（相对文字面板顶）');
    for (const [label, path, panelTop] of CASES) {
        const buf = readFileSync(path);
        const rep = {};
        renderCandidateWindow(readSkin(new Uint8Array(buf)).entries.map((e) => ({ name: e.name, data: e.data })),
            { scheme: 'Scheme_H1', width: 400, height: 258, report: rep });
        const p = h1Params(buf);
        const pOff = rep.row1Y - panelTop, cOff = rep.row2Y - panelTop;
        ok(label + ' 拼音行落点合理', pOff >= 10 && pOff <= 30, '+' + pOff + '（marge ' + p.pinyin[0] + '）');
        ok(label + ' 候选行落点合理', cOff >= 35 && cOff <= 56, '+' + cOff);
    }
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
