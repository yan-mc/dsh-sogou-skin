// @ts-check
/**
 * 手写 ZIP 读写器 —— 精确复刻搜狗 .ssf 使用的字段布局。
 * 只依赖 node:zlib。刻意不使用任何第三方库，也不使用 Node 的 zlib.crc32（版本可用性不一致）。
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/** 搜狗私有 extra field：ID 直接写 ASCII "SD"（字节 53 44），违反 PKWARE 的 0x8000+ 约定。 */
export const SD_ID = Buffer.from('SD', 'latin1');
/** 本地头里 SD 的完整载荷：4 字节小端值 + 100 字节常量尾巴。 */
export const SD_LOCAL_BODY = Buffer.from(
    'd000000000080089ff49486364606911616060306080001f206664053359458144d6548332a90b' +
    '46eb927553fb5f32e396636462606062686180488b30fc6794676064047320248304448c09cce1' +
    '67824908a0a86515028ba1a8655500120a20b6800a441c8ffb00', 'hex');
/** 中央目录里 SD 只保留前 4 字节。 */
export const SD_CENTRAL_BODY = Buffer.from('d0000000', 'hex');

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
    }
    return t;
})();

/** @param {Uint8Array} buf @returns {number} */
export function crc32(buf) {
    let c = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
    return (c ^ -1) >>> 0;
}

/** @param {Uint8Array} u8 */
export function isZip(u8) {
    return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
}

/** @param {number} ts @returns {[number, number]} [dosTime, dosDate] */
function dosDateTime(ts) {
    const d = new Date(ts * 1000);
    const year = Math.max(1980, d.getFullYear());
    return [
        ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
        (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
    ];
}

/** UT(0x5455) 扩展时间戳：本地 13 字节，中央 5 字节。 */
function utExtra(ts, central) {
    if (central) {
        const b = Buffer.alloc(9);
        b.writeUInt16LE(0x5455, 0); b.writeUInt16LE(5, 2); b.writeUInt8(0x07, 4); b.writeUInt32LE(ts, 5);
        return b;
    }
    const b = Buffer.alloc(17);
    b.writeUInt16LE(0x5455, 0); b.writeUInt16LE(13, 2); b.writeUInt8(0x07, 4);
    b.writeUInt32LE(ts, 5); b.writeUInt32LE(ts, 9); b.writeUInt32LE(ts, 13);
    return b;
}

function sdExtra(body) {
    const b = Buffer.alloc(4 + body.length);
    SD_ID.copy(b, 0);
    b.writeUInt16LE(body.length, 2);
    body.copy(b, 4);
    return b;
}

/**
 * 按本地头顺序流式解析 ZIP（这样能拿到完整的 104 字节 SD 字段，中央目录里只有 4 字节）。
 * @param {Uint8Array} u8
 * @returns {{entries: {name:string,data:Uint8Array,ts:number,method:number}[], sdLocal:Buffer|null, sdCentral:Buffer|null, comment:Buffer}}
 */
export function readZip(u8) {
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    /** @type {{name:string,data:Uint8Array,ts:number,method:number}[]} */
    const entries = [];
    let sdLocal = null;
    let off = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === SIG_LOCAL) {
        const method = buf.readUInt16LE(off + 8);
        const mtime = buf.readUInt16LE(off + 10);
        const mdate = buf.readUInt16LE(off + 12);
        const csize = buf.readUInt32LE(off + 18);
        const nlen = buf.readUInt16LE(off + 26);
        const elen = buf.readUInt16LE(off + 28);
        const name = buf.toString('utf8', off + 30, off + 30 + nlen);
        const extra = buf.subarray(off + 30 + nlen, off + 30 + nlen + elen);
        const dstart = off + 30 + nlen + elen;
        const blob = buf.subarray(dstart, dstart + csize);

        let ts = Math.floor(Date.UTC(1980 + (mdate >> 9), ((mdate >> 5) & 0xF) - 1, mdate & 0x1F,
            mtime >> 11, (mtime >> 5) & 0x3F, (mtime & 0x1F) * 2) / 1000);
        let p = 0;
        while (p + 4 <= extra.length) {
            const hid = extra.subarray(p, p + 2);
            const hsz = extra.readUInt16LE(p + 2);
            const body = extra.subarray(p + 4, p + 4 + hsz);
            if (hid.equals(SD_ID) && sdLocal === null) sdLocal = Buffer.from(body);
            if (hid.equals(Buffer.from('UT', 'latin1')) && body.length >= 5) ts = body.readUInt32LE(1);
            p += 4 + hsz;
        }
        let data;
        if (method === 0) data = Uint8Array.from(blob);
        else if (method === 8) data = Uint8Array.from(inflateRawSync(blob));
        else throw new Error('不支持的压缩方式 ' + method + '（条目 ' + name + '）');
        entries.push({ name, data, ts, method });
        off = dstart + csize;
    }

    let sdCentral = null;
    let comment = Buffer.alloc(0);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd >= 0) {
        const cdOff = buf.readUInt32LE(eocd + 16);
        const clen = buf.readUInt16LE(eocd + 20);
        comment = Buffer.from(buf.subarray(eocd + 22, eocd + 22 + clen));
        let c = cdOff;
        while (c + 46 <= buf.length && buf.readUInt32LE(c) === SIG_CENTRAL) {
            const nlen = buf.readUInt16LE(c + 28);
            const elen = buf.readUInt16LE(c + 30);
            const cl = buf.readUInt16LE(c + 32);
            const extra = buf.subarray(c + 46 + nlen, c + 46 + nlen + elen);
            let p = 0;
            while (p + 4 <= extra.length) {
                const hid = extra.subarray(p, p + 2);
                const hsz = extra.readUInt16LE(p + 2);
                if (hid.equals(SD_ID) && sdCentral === null) sdCentral = Buffer.from(extra.subarray(p + 4, p + 4 + hsz));
                p += 4 + hsz;
            }
            c += 46 + nlen + elen + cl;
        }
    }
    return { entries, sdLocal, sdCentral, comment };
}

