// @ts-check
import assert from 'node:assert';
import { writeFileSync, mkdirSync } from 'node:fs';
import { create, clone, getPixel, setPixel, fillRect, resize, crop, paste, containFit, nineSlice,
    replaceColor, removeBackground, alphaBBox, trim, dominantHue, hueShift, normalizeHue, adjust,
    sheetCells, autoSheetCells, outline } from '../src/image/raster.js';
import { encodePng, decodePng, isPng } from '../src/image/png.js';
import { encodeBmp24, decodeBmp, isBmp } from '../src/image/bmp.js';
import { tmpDir } from './_paths.mjs';

// 产物写到系统临时目录 —— 测试绝不往仓库外乱写（见 test/_paths.mjs）
const OUT = tmpDir('imgtest');
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } };

console.log('--- BMP 尺寸基准（必须与搜狗一致） ---');
// 实测：搜狗皮肤里的 20x20 BMP 多为 1256 字节 = 标准 1254 + 2 个尾部填充零字节；
// 但同一套皮肤里的 en_biaodian1.bmp 就是干净的 1254（biSizeImage=0，图像编辑器导出），
// 说明引擎按头部的宽高读取，标准 1254 完全可用 —— 因此我们输出标准尺寸。
t('20x20 -> 1254（标准；皮肤里的 1256 是 +2 填充）', () => assert.strictEqual(encodeBmp24(create(20, 20, [255, 255, 255, 255])).length, 1254));
t('20x20 解码兼容 +2 填充的文件', () => {
    const std = encodeBmp24(create(20, 20, [255, 0, 0, 255]));
    const padded = new Uint8Array(std.length + 2);
    padded.set(std); // 尾部补两个零字节，模拟搜狗皮肤里的形态
    padded[2] = (std.length + 2) & 0xFF; padded[3] = ((std.length + 2) >> 8) & 0xFF;
    const dec = decodeBmp(padded);
    assert.strictEqual(dec.width, 20);
    assert.deepStrictEqual(getPixel(dec, 5, 5).slice(0, 3), [255, 0, 0]);
});
t('5x115 -> 1894', () => assert.strictEqual(encodeBmp24(create(5, 115, [255, 255, 255, 255])).length, 1894));
t('6x25  -> 554', () => assert.strictEqual(encodeBmp24(create(6, 25, [255, 255, 255, 255])).length, 554));
t('28x27 -> 2322', () => assert.strictEqual(encodeBmp24(create(28, 27, [255, 255, 255, 255])).length, 2322));

