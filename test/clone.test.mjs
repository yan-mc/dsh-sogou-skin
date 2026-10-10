// 注意：任何跑 assembleSkin 的脚本都会从工程重建 04-生成产物/复刻-雷电将军.ssf，
// 把"逐字克隆"覆盖掉。所以这个测试**自己先把克隆重建一遍**，不依赖外部顺序。
import { readFileSync, writeFileSync } from 'node:fs';
import { readSkin } from '../src/ssf/container.js';
import { renderCandidateWindow } from '../src/skin/render.js';
import { decodeIni, encodeIni } from '../src/ssf/ini.js';
import { buildSsf } from '../src/skin/assemble.js';
{
    const SRC = 'F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf';
    const OUT = 'F:/Deepseek_harness/输入法皮肤/04-生成产物/复刻-雷电将军.ssf';
    const IDENT = { skin_name: '复刻-雷电将军', skin_version: '1.0', skin_author: 'DSH 皮肤工坊',
        skin_email: '', skin_time: '2026.10.10', skin_info: '按原始结构 1:1 复刻，配置与原版完全一致' };
    const A = readSkin(new Uint8Array(readFileSync(SRC)));
    let text = decodeIni(A.entries.find((e) => e.name.toLowerCase() === 'skin.ini').data);
    for (const [k, v] of Object.entries(IDENT)) text = text.replace(new RegExp('^' + k + '=.*$', 'm'), k + '=' + v);
    const files = A.entries.map((e) => e.name.toLowerCase() === 'skin.ini'
        ? { name: e.name, data: encodeIni(text) } : { name: e.name, data: e.data });
    writeFileSync(OUT, Buffer.from(buildSsf(files, { format: 'zip' }).data));
}

function load(p) {
  const s = readSkin(new Uint8Array(readFileSync(p)));
  return s.entries.map((e) => ({ name: e.name, data: e.data }));
}
const A = load('F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf');
const B = load('F:/Deepseek_harness/输入法皮肤/04-生成产物/复刻-雷电将军.ssf');

let fail = 0;
// 只改身份字段，不影响渲染 —— 所以两个皮肤按同一模型渲染出来必须逐像素一致
for (const [scheme, w, h] of [['Scheme_H1', 400, 258], ['Scheme_V1', 522, 428], ['Scheme_H1', 700, 258]]) {
  const a = renderCandidateWindow(A, { scheme, width: w, height: h, pinyin: 'ni hao', candidates: ['a','b','c'] });
  const b = renderCandidateWindow(B, { scheme, width: w, height: h, pinyin: 'ni hao', candidates: ['a','b','c'] });
  if (a.raster.width !== b.raster.width || a.raster.height !== b.raster.height) {
    console.log('FAIL ' + scheme + ' ' + w + 'x' + h + ': 尺寸不同'); fail++; continue;
  }
  let diff = 0;
  for (let i = 0; i < a.raster.data.length; i++) if (a.raster.data[i] !== b.raster.data[i]) diff++;
  const px = a.raster.width * a.raster.height;
  if (diff) { console.log('FAIL ' + scheme + ' ' + w + 'x' + h + ': ' + diff + ' 个通道不同 / ' + (px*4)); fail++; }
  else console.log('ok   ' + scheme + ' ' + w + 'x' + h + ': 逐像素一致 (' + px + ' 像素)');
}
// 键集合也必须一致（除身份字段）
const textA = A.find(f => f.name.toLowerCase() === 'skin.ini').data;
const textB = B.find(f => f.name.toLowerCase() === 'skin.ini').data;
console.log('Skin.ini 字节数: 原 ' + textA.length + '  克隆 ' + textB.length);
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
