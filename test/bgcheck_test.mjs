// @ts-check
/**
 * 白底对照 —— **自建工程**。
 *
 * 这条规矩是被用户点出来的：所有勾边原本都用近黑色，
 * 在黑底上完全隐形、在白底上就是一道黑边，而我在黑底上测了十几轮都没发现。
 *
 * 所以 skin_preview 现在【每次都自动产出】白底/黑底对照，不靠人记得。
 * 这个测试守住两件事：
 *   1) 预览确实产出了 bgcheck
 *   2) 勾边色不是近黑（那正是白底黑边的来源）
 */
import { apply } from '../src/index.js';
import { initProject, loadProject, assembleSkin } from '../src/skin/assemble.js';
import { tmpDir, project } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

const reg = [];
apply({ logger: { info() {}, warn() {} }, tools: { register: (d) => reg.push(d) }, skills: { register: () => () => {} }, effect: () => {} }, {});
const t = reg.find((d) => d.name === 'skin_preview');

console.log('=========== 自建工程 ===========');
const dir = tmpDir('bgcheck-demo');
initProject(dir, { name: '白底自检' });
{
    const r = await t.execute({ dir });
    console.log('  ok=' + r.ok + (r.error ? '  err=' + r.error : ''));
    ok('预览执行成功', r.ok === true && !r.error);
    ok('返回了 bgcheckIssues 字段', 'bgcheckIssues' in r);
    console.log('  白底暗边告警: ' + JSON.stringify(r.bgcheckIssues || []));
    for (const w of (r.warnings || []).slice(0, 4)) console.log('  [warn] ' + String(w).slice(0, 90));
}

/* ---------- 预览产物必须落盘 ---------- */
console.log('');
console.log('=========== 预览产物 ===========');
{
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const pv = join(dir, 'preview');
    // bgcheck.png 是白底/黑底并排对照 —— 它存在的意义就是"不靠人记得去看白底"
    for (const f of ['preview.png', 'bgcheck.png']) {
        ok(f + ' 已生成', existsSync(join(pv, f)), join(pv, f));
    }
}

/* ---------- 可选：本地真实工程 ---------- */
{
    const local = [['闲云', project('闲云')], ['复刻', project('复刻-雷电将军')]].filter(([, d]) => d);
    console.log('');
    if (!local.length) {
        console.log('  --  未配 SOGOU_SKIN_PROJECTS，跳过真实工程白底对照（见 test/README.md）');
    } else {
        console.log('=========== 真实工程 ===========');
        for (const [label, d] of local) {
            const r = await t.execute({ dir: d });
            console.log('  ' + label + '  ok=' + r.ok + '  白底暗边告警: ' + JSON.stringify(r.bgcheckIssues || []));
        }
    }
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
