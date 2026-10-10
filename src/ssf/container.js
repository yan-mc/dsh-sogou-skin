// @ts-check
/**
 * 两代 .ssf 容器的读写。
 *
 * 代际 A（皮肤编辑器产出）：标准 ZIP，前缀 PK\x03\x04。
 * 代际 B（商店分发）："Skin" + u32(version) + AES-256-CBC(公开硬编码密钥) + zlib + 自研文件表。
 *   解密后 [0:4] = 解压后长度；[4:] = zlib 流；
 *   膨胀后：u32 totalSize, u32 offsetTableSize, 偏移表(绝对偏移)，每项 u32 nameLen + UTF-16LE 名 + u32 contentLen + 内容。
 * 两个代际都【没有】签名 / HMAC，因此重新打包后的产物在密码学上与原产物不可区分。
 */
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { isZip, readZip, writeZip } from './zip.js';

/** 公开的 v3 容器密钥（在 kimtoy / ssf2fcitx / ssfconv / unSSF 四个开源项目中均可见）。 */
export const V3_KEY = Buffer.from('5236461AD38503669045162879033623DDBE6F03FF04E3CAD57FFCA350E49ED9', 'hex');
export const V3_IV = Buffer.from('E07AAD35E090AA038A51FD05DF8C5D0F', 'hex');
const SKIN_MAGIC = Buffer.from('Skin', 'latin1');

/** @param {Uint8Array} u8 @returns {{generation:'zip'|'skin'|'unknown', version:number|null}} */
export function detectFormat(u8) {
    if (isZip(u8)) return { generation: 'zip', version: null };
    if (u8.length >= 8 && Buffer.from(u8.subarray(0, 4)).equals(SKIN_MAGIC)) {
        const version = Buffer.from(u8.subarray(4, 8)).readUInt32LE(0);
        return { generation: 'skin', version };
    }
    return { generation: 'unknown', version: null };
}

/** @param {Uint8Array} u8 @returns {Uint8Array} */
export function decryptV3(u8) {
    if (u8.length < 9) throw new Error('v3 容器太短');
    const body = Buffer.from(u8.buffer, u8.byteOffset + 8, u8.byteLength - 8);
    if (body.length % 16 !== 0) throw new Error('v3 密文长度不是 16 的倍数（' + body.length + '），可能不是 v3 容器');
    const d = createDecipheriv('aes-256-cbc', V3_KEY, V3_IV);
    d.setAutoPadding(false);
    return Uint8Array.from(Buffer.concat([d.update(body), d.final()]));
}

/**
 * 二分求 zlib 流真实长度（尾部可能有零填充，inflateSync 会容忍）。
 * @param {Buffer} z
 * @returns {number}
 */
export function findZlibEnd(z) {
    try { inflateSync(z); return z.length; } catch { /* 尾部有垃圾，需要缩短 */ }
    let lo = 1;
    let hi = z.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        let ok = false;
        try { inflateSync(z.subarray(0, mid)); ok = true; } catch { ok = false; }
        if (ok) hi = mid; else lo = mid + 1;
    }
    return lo;
}

/**
 * 解析 v3 内层文件表。
 * @param {Uint8Array} plain 解密后的明文
 * @returns {{entries:{name:string,data:Uint8Array}[], declaredSize:number, paddingBytes:number}}
 */
export function parseV3Plain(plain) {
    const pb = Buffer.from(plain.buffer, plain.byteOffset, plain.byteLength);
    const declaredSize = pb.readUInt32LE(0);
    const inflated = inflateSync(pb.subarray(4));
    // 明文 = u32(长度) + zlib 流 + 零填充(对齐 16 字节)。zlib 流长度用二分法确定。
    const paddingBytes = pb.length - 4 - findZlibEnd(pb.subarray(4));
    if (inflated.length !== declaredSize) {
        throw new Error('v3 内层长度不符：头部声明 ' + declaredSize + '，实际 ' + inflated.length);
    }
    const tableSize = inflated.readUInt32LE(4);
    const count = tableSize / 4;
    /** @type {{name:string,data:Uint8Array}[]} */
    const entries = [];
    for (let i = 0; i < count; i++) {
        const o = inflated.readUInt32LE(8 + i * 4);
        const nl = inflated.readUInt32LE(o);
        const name = inflated.toString('utf16le', o + 4, o + 4 + nl);
        const cl = inflated.readUInt32LE(o + 4 + nl);
        const start = o + 4 + nl + 4;
        entries.push({ name, data: Uint8Array.from(inflated.subarray(start, start + cl)) });
    }
    return { entries, declaredSize, paddingBytes };
}

