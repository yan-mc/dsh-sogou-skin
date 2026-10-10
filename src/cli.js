#!/usr/bin/env node
// @ts-check
/**
 * 独立 CLI —— 不依赖 DSH 运行时，方便在没有 harness 的环境里验证与调试。
 * 插件里的工具（src/tools.js）只是这一层的薄包装。
 *
 * 用法：node src/cli.js <命令> [参数]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { flattenSpec, minimalRequirements, BUTTON_SLOTS, PANEL_SLOTS } from './skin/spec.js';
import { assembleSkin, buildSsf, initProject, inspectSsf, loadProject, saveProject, writeSkinDir } from './skin/assemble.js';
import { scanDirectory, formatScan } from './skin/probe.js';
import { renderMock, renderSheet, renderStretchTest, toPng } from './skin/preview.js';
import { renderRealistic } from './skin/render.js';
import { readSkin } from './ssf/container.js';
import { decodeIni } from './ssf/ini.js';

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, def = undefined) {
    const i = argv.indexOf('--' + name);
    if (i < 0) return def;
    const v = argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
}
function arg(i) { return argv[i]; }

function printRequirements() {
    const min = minimalRequirements();
    console.log('=== 做一套搜狗皮肤需要哪些素材 ===\n');
    console.log('【最小可用】' + min.summary);
    console.log('  必需槽位：' + min.slots.join(', ') + '\n');
    const groups = new Map();
    for (const s of flattenSpec()) {
        if (!groups.has(s.group)) groups.set(s.group, []);
        groups.get(s.group).push(s);
    }
    for (const [g, list] of groups) {
        console.log('【' + g + '】');
        for (const s of list) {
            console.log('  ' + (s.required ? '[必需] ' : '[可选] ') + s.slot.padEnd(18) + s.label);
            console.log('         用途：' + s.purpose);
            console.log('         建议：' + s.sizeHint);
            if (s.variants) console.log('         变体：' + s.variants.join(' / ') + '（每个变体都要常态/悬停/按下三态）');
        }
        console.log('');
    }
}

function cmdRequirements() { printRequirements(); }

function cmdInit() {
    const dir = resolve(arg(1) || '.');
    const meta = { name: flag('name', basename(dir)), author: flag('author', '匿名'), info: flag('info', '') };
    const p = initProject(dir, meta);
    console.log('已创建皮肤工程：' + dir);
    console.log('  skin.project.json  —— 工程配置（素材分配、配色、按钮开关）');
    console.log('  ' + p.assetDir + '/            —— 把你的图片素材放进这里');
    console.log('  preview/           —— 预览图输出目录');
    console.log('\n下一步：node src/cli.js scan "' + dir + '"');
}

function cmdScan() {
    const target = resolve(arg(1) || '.');
    const assetDir = existsSync(join(target, 'skin.project.json')) ? join(target, 'assets') : target;
    const scan = scanDirectory(assetDir, { recursive: true });
    console.log('扫描目录：' + scan.dir);
    console.log('可用图片 ' + scan.files.length + ' 张，跳过 ' + scan.skipped.length + ' 个文件');
    console.log('');
    console.log(formatScan(scan));
    if (scan.skipped.length) {
        console.log('\n跳过的文件：');
        for (const s of scan.skipped.slice(0, 20)) console.log('  ' + basename(s.path) + '  ' + s.reason);
    }
}

function cmdAssemble() {
    const dir = resolve(arg(1) || '.');
    const project = loadProject(dir);
    if (!project) { console.error('找不到 ' + join(dir, 'skin.project.json') + '，先运行 init'); process.exit(1); }
    const res = assembleSkin(project, dir);
    const outDir = join(dir, project.outDir || 'build');
    writeSkinDir(outDir, res.files);
    console.log('装配完成 -> ' + outDir);
    console.log('  文件 ' + res.files.length + ' 个：' + res.files.map((f) => f.name).join(', '));
    if (res.warnings.length) {
        console.log('\n警告 ' + res.warnings.length + ' 条：');
        for (const w of res.warnings) console.log('  ! ' + w);
    }
    console.log('\n--- 生成的 Skin.ini ---');
    console.log(res.ini);
}

function cmdPreview() {
    const dir = resolve(arg(1) || '.');
    const project = loadProject(dir);
    if (!project) { console.error('找不到 skin.project.json'); process.exit(1); }
    const res = assembleSkin(project, dir);
    const pvDir = join(dir, 'preview');
    mkdirSync(pvDir, { recursive: true });
    const mock = renderMock(res.files, { title: project.name || '皮肤预览', warnings: res.warnings });
    const mockPath = join(pvDir, 'preview.png');
    writeFileSync(mockPath, Buffer.from(toPng(mock)));
    const sheet = renderSheet(res.files);
    const sheetPath = join(pvDir, 'assets.png');
    writeFileSync(sheetPath, Buffer.from(toPng(sheet)));
    const stretch = renderStretchTest(res.files);
    const stretchPath = join(pvDir, 'stretch.png');
    writeFileSync(stretchPath, Buffer.from(toPng(stretch)));
    const real = renderRealistic(res.files, { title: project.name || 'rendered skin' });
    const realPath = join(pvDir, 'render.png');
    writeFileSync(realPath, Buffer.from(toPng(real.raster)));
    console.log('真实渲染（引擎模型）： ' + realPath);
    for (const n of real.notes.slice(0, 8)) console.log('    ' + n);
    console.log('预览图已生成：');
    console.log('  ' + mockPath + '  (' + mock.width + 'x' + mock.height + ')');
    console.log('  ' + sheetPath + '  (' + sheet.width + 'x' + sheet.height + ')');
    console.log('  ' + stretchPath + '  (' + stretch.width + 'x' + stretch.height + ')  <- 拉伸体检：长文本拉长时会不会变形');
    if (res.warnings.length) { console.log('\n警告：'); for (const w of res.warnings) console.log('  ! ' + w); }
}

function cmdPack() {
    const dir = resolve(arg(1) || '.');
    const project = loadProject(dir);
    if (!project) { console.error('找不到 skin.project.json'); process.exit(1); }
    const res = assembleSkin(project, dir);
    const out = flag('out', join(dir, (project.name || 'skin') + '.ssf'));
    const format = flag('format', 'zip');
    const template = flag('template', null);
    const built = buildSsf(res.files, { format, template: template ? resolve(String(template)) : null });
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, Buffer.from(built.data));
    console.log('已打包：' + out + '  (' + built.bytes + ' 字节, ' + built.format + ' 代际)');
    for (const w of built.warnings) console.log('  ! ' + w);
    // 立刻回读校验
    const back = readSkin(built.data);
    console.log('回读校验：' + back.generation + ' 代际，' + back.entries.length + ' 个条目');
    const ini = back.entries.find((e) => e.name.toLowerCase() === 'skin.ini');
    console.log('Skin.ini ' + (ini ? 'OK ' + ini.data.length + ' 字节' : '缺失！'));
}

function cmdInspect() {
    const f = resolve(arg(1) || '');
    const info = inspectSsf(f);
    console.log('文件：' + f);
    console.log('代际：' + info.format + (info.version ? ' v' + info.version : ''));
    console.log('条目：' + info.entries + ' 个，其中图片 ' + info.images.length + ' 张');
    console.log('');
    for (const i of info.images) console.log('  ' + i.name.padEnd(34) + i.bytes + ' B');
    if (info.ini) { console.log('\n--- Skin.ini ---'); console.log(info.ini); }
}

function cmdUnpack() {
    const f = resolve(arg(1) || '');
    const out = resolve(arg(2) || (basename(f).replace(/\.[^.]+$/, '') + '_unpacked'));
    const u8 = new Uint8Array(readFileSync(f));
    const skin = readSkin(u8);
    mkdirSync(out, { recursive: true });
    for (const e of skin.entries) writeFileSync(join(out, e.name), Buffer.from(e.data));
    const ini = skin.entries.find((e) => e.name.toLowerCase() === 'skin.ini');
    if (ini) writeFileSync(join(out, 'Skin.ini.utf8.txt'), decodeIni(ini.data), 'utf8');
    console.log('已解包 ' + skin.entries.length + ' 个文件 -> ' + out + '（' + skin.generation + ' 代际）');
    console.log('Skin.ini 另存了一份 UTF-8 副本：Skin.ini.utf8.txt');
}

/** 一条龙：建工程 -> 占位素材 -> 装配 -> 预览 -> 打包 */
function cmdDemo() {
    const dir = resolve(arg(1) || 'demo-skin');
    const project = initProject(dir, { name: flag('name', '演示皮肤'), author: 'DSH 搜狗皮肤工坊' });
    project.buttons.enabled = ['cn_en', 'quan_ban', 'biaodian', 'softkeyboard', 'menu', 'fan_jian'];
    project.roles.panel_h = { generate: true };
    project.roles.panel_v = { generate: true };
    project.roles.bar = { generate: true };
    for (const b of BUTTON_SLOTS) if (project.buttons.enabled.includes(b.slot)) project.roles[b.slot] = { generate: true };
    saveProject(dir, project);

    const res = assembleSkin(project, dir);
    writeSkinDir(join(dir, project.outDir), res.files);
    mkdirSync(join(dir, 'preview'), { recursive: true });
    const mock = renderMock(res.files, { title: project.name, warnings: res.warnings });
    writeFileSync(join(dir, 'preview', 'preview.png'), Buffer.from(toPng(mock)));
    writeFileSync(join(dir, 'preview', 'assets.png'), Buffer.from(toPng(renderSheet(res.files))));
    const built = buildSsf(res.files, { format: flag('format', 'zip') });
    const out = join(dir, project.name + '.ssf');
    writeFileSync(out, Buffer.from(built.data));

    console.log('演示工程已生成：' + dir);
    console.log('  素材文件 ' + res.files.length + ' 个');
    console.log('  预览图   ' + join(dir, 'preview', 'preview.png'));
    console.log('  皮肤包   ' + out + '  (' + built.bytes + ' 字节)');
    if (res.warnings.length) { console.log('\n警告 ' + res.warnings.length + ' 条：'); for (const w of res.warnings) console.log('  ! ' + w); }
}

