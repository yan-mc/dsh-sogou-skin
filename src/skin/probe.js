// @ts-check
/**
 * 素材探测：把一堆用户图片变成 AI 可读的结构化描述。
 * 这一层是「AI 扫描素材」的眼睛 —— 它只做客观测量，不做决策；决策交给模型或用户。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { decodePng, isPng } from '../image/png.js';
import { decodeBmp, isBmp } from '../image/bmp.js';
import { alphaBBox, dominantHue, getPixel } from '../image/raster.js';

const IMAGE_EXT = new Set(['.png', '.bmp', '.jpg', '.jpeg', '.webp', '.gif']);

/**
 * 读入一张图 -> Raster。JPEG/WebP/GIF 本插件不解码（零依赖约束），需要用户先转成 PNG。
 * @param {string} path
 * @returns {{ok:true, raster:import('../image/png.js').Raster, format:'png'|'bmp'}
 *          |{ok:false, error:string}}
 */
export function loadImage(path) {
    let buf;
    try { buf = new Uint8Array(readFileSync(path)); } catch (e) { return { ok: false, error: '读取失败：' + String(e) }; }
    try {
        if (isPng(buf)) return { ok: true, raster: decodePng(buf), format: 'png' };
        if (isBmp(buf)) return { ok: true, raster: decodeBmp(buf), format: 'bmp' };
        const ext = extname(path).toLowerCase();
        return { ok: false, error: '不支持的图片格式 ' + ext + '（请先转成 PNG；本插件零依赖，不解码 JPEG/WebP/GIF）' };
    } catch (e) {
        return { ok: false, error: '解码失败：' + String(e) };
    }
}

/**
 * 客观特征测量。
 * @param {import('../image/png.js').Raster} r
 */
export function probeImage(r) {
    const n = r.width * r.height;
    let transparent = 0;
    let partial = 0;
    /** @type {Map<string, number>} */
    const colors = new Map();
    for (let i = 0; i < n; i++) {
        const a = r.data[i * 4 + 3];
        if (a === 0) transparent++;
        else if (a < 250) partial++;
        if (a > 8 && colors.size < 4096) {
            const key = (r.data[i * 4] << 16) | (r.data[i * 4 + 1] << 8) | r.data[i * 4 + 2];
            colors.set(key, (colors.get(key) || 0) + 1);
        }
    }
    const corners = [[0, 0], [r.width - 1, 0], [0, r.height - 1], [r.width - 1, r.height - 1]]
        .map(([x, y]) => getPixel(r, x, y).slice(0, 3));
    const hues = dominantHue(r);
    return {
        width: r.width,
        height: r.height,
        aspect: +(r.width / Math.max(1, r.height)).toFixed(3),
        hasAlpha: transparent + partial > 0,
        transparentRatio: +(transparent / n).toFixed(3),
        partialAlphaRatio: +(partial / n).toFixed(3),
        bbox: alphaBBox(r, 8),
        dominantHue: hues === null ? null : Math.round(hues * 360),
        approximateColorCount: colors.size,
        cornerColors: corners,
    };
}

/**
 * 扫描目录里的所有图片。
 * @param {string} dir
 * @param {{recursive?:boolean}} [opts]
 * @returns {{dir:string, files:object[], skipped:object[]}}
 */
export function scanDirectory(dir, opts = {}) {
    /** @type {object[]} */
    const files = [];
    /** @type {object[]} */
    const skipped = [];
    /** @param {string} d */
    const walk = (d) => {
        let names;
        try { names = readdirSync(d); } catch (e) { skipped.push({ path: d, reason: String(e) }); return; }
        for (const name of names) {
            const full = join(d, name);
            let st;
            try { st = statSync(full); } catch { continue; }
            if (st.isDirectory()) { if (opts.recursive !== false) walk(full); continue; }
            const ext = extname(name).toLowerCase();
            if (!IMAGE_EXT.has(ext)) continue;
            const loaded = loadImage(full);
            if (!loaded.ok) { skipped.push({ path: full, reason: loaded.error }); continue; }
            files.push({
                path: full,
                name: basename(full),
                storedFormat: loaded.format,
                bytes: st.size,
                ...probeImage(loaded.raster),
            });
        }
    };
    walk(dir);
    files.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return { dir, files, skipped };
}

/**
 * 把扫描结果压成给模型看的紧凑文本（避免一次塞几万个数字）。
 * @param {{files:object[]}} scan
 * @returns {string}
 */
export function formatScan(scan) {
    const lines = [];
    for (const f of scan.files) {
        lines.push([
            f.name,
            f.width + 'x' + f.height,
            f.storedFormat,
            f.hasAlpha ? ('alpha ' + Math.round(f.transparentRatio * 100) + '%') : '无alpha',
            f.dominantHue === null ? '无彩色' : ('色相' + f.dominantHue + '°'),
            f.bbox ? ('内容区 ' + f.bbox.w + 'x' + f.bbox.h) : '全透明',
            (f.bytes / 1024).toFixed(1) + 'KB',
        ].join(' | '));
    }
    return lines.join('\n');
}