/**
 * 组装 v3 内层（未加密）。
 * @param {{name:string,data:Uint8Array}[]} entries
 * @returns {Uint8Array}
 */
export function buildV3Inner(entries) {
    const parts = [];
    const headerSize = 8 + entries.length * 4;
    let cursor = headerSize;
    const offsets = [];
    for (const e of entries) {
        offsets.push(cursor);
        const nameBuf = Buffer.from(e.name, 'utf16le');
        const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
        cursor += 4 + nameBuf.length + 4 + data.length;
    }
    const head = Buffer.alloc(headerSize);
    head.writeUInt32LE(cursor, 0);
    head.writeUInt32LE(entries.length * 4, 4);
    offsets.forEach((o, i) => head.writeUInt32LE(o, 8 + i * 4));
    parts.push(head);
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const nameBuf = Buffer.from(e.name, 'utf16le');
        const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
        const pre = Buffer.alloc(4);
        pre.writeUInt32LE(nameBuf.length, 0);
        const len = Buffer.alloc(4);
        len.writeUInt32LE(data.length, 0);
        parts.push(pre, nameBuf, len, data);
    }
    return Uint8Array.from(Buffer.concat(parts));
}

/**
 * 加密成 v3 容器。明文 = u32(解压后长度) + zlib(内层)，再零填充到 16 字节倍数。
 * @param {Uint8Array} inner
 * @param {{padding?:number|null}} [opts] padding 为 null 表示不做零填充（仅当长度已对齐时可省）
 * @returns {Uint8Array}
 */
export function encryptV3(inner, opts = {}) {
    const compressed = deflateSync(Buffer.from(inner.buffer, inner.byteOffset, inner.byteLength), { level: 9 });
    const sizeField = Buffer.alloc(4);
    sizeField.writeUInt32LE(inner.length, 0);
    let plain = Buffer.concat([sizeField, compressed]);
    const remain = plain.length % 16;
    if (remain !== 0) {
        const padTo = opts.padding === null ? remain : (opts.padding ?? (16 - remain));
        plain = Buffer.concat([plain, Buffer.alloc(padTo)]);
    }
    if (plain.length % 16 !== 0) throw new Error('v3 明文未能对齐到 16 字节');
    const c = createCipheriv('aes-256-cbc', V3_KEY, V3_IV);
    c.setAutoPadding(false);
    const cipher = Buffer.concat([c.update(plain), c.final()]);
    const head = Buffer.alloc(8);
    SKIN_MAGIC.copy(head, 0);
    head.writeUInt32LE(3, 4);
    return Uint8Array.from(Buffer.concat([head, cipher]));
}

/**
 * 统一读取入口。
 * @param {Uint8Array} u8
 * @returns {{generation:'zip'|'skin'|'unknown', version:number|null, entries:{name:string,data:Uint8Array,ts?:number}[], sd:{local:Buffer|null,central:Buffer|null}|null, paddingBytes?:number}}
 */
export function readSkin(u8) {
    const fmt = detectFormat(u8);
    if (fmt.generation === 'zip') {
        const z = readZip(u8);
        return { generation: 'zip', version: null, entries: z.entries, sd: { local: z.sdLocal, central: z.sdCentral } };
    }
    if (fmt.generation === 'skin') {
        if (fmt.version !== 3) {
            throw new Error('暂不支持 "Skin" v' + fmt.version + ' 容器（本插件支持 v3 与明文 ZIP）');
        }
        const { entries, paddingBytes } = parseV3Plain(decryptV3(u8));
        return { generation: 'skin', version: 3, entries, sd: null, paddingBytes };
    }
    throw new Error('无法识别的文件：既不是 ZIP（PK\\x03\\x04），也不是 "Skin" 容器');
}

/**
 * 统一写出入口。
 * @param {{name:string,data:Uint8Array,ts?:number}[]} entries
 * @param {{format?:'zip'|'v3', sdLocal?:Buffer|null, sdCentral?:Buffer|null, level?:number, ut?:boolean}} [opts]
 * @returns {Uint8Array}
 */
export function writeSkin(entries, opts = {}) {
    const format = opts.format ?? 'zip';
    if (format === 'v3') {
        return encryptV3(buildV3Inner(entries.map((e) => ({ name: e.name, data: e.data }))));
    }
    return writeZip(entries, opts);
}