/**
 * 写 ZIP。默认带上搜狗的 SD 字段（原样继承模板）与标准 UT 字段。
 * @param {{name:string,data:Uint8Array,ts?:number}[]} entries
 * @param {{sdLocal?:Buffer|null, sdCentral?:Buffer|null, level?:number, ut?:boolean}} [opts]
 * @returns {Uint8Array}
 */
export function writeZip(entries, opts = {}) {
    const level = opts.level ?? 9;
    const wantUt = opts.ut !== false;
    const sdL = opts.sdLocal === undefined ? SD_LOCAL_BODY : opts.sdLocal;
    const sdC = opts.sdCentral === undefined ? SD_CENTRAL_BODY : opts.sdCentral;
    const now = Math.floor(Date.now() / 1000);

    const local = [];
    const central = [];
    let offset = 0;

    for (const e of entries) {
        const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
        const ts = e.ts ?? now;
        const crc = crc32(data);
        let method = 8;
        let blob = deflateRawSync(data, { level });
        if (blob.length >= data.length) { method = 0; blob = data; }
        const nameBuf = Buffer.from(e.name, 'utf8');
        const [mtime, mdate] = dosDateTime(ts);

        const localExtra = Buffer.concat([
            ...(sdL ? [sdExtra(sdL)] : []),
            ...(wantUt ? [utExtra(ts, false)] : []),
        ]);
        // 原版皮肤对"存储"条目写 version 10 (1.0)、对"压缩"条目写 20 (2.0)。
        // 逐字节对齐能少一个变量 —— 引擎要是对这个挑剔，我们就踩坑了。
        const verNeeded = method === 0 ? 10 : 20;
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(SIG_LOCAL, 0);
        lh.writeUInt16LE(verNeeded, 4);
        lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(method, 8);
        lh.writeUInt16LE(mtime, 10);
        lh.writeUInt16LE(mdate, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(blob.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(localExtra.length, 28);
        local.push(lh, nameBuf, localExtra, blob);

        const centralExtra = Buffer.concat([
            ...(sdC ? [sdExtra(sdC)] : []),
            ...(wantUt ? [utExtra(ts, true)] : []),
        ]);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(SIG_CENTRAL, 0);
        ch.writeUInt16LE(0x0B17, 4);   // version made by: NTFS / 规范 2.3（与原文件一致）
        ch.writeUInt16LE(verNeeded, 6);
        ch.writeUInt16LE(0, 8);
        ch.writeUInt16LE(method, 10);
        ch.writeUInt16LE(mtime, 12);
        ch.writeUInt16LE(mdate, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(blob.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(centralExtra.length, 30);
        ch.writeUInt16LE(0, 32);       // comment length
        ch.writeUInt16LE(0, 34);       // disk
        ch.writeUInt16LE(0, 36);       // internal attrs
        ch.writeUInt32LE(0, 38);       // external attrs
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf, centralExtra);

        offset += lh.length + nameBuf.length + localExtra.length + blob.length;
    }

    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Uint8Array.from(Buffer.concat([...local, cd, eocd]));
}
