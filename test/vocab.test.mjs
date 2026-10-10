import { readFileSync } from 'node:fs';
import { IniDoc, decodeIni } from '../src/ssf/ini.js';
import { readSkin } from '../src/ssf/container.js';
import { isKnownKey, knownSections } from '../src/skin/spec.js';

const sources = [
  ['官方默认皮肤 (Skin.dat v1)', (() => {
      const b = readFileSync('C:/Program Files (x86)/SogouYSInput/1.1.0.1278/Skin.dat');
      const payload = b.subarray(8);
      const n = payload.readUInt32LE(4) / 4;
      for (let i = 0; i < n; i++) {
          const o = payload.readUInt32LE(8 + i * 4);
          const nl = payload.readUInt32LE(o);
          const name = payload.toString('utf16le', o + 4, o + 4 + nl);
          if (name.toLowerCase() === 'skin.ini') {
              const cl = payload.readUInt32LE(o + 4 + nl);
              return payload.subarray(o + 4 + nl + 4, o + 4 + nl + 4 + cl);
          }
      }
      throw new Error('没找到 Skin.ini');
  })()],
  ['样本A 明文ZIP', readSkin(new Uint8Array(readFileSync('F:/Deepseek_harness/输入法皮肤/00-原始样本/雷电将军影宝.ssf'))).entries.find(e => e.name.toLowerCase() === 'skin.ini').data],
  ['样本B v3加密', readSkin(new Uint8Array(readFileSync('F:/Deepseek_harness/输入法皮肤/00-原始样本/原神—雷电将军.ssf'))).entries.find(e => e.name.toLowerCase() === 'skin.ini').data],
];

let grandUnknown = 0, grandKeys = 0;
for (const [label, bytes] of sources) {
    const doc = new IniDoc(decodeIni(bytes));
    const unknownSec = [];
    const unknownKeys = [];
    let keys = 0;
    for (const sec of doc.sections()) {
        if (!knownSections().includes(sec)) { unknownSec.push(sec); continue; }
        for (const k of Object.keys(doc.section(sec))) {
            keys++;
            if (!isKnownKey(sec, k)) unknownKeys.push('[' + sec + '] ' + k);
        }
    }
    grandKeys += keys; grandUnknown += unknownKeys.length;
    console.log(label + '：' + doc.sections().length + ' 段 / ' + keys + ' 键');
    if (unknownSec.length) console.log('   未知段落：' + unknownSec.join(', '));
    if (unknownKeys.length) console.log('   未知键：' + unknownKeys.join(', '));
    else console.log('   全部键都在词表内 ✓');
}
console.log('');
console.log('合计 ' + grandKeys + ' 个键，未知 ' + grandUnknown + ' 个');
