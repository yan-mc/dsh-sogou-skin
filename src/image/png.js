// @ts-check
/**
 * 零依赖 PNG 编解码（8/16 位，灰度/灰度+alpha/调色板/RGB/RGBA，支持 Adam7 隔行）。
 * 只需要 node:zlib + 一个 CRC32 实现。
 */
import { inflateSync, deflateSync } from 'node:zlib';
import { crc32 } from '../ssf/zip.js';

const SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** @param {Uint8Array} u8 */
export function isPng(u8) {
    if (u8.length < 8) return false;
    for (let i = 0; i < 8; i++) if (u8[i] !== SIG[i]) return false;
    return true;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * @param {Uint8Array} u8
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function decodePng(u8) {
    if (!isPng(u8)) throw new Error('不是 PNG（签名不符）');
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    let off = 8;
    /** @type {{width:number,height:number,bitDepth:number,colorType:number,interlace:number}} */
    let ihdr = null;
    let palette = null;
    let trns = null;
    const idat = [];
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('latin1', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            ihdr = {
                width: data.readUInt32BE(0),
                height: data.readUInt32BE(4),
                bitDepth: data[8],
                colorType: data[9],
                interlace: data[12],
            };
        } else if (type === 'PLTE') {
            palette = Buffer.from(data);
        } else if (type === 'tRNS') {
            trns = Buffer.from(data);
        } else if (type === 'IDAT') {
            idat.push(Buffer.from(data));
        } else if (type === 'IEND') {
            break;
        }
        off += 12 + len;
    }
    if (!ihdr) throw new Error('PNG 缺少 IHDR');
    const { width, height, bitDepth, colorType, interlace } = ihdr;
    if (!CHANNELS[colorType]) throw new Error('不支持的 PNG colorType=' + colorType);
    if (![1, 2, 4, 8, 16].includes(bitDepth)) throw new Error('不支持的 PNG bitDepth=' + bitDepth);
    if (colorType === 3 && bitDepth === 16) throw new Error('调色板 PNG 不支持 16 位');

    const raw = inflateSync(Buffer.concat(idat));
    const out = new Uint8Array(width * height * 4);

    const bpp = Math.max(1, Math.ceil((CHANNELS[colorType] * bitDepth) / 8));
    if (interlace === 0) {
        unfilterAndConvert(raw, width, height, bitDepth, colorType, bpp, palette, trns, out, width, 0, 0, 1);
    } else if (interlace === 1) {
        const XO = [0, 4, 0, 2, 0, 1, 0];
        const YO = [0, 0, 4, 0, 2, 0, 1];
        const XS = [8, 8, 4, 4, 2, 2, 1];
        const YS = [8, 8, 8, 4, 4, 2, 2];
        let p = 0;
        for (let pass = 0; pass < 7; pass++) {
            const pw = Math.ceil((width - XO[pass]) / XS[pass]);
            const ph = Math.ceil((height - YO[pass]) / YS[pass]);
            if (pw <= 0 || ph <= 0) continue;
            const stride = pw * bpp + 1;
            const slice = raw.subarray(p, p + stride * ph);
            p += stride * ph;
            unfilterAndConvert(slice, pw, ph, bitDepth, colorType, bpp, palette, trns, out, width, XO[pass], YO[pass], XS[pass]);
        }
    } else {
        throw new Error('未知的 PNG interlace=' + interlace);
    }
    return { width, height, data: out };
}

/**
 * 反滤波 + 转成 RGBA8。隔行时按 (xo,yo,xs) 把像素散落到目标。
 */
