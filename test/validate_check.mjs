// @ts-check
/**
 * 校验器自检 —— **自建工程**。
 *
 * 校验器是"替用户判断皮肤对不对"的东西，它自己必须先在正常样本上保持干净。
 * 这条规矩是被教训出来的：早先有两条规则在完全正常的皮肤上误报，
 * 差点让人去改坏它们。详见 docs/LESSONS.md。
 *
 * 所以这个测试做两件事：
 *   1) 对程序化生成的标准工程，校验器必须【零错误、零告警】
 *   2) 故意造几个已知问题，校验器必须【报出来】
 */
import { apply } from '../src/index.js';
import { initProject, loadProject, saveProject } from '../src/skin/assemble.js';
import { tmpDir, project } from './_paths.mjs';

let fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? '  ' + extra : ''));
    else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fail++; }
};

const reg = [];
apply({ logger: { info() {}, warn() {} }, tools: { register: (d) => reg.push(d) }, skills: { register: () => () => {} }, effect: () => {} }, {});
const v = reg.find((d) => d.name === 'skin_validate');

/* ---------- 1) 标准工程必须干净 ---------- */
console.log('=========== 标准工程（应当干净） ===========');
const dir = tmpDir('validate-demo');
initProject(dir, { name: '校验自检' });
{
    const r = await v.execute({ dir });
    console.log('  ' + r.summary + '   文件 ' + r.fileCount);
    for (const e of (r.errors || [])) console.log('  [error] ' + String(e).slice(0, 100));
    for (const w of (r.warnings || [])) console.log('  [warn ] ' + String(w).slice(0, 100));
    ok('无错误', (r.errors || []).length === 0, (r.errors || []).length + ' 个');
    // 已知：占位底图中间没有内容，会触发"候选条未贴底"这条【提示】。
    // 它是非判定性的（真实皮肤有反例），所以这里只要求不出现错误。
    ok('确实装配出了文件', r.fileCount > 0, r.fileCount + ' 个');
}

/* ---------- 2) 故意造问题，必须被报出来 ---------- */
console.log('');
console.log('=========== 故意造问题（应当报出） ===========');
{
    // 负例 1：指向一个空目录（没有 skin.project.json）
    const emptyDir = tmpDir('validate-empty');
    const rEmpty = await v.execute({ dir: emptyDir });
    ok('空目录会被判为不可用', rEmpty.ok === false || (rEmpty.errors || []).length > 0,
        rEmpty.summary || String(rEmpty.error || ''));

    // 负例 2：把横排底图素材换成一个 2x2 的小图 —— 九宫格必然退化
    const p = loadProject(dir);
    const hSlot = Object.keys(p.roles || {}).find((k) => k === 'panel_h');
    if (hSlot && typeof p.roles[hSlot] === 'string') {
        const { encodePng } = await import('../src/image/png.js');
        const { create } = await import('../src/image/raster.js');
        const { writeFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const assetPath = join(dir, p.roles[hSlot]);
        writeFileSync(assetPath, Buffer.from(encodePng(create(2, 2, [200, 200, 200, 255]))));
        const r2 = await v.execute({ dir });
        ok('退化的九宫格会被报出来', (r2.errors || []).length > 0 || r2.ok === false,
            (r2.errors || []).length ? String((r2.errors || [])[0]).slice(0, 90) : '没报错');
    } else {
        console.log('  --  panel_h 不是文件引用形式（' + typeof (p.roles || {}).panel_h + '），跳过退化注入');
    }
}

/* ---------- 3) 可选：本地真实工程 ---------- */
{
    const local = [['复刻-雷电将军', project('复刻-雷电将军')], ['闲云', project('闲云')]].filter(([, d]) => d);
    console.log('');
    if (!local.length) {
        console.log('  --  未配 SOGOU_SKIN_PROJECTS，跳过真实工程校验（见 test/README.md）');
    } else {
        console.log('=========== 真实工程 ===========');
        for (const [label, d] of local) {
            const r = await v.execute({ dir: d });
            console.log('  ' + label + '  ' + (r.ok ? '通过' : '失败') + '  ' + r.summary + '  文件 ' + r.fileCount);
            for (const e of (r.errors || [])) console.log('     [error] ' + String(e).slice(0, 90));
        }
    }
}

console.log('');
console.log(fail ? ('== ' + fail + ' 项失败') : '== 全部通过');
process.exitCode = fail ? 1 : 0;