/** 校验工程：跑一遍装配，把错误与提示分类列出。出错时返回非零退出码，方便接 CI。 */
function cmdValidate() {
    const dir = arg(1);
    if (!dir) { console.error('用法：cli.js validate <projectDir>'); process.exit(1); }
    const project = loadProject(dir);
    const res = assembleSkin(project, dir);
    const errors = res.errors || [];
    const warns = res.warnings || [];
    console.log('校验 ' + dir);
    console.log('  装配出 ' + res.files.length + ' 个文件');
    for (const e of errors) console.log('  [错误] ' + e);
    for (const w of warns) console.log('  [提示] ' + w);
    if (!errors.length && !warns.length) console.log('  ✓ 通过，没有发现问题');
    else console.log('  结论：' + errors.length + ' 个错误，' + warns.length + ' 条提示');
    process.exit(errors.length ? 1 : 0);
}

const COMMANDS = {
    requirements: cmdRequirements,
    validate: cmdValidate,
    init: cmdInit,
    scan: cmdScan,
    assemble: cmdAssemble,
    preview: cmdPreview,
    pack: cmdPack,
    inspect: cmdInspect,
    unpack: cmdUnpack,
    demo: cmdDemo,
};

if (!cmd || !COMMANDS[cmd]) {
    console.log('DSH 搜狗皮肤工坊 CLI\n');
    console.log('命令：');
    console.log('  requirements                       列出做皮肤需要哪些素材');
    console.log('  init <dir> [--name X]              新建皮肤工程');
    console.log('  scan <dir>                         扫描素材目录，输出客观特征');
    console.log('  assemble <projectDir>              按工程配置装配出皮肤目录');
    console.log('  validate <projectDir>              校验工程（错误返回非零退出码）');
    console.log('  preview <projectDir>               生成预览图（拟真图 + 素材总览）');
    console.log('  pack <projectDir> [--format zip|v3] [--out x.ssf] [--template t.ssf]');
    console.log('  inspect <file.ssf>                 解析皮肤包');
    console.log('  unpack <file.ssf> [outDir]         解包皮肤');
    console.log('  demo <dir>                         一条龙演示（占位素材）');
    process.exit(cmd ? 1 : 0);
}
COMMANDS[cmd]();