function unfilterAndConvert(raw, w, h, bitDepth, colorType, bpp, palette, trns, out, outW, xo, yo, xs) {
    const stride = w * bpp;
    const cur = new Uint8Array(stride);
    const prev = new Uint8Array(stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
        if (p >= raw.length) break;
        const ft = raw[p++];
        const line = raw.subarray(p, p + stride);
        p += stride;
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? cur[i - bpp] : 0;
            const b = prev[i];
            const c = i >= bpp ? prev[i - bpp] : 0;
            const x = line[i];
            let v;
            switch (ft) {
                case 0: v = x; break;
                case 1: v = x + a; break;
                case 2: v = x + b; break;
                case 3: v = x + ((a + b) >> 1); break;
                case 4: {
                    const pp = a + b - c;
                    const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
                    v = x + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
                    break;
                }
                default: throw new Error('未知 PNG 滤波类型 ' + ft);
            }
            cur[i] = v & 0xFF;
        }
        const oy = yo + y * xs;
        if (oy < 0 || oy >= Math.floor((out.length / 4) / outW)) { /* 越界跳过 */ }
        for (let x = 0; x < w; x++) {
            const ox = xo + x * xs;
            const o = (oy * outW + ox) * 4;
            if (o + 3 >= out.length) continue;
            let r = 0, g = 0, b = 0, a = 255;
            const bitPos = x * CHANNELS[colorType] * bitDepth;
            const getBits = (n, count) => {
                let v = 0;
                for (let i = 0; i < count; i++) {
                    const bp = bitPos + n * bitDepth + i;
                    const byte = cur[bp >> 3] || 0;
                    v = (v << 1) | ((byte >> (7 - (bp & 7))) & 1);
                }
                return v;
            };
            switch (colorType) {
                case 0: {
                    const v = bitDepth === 16 ? cur[x * 2] : (bitDepth === 8 ? cur[x] : getBits(0, bitDepth) * (255 / ((1 << bitDepth) - 1)));
                    r = g = b = Math.round(v);
                    if (trns && trns.length >= 2) {
                        const tv = trns.readUInt16BE(0);
                        const sample = bitDepth === 16 ? (cur[x * 2] << 8 | cur[x * 2 + 1]) : (bitDepth === 8 ? cur[x] : getBits(0, bitDepth));
                        if (sample === tv) a = 0;
                    }
                    break;
                }
                case 2: {
                    const s = bitDepth === 16 ? 2 : 1;
                    r = cur[x * 3 * s]; g = cur[x * 3 * s + s]; b = cur[x * 3 * s + 2 * s];
                    if (trns && trns.length >= 6) {
                        if (bitDepth === 8 && trns[1] === r && trns[3] === g && trns[5] === b) a = 0;
                    }
                    break;
                }
                case 3: {
                    const idx = bitDepth === 8 ? cur[x] : getBits(0, bitDepth);
                    if (palette && idx * 3 + 2 < palette.length) { r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2]; }
                    if (trns && idx < trns.length) a = trns[idx];
                    break;
                }
                case 4: {
                    const s = bitDepth === 16 ? 2 : 1;
                    r = g = b = cur[x * 2 * s];
                    a = cur[x * 2 * s + s];
                    break;
                }
                case 6: {
                    const s = bitDepth === 16 ? 2 : 1;
                    r = cur[x * 4 * s]; g = cur[x * 4 * s + s]; b = cur[x * 4 * s + 2 * s]; a = cur[x * 4 * s + 3 * s];
                    break;
                }
            }
            out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
        }
        cur.copy ? prev.set(cur) : prev.set(cur);
    }
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'latin1');
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
}

/** @param {{width:number,height:number,data:Uint8Array}} r */
export function encodePng(r) {
    const { width, height, data } = r;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
    for (let y = 0; y < height; y++) {
        const line = data.subarray(y * stride, y * stride + stride);
        const prev = y > 0 ? data.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
        // 5 种滤波各算一遍，取绝对值和最小的（经典启发式）
        for (let x = 0; x < stride; x++) {
            const a = x >= 4 ? line[x - 4] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= 4) ? prev[x - 4] : 0;
            cand[0][x] = line[x];
            cand[1][x] = (line[x] - a) & 0xFF;
            cand[2][x] = (line[x] - b) & 0xFF;
            cand[3][x] = (line[x] - ((a + b) >> 1)) & 0xFF;
            const pp = a + b - c;
            const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
            cand[4][x] = (line[x] - (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xFF;
        }
        let best = 0; let bestScore = Infinity;
        for (let f = 0; f < 5; f++) {
            let s = 0;
            for (let x = 0; x < stride; x++) { const v = cand[f][x]; s += v < 128 ? v : 256 - v; }
            if (s < bestScore) { bestScore = s; best = f; }
        }
        raw[y * (stride + 1)] = best;
        cand[best].copy(raw, y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const parts = [
        Buffer.from(SIG),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ];
    return Uint8Array.from(Buffer.concat(parts));
}