console.log('--- PNG 往返 ---');
const cases = [];
cases.push(['1x1', create(1, 1, [12, 34, 56, 255])]);
cases.push(['2x3', (() => { const r = create(2, 3); for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) setPixel(r, x, y, [x * 100, y * 80, 200, 255]); return r; })()]);
cases.push(['全透明', create(8, 8, [255, 0, 0, 0])]);
cases.push(['渐变', (() => { const r = create(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPixel(r, x, y, [x * 16, y * 16, 128, Math.round((x + y) / 30 * 255)]); return r; })()]);
cases.push(['半透明块', (() => { const r = create(10, 10, [255, 255, 255, 255]); fillRect(r, 2, 2, 4, 4, [255, 0, 0, 128]); return r; })()]);
for (const [name, r] of cases) {
    t('PNG 往返 ' + name, () => {
        const enc = encodePng(r);
        assert.ok(isPng(enc));
        const dec = decodePng(enc);
        assert.strictEqual(dec.width, r.width);
        assert.strictEqual(dec.height, r.height);
        for (let i = 0; i < r.data.length; i++) assert.strictEqual(dec.data[i], r.data[i], 'byte ' + i);
    });
}

console.log('--- BMP 往返 ---');
t('BMP 往返（alpha 全 255）', () => {
    const r = cases[1][1];
    const dec = decodeBmp(encodeBmp24(r));
    assert.strictEqual(dec.width, r.width);
    for (let i = 0; i < r.data.length; i += 4) {
        assert.strictEqual(dec.data[i], r.data[i]);
        assert.strictEqual(dec.data[i + 1], r.data[i + 1]);
        assert.strictEqual(dec.data[i + 2], r.data[i + 2]);
    }
});
t('BMP alpha 合成到白底', () => {
    const r = create(2, 1, [0, 0, 0, 0]);
    setPixel(r, 0, 0, [255, 0, 0, 128]);   // 半透明红 -> 白底约 (255,127,127)
    const dec = decodeBmp(encodeBmp24(r));
    const p = getPixel(dec, 0, 0);
    assert.ok(Math.abs(p[0] - 255) <= 1 && Math.abs(p[1] - 127) <= 2 && Math.abs(p[2] - 127) <= 2, 'got ' + p);
});
t('BMP 自下而上顺序正确', () => {
    const r = create(1, 3, [0, 0, 0, 255]);
    setPixel(r, 0, 0, [255, 0, 0, 255]);
    const dec = decodeBmp(encodeBmp24(r));
    assert.deepStrictEqual(getPixel(dec, 0, 0).slice(0, 3), [255, 0, 0]);
});

console.log('--- Raster 操作 ---');
t('resize 尺寸', () => { const r = resize(create(10, 10, [1, 2, 3, 255]), 25, 7); assert.strictEqual(r.width, 25); assert.strictEqual(r.height, 7); });
t('crop 越界安全', () => { const r = crop(create(4, 4, [9, 9, 9, 255]), 2, 2, 5, 5); assert.strictEqual(r.width, 5); assert.strictEqual(r.height, 5); });
t('paste/source-over', () => { const d = create(4, 4, [0, 0, 0, 255]); const s = create(2, 2, [255, 255, 255, 255]); paste(d, s, 1, 1); assert.deepStrictEqual(getPixel(d, 1, 1).slice(0, 3), [255, 255, 255]); });
t('containFit 居中', () => { const r = containFit(create(10, 5, [255, 0, 0, 255]), 20, 20); assert.strictEqual(r.width, 20); assert.strictEqual(getPixel(r, 10, 10)[3], 255); assert.strictEqual(getPixel(r, 0, 0)[3], 0); });
t('nineSlice 四角保持', () => {
    const src = create(10, 10, [0, 0, 0, 0]);
    setPixel(src, 0, 0, [255, 0, 0, 255]); setPixel(src, 9, 0, [0, 255, 0, 255]);
    setPixel(src, 0, 9, [0, 0, 255, 255]); setPixel(src, 9, 9, [255, 255, 0, 255]);
    const out = nineSlice(src, 40, 30, { left: 2, right: 2, top: 2, bottom: 2 });
    assert.strictEqual(out.width, 40); assert.strictEqual(out.height, 30);
    assert.deepStrictEqual(getPixel(out, 0, 0).slice(0, 3), [255, 0, 0]);
    assert.deepStrictEqual(getPixel(out, 39, 0).slice(0, 3), [0, 255, 0]);
    assert.deepStrictEqual(getPixel(out, 0, 29).slice(0, 3), [0, 0, 255]);
    assert.deepStrictEqual(getPixel(out, 39, 29).slice(0, 3), [255, 255, 0]);
});
t('nineSlice 目标过小不崩', () => { const r = nineSlice(create(100, 100, [1, 1, 1, 255]), 3, 3, { left: 40, right: 40, top: 40, bottom: 40 }); assert.strictEqual(r.width, 3); });
t('replaceColor 计数', () => { const r = create(4, 4, [255, 0, 0, 255]); assert.strictEqual(replaceColor(r, [255, 0, 0, 255], 5, [0, 255, 0, 255]), 16); assert.strictEqual(getPixel(r, 0, 0)[1], 255); });
t('removeBackground 抠四角', () => {
    const r = create(8, 8, [255, 255, 255, 255]);
    fillRect(r, 3, 3, 2, 2, [255, 0, 0, 255]);
    const n = removeBackground(r, { tol: 10 });
    assert.strictEqual(getPixel(r, 0, 0)[3], 0);
    assert.strictEqual(getPixel(r, 3, 3)[3], 255);
    assert.strictEqual(n, 60);
});
t('alphaBBox / trim', () => {
    const r = create(10, 10);
    fillRect(r, 2, 3, 4, 5, [1, 2, 3, 255]);
    assert.deepStrictEqual(alphaBBox(r), { x: 2, y: 3, w: 4, h: 5 });
    const tr = trim(r);
    assert.strictEqual(tr.width, 4); assert.strictEqual(tr.height, 5);
});
t('dominantHue 识别蓝', () => { const h = dominantHue(create(8, 8, [0, 0, 255, 255])); assert.ok(Math.abs(h - 0.6667) < 0.03, 'got ' + h); });
t('normalizeHue 搬运色相', () => {
    const r = create(8, 8, [0, 0, 255, 255]);
    const d = normalizeHue(r, 0.0);
    const p = getPixel(r, 0, 0);
    assert.ok(p[0] > 200 && p[2] < 60, 'got ' + p + ' delta=' + d);
});
t('adjust 亮度', () => { const r = create(2, 2, [100, 100, 100, 255]); adjust(r, { brightness: 1.5 }); assert.strictEqual(getPixel(r, 0, 0)[0], 150); });
t('sheetCells 固定网格', () => { const r = create(20, 20, [1, 1, 1, 255]); const c = sheetCells(r, { cols: 2, rows: 2 }); assert.strictEqual(c.length, 4); assert.strictEqual(c[0].width, 10); });
t('autoSheetCells 自动切分', () => {
    const r = create(24, 24, [0, 0, 0, 0]);
    fillRect(r, 1, 1, 9, 9, [255, 0, 0, 255]);
    fillRect(r, 14, 1, 9, 9, [0, 255, 0, 255]);
    fillRect(r, 1, 14, 9, 9, [0, 0, 255, 255]);
    fillRect(r, 14, 14, 9, 9, [255, 255, 0, 255]);
    const cells = autoSheetCells(r, { minCell: 5 });
    assert.strictEqual(cells.length, 4, 'got ' + cells.length);
});
t('outline 加边', () => {
    const r = create(9, 9, [0, 0, 0, 0]);
    fillRect(r, 3, 3, 3, 3, [255, 0, 0, 255]);
    outline(r, [255, 255, 255, 255], 1);
    assert.strictEqual(getPixel(r, 2, 4)[3], 255);
});

console.log('\n--- 导出给 Python 交叉验证的样本 ---');
const big = create(64, 40);
for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) setPixel(big, x, y, [(x * 4) & 255, (y * 6) & 255, ((x * y) >> 3) & 255, x < 8 ? 0 : (x < 16 ? 128 : 255)]);
writeFileSync(OUT + '/js_encoded.png', Buffer.from(encodePng(big)));
writeFileSync(OUT + '/js_encoded.bmp', Buffer.from(encodeBmp24(big, { background: [0, 0, 0] })));
console.log('  ' + OUT + '/js_encoded.png');
console.log('  ' + OUT + '/js_encoded.bmp');
console.log('\n通过 ' + pass + ' / ' + (pass + (process.exitCode ? 1 : 0)) + ' 项');
