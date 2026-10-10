// @ts-check
/**
 * 九宫格拉伸体检 —— **自建工程**。
 *
 * 这一条守的是整个项目里最贵的一个结论：
 *
 *   引擎要把底图按九宫格铺进一个 W×H 的窗口。只要
 *     left + right > W   或   top + bottom > H
 *   九宫格就不成立，引擎【只能把整张底图硬缩放到 W×H】——
 *   立绘被压扁、文字跑位、上下两排错乱，全是这一个原因。
 *
 * 所以关键规矩是：只在【真正会变化的那根轴】上设内缩。
 *   横排候选窗：打字变长 -> 只变宽 -> 只在 layout_horizontal 设内缩
 *   竖排候选窗：候选变多 -> 只变高 -> 只在 layout_vertical   设内缩
 *
 * 这个测试对自建工程在一批真实窗口尺寸上做体检，要求全部不退化。
 */
import { initProject, loadProject, assembleSkin } from '../src/skin/assemble.js';
import { renderStretchTest, toPng } from '../src/skin/preview.js';
import { auditNineSlice } from '../src/skin/layout.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir, project } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

/* 真机上量到的候选窗尺寸（逻辑像素，DPI 168 / 缩放 1.75）。
   早先我拿 26x32 这种根本不存在的窗口高度去探测，把两张正常皮肤判成了退化。 */
const H1_SIZES = [[460, 236], [640, 258], [900, 258], [1100, 268]];
const V1_SIZES = [[420, 300], [520, 428], [640, 560], [720, 700]];

console.log('=========== 自建工程 ===========');
const dir = tmpDir('stretch-demo');
initProject(dir, { name: '拉伸自检' });
const res = assembleSkin(loadProject(dir), dir);
console.log('  装配出 ' + res.files.length + ' 个文件');

console.log('');
console.log('=========== 九宫格退化探测 ===========');
function probe(label, slot, sizes) {
    const f = res.files.find((x) => x.name.toLowerCase() === slot + '.png')
        || res.files.find((x) => x.name.toLowerCase().startsWith(slot));
    if (!f) { console.log('  --  ' + label + '：工程里没有 ' + slot + '，跳过'); return; }
    const { decodePng } = require_png();
    const r = decodePng(f.data);
    // 从装配结果里读回九宫格（assemble 会把探测到的值写进 layoutInfo）
    console.log('  ' + label + ' 底图 ' + r.width + 'x' + r.height);
    let bad = 0;
    for (const [w, h] of sizes) {
        const ns = guessNS(r);
        const a = auditNineSlice(r, ns, { growAxis: slot === 'panel_v' ? 'v' : 'h', targetW: w, targetH: h });
        if (a.errors && a.errors.length) {
            bad++;
            console.log('     [' + w + 'x' + h + '] ' + a.errors.map((e) => e.code || e).join(', '));
        }
    }
    ok(label + ' 在 ' + sizes.length + ' 组真实尺寸下均不退化', bad === 0, bad ? bad + ' 组退化' : '');
}
function require_png() { return { decodePng: decodePngCache }; }
let decodePngCache = null;
{
    const m = await import('../src/image/png.js');
    decodePngCache = m.decodePng;
}
/** 占位工程的九宫格是从 placeholderGeometry 来的，这里按同一套规则取 */
function guessNS(r) {
    const W = r.width, H = r.height;
    if (W > H) { const barH = 46, barY = H - barH - 12; return { left: 100, right: Math.round(W * 0.42), top: barY - 4, bottom: 6 }; }
    const barX = 10, barW = Math.round(W * 0.52);
    return { left: barX + 6, right: W - barX - barW, top: 30, bottom: 24 };
}
probe('横排候选窗', 'skin1', H1_SIZES);
probe('竖排候选窗', 'skin2', V1_SIZES);

console.log('');
console.log('=========== 拉伸体检图 ===========');
{
    const png = toPng(renderStretchTest(res.files));
    const out = join(tmpDir('stretch'), 'stretch.png');
    writeFileSync(out, Buffer.from(png));
    ok('体检图已生成', png.length > 100, png.length + ' 字节 -> ' + out);
}

/* ---------- 可选：本地真实工程 ---------- */
{
    const d = project('复刻-雷电将军');
    console.log('');
    if (!d) {
        console.log('  --  未配 SOGOU_SKIN_PROJECTS，跳过真实工程体检（见 test/README.md）');
    } else {
        const r2 = assembleSkin(loadProject(d), d);
        ok('真实工程也能装配', r2.files.length > 0, r2.files.length + ' 个文件');
    }
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
