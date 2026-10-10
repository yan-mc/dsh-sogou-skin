// @ts-check
/**
 * 零依赖 BMP 编解码。
 * 编码端严格复刻搜狗皮肤用的那种 BMP：14 字节文件头 + 40 字节 BITMAPINFOHEADER，
 * bfOffBits=54，24bpp BI_RGB，自下而上，行按 4 字节对齐 —— 20x20 必须正好 1256 字节。
 */
/** @param {Uint8Array} u8 */
export function isBmp(u8) {
    return u8.length >= 2 && u8[0] === 0x42 && u8[1] === 0x4D;
}

/**
 * @param {Uint8Array} u8
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function decodeBmp(u8) {
    if (!isBmp(u8)) throw new Error('不是 BMP（缺少 BM 魔数）');
    const b = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    const dataOff = b.readUInt32LE(10);
    const hdrSize = b.readUInt32LE(14);
    const width = b.readInt32LE(18);
    let height = b.readInt32LE(22);
    const planes = b.readUInt16LE(26);
    const bpp = b.readUInt16LE(28);
    const compression = b.readUInt32LE(30);
    if (planes !== 1) throw new Error('BMP planes != 1');
    if (compression !== 0) throw new Error('不支持的 BMP 压缩方式 ' + compression + '（只支持 BI_RGB）');
    const topDown = height < 0;
    if (topDown) height = -height;
    if (width <= 0 || height <= 0) throw new Error('BMP 尺寸非法 ' + width + 'x' + height);

    const out = new Uint8Array(width * height * 4);
    const rowSize = Math.floor((bpp * width + 31) / 32) * 4;

    if (bpp === 24 || bpp === 32) {
        const step = bpp / 8;
        for (let y = 0; y < height; y++) {
            const srcY = topDown ? y : height - 1 - y;
            const rowOff = dataOff + srcY * rowSize;
            for (let x = 0; x < width; x++) {
                const p = rowOff + x * step;
                const o = (y * width + x) * 4;
                out[o] = b[p + 2];
                out[o + 1] = b[p + 1];
                out[o + 2] = b[p];
                out[o + 3] = bpp === 32 ? b[p + 3] : 255;
            }
        }
        return { width, height, data: out };
    }

    if (bpp === 8 || bpp === 4 || bpp === 1) {
        const colorsUsed = b.readUInt32LE(46) || (1 << bpp);
        const paletteOff = 14 + hdrSize;
        const pal = [];
        for (let i = 0; i < colorsUsed; i++) {
            const p = paletteOff + i * 4;
            pal.push([b[p + 2], b[p + 1], b[p], 255]);
        }
        const perByte = 8 / bpp;
        for (let y = 0; y < height; y++) {
            const srcY = topDown ? y : height - 1 - y;
            const rowOff = dataOff + srcY * rowSize;
            for (let x = 0; x < width; x++) {
                const byte = b[rowOff + Math.floor(x / perByte)];
                const shift = 8 - bpp * ((x % perByte) + 1);
                const idx = (byte >> shift) & ((1 << bpp) - 1);
                const c = pal[idx] || [0, 0, 0, 255];
                const o = (y * width + x) * 4;
                out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
            }
        }
        return { width, height, data: out };
    }
    throw new Error('不支持的 BMP 位深 ' + bpp);
}

/**
 * 编码成搜狗风格的 24 位 BMP。
 * @param {{width:number,height:number,data:Uint8Array}} r
 * @param {{background?:[number,number,number]}} [opts] alpha 合成用的底色，默认白
 * @returns {Uint8Array}
 */
export function encodeBmp24(r, opts = {}) {
    const bg = opts.background || [255, 255, 255];
    const { width, height, data } = r;
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelBytes = rowSize * height;
    const total = 54 + pixelBytes;
    const out = Buffer.alloc(total);

    out.write('BM', 0, 'latin1');
    out.writeUInt32LE(total, 2);
    out.writeUInt32LE(0, 6);
    out.writeUInt32LE(54, 10);
    out.writeUInt32LE(40, 14);
    out.writeInt32LE(width, 18);
    out.writeInt32LE(height, 22);
    out.writeUInt16LE(1, 26);
    out.writeUInt16LE(24, 28);
    out.writeUInt32LE(0, 30);
    out.writeUInt32LE(pixelBytes, 34);
    out.writeInt32LE(2835, 38);
    out.writeInt32LE(2835, 42);
    out.writeUInt32LE(0, 46);
    out.writeUInt32LE(0, 50);

    for (let y = 0; y < height; y++) {
        const dstY = height - 1 - y;      // 自下而上
        const rowOff = 54 + dstY * rowSize;
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const a = data[o + 3] / 255;
            const rr = Math.round(data[o] * a + bg[0] * (1 - a));
            const gg = Math.round(data[o + 1] * a + bg[1] * (1 - a));
            const bb = Math.round(data[o + 2] * a + bg[2] * (1 - a));
            const p = rowOff + x * 3;
            out[p] = bb; out[p + 1] = gg; out[p + 2] = rr;
        }
    }
    return Uint8Array.from(out);
}
