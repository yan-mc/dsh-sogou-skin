import { isKnownKey, knownSections } from '../src/skin/spec.js';
console.log('已知段落:', knownSections().join(', '));
const probe = [
  ['Scheme_H1','layered'],['Scheme_H1','pic'],['Scheme_H1','layout_horizontal'],['Scheme_H1','pinyin_marge'],
  ['Scheme_H1','pageup_align'],['Scheme_H1','custom0'],['Scheme_H1','sugg_hover'],
  ['StatusBar','pic_mask'],['StatusBar','cn_en_display'],['StatusBar','cn_en_pos'],['StatusBar','logo_down'],
  ['Display','default_skin'],['General','skin_id'],['General','preview_square'],
  ['Scheme_H1','piccc'],['Scheme_H1','pinyin_marg'],['StatusBar','cn_en_position'],['Foo','bar'],
];
let ok=0, bad=0;
for (const [s,k] of probe) { const r = isKnownKey(s,k); if (s==='Foo'||k.endsWith('cc')||k.endsWith('marg')||k.endsWith('position')) { if(!r) ok++; else { console.log('  漏判(应未知却判已知):', s, k); bad++; } } else { if(r) ok++; else { console.log('  误判(应已知却判未知):', s, k); bad++; } } }
console.log('词表判定: ' + ok + ' 正确, ' + bad + ' 错误');
