// @ts-check
/**
 * Skin.ini 解析 / 序列化。
 * 实测事实：
 *  - 编码 UTF-16LE + BOM(FF FE)；皮肤编辑器产物用 CRLF，商店产物用纯 LF —— 两者引擎都接受。
 *  - 键名大小写敏感；段落缺失合法（引擎有回退）。
 *  - 颜色是 0xBBGGRR（Windows COLORREF），不是 RGB。
 */

/** 解码为 JS 字符串，自动识别 BOM 与常见编码。 @param {Uint8Array} u8 */
export function decodeIni(u8) {
    const b = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le', 2);
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
        const swapped = Buffer.from(b.subarray(2));
        swapped.swap16();
        return swapped.toString('utf16le');
    }
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return b.toString('utf8', 3);
    return b.toString('utf8');
}

/** 编码为 UTF-16LE + BOM。 @param {string} text @param {{crlf?:boolean}} [opts] */
export function encodeIni(text, opts = {}) {
    let t = text.replace(/\r\n/g, '\n');
    if (opts.crlf !== false) t = t.replace(/\n/g, '\r\n');
    const body = Buffer.from(t, 'utf16le');
    const out = Buffer.alloc(2 + body.length);
    out[0] = 0xFF; out[1] = 0xFE; body.copy(out, 2);
    return Uint8Array.from(out);
}

/**
 * 保留原始行序与注释的 ini 文档模型。
 */
export class IniDoc {
    /** @param {string} [text] */
    constructor(text = '') {
        /** @type {{kind:'section'|'kv'|'raw', section?:string, key?:string, value?:string, text?:string}[]} */
        this.lines = [];
        this._index = new Map();
        if (text) this.parse(text);
    }
    /** @param {string} text */
    parse(text) {
        this.lines = []; this._index = new Map();
        let section = '';
        for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
            const line = raw.trim();
            if (line.startsWith('[') && line.endsWith(']')) {
                section = line.slice(1, -1);
                if (!this._index.has(section)) this._index.set(section, new Map());
                this.lines.push({ kind: 'section', section });
            } else if (line && !line.startsWith(';') && !line.startsWith('#') && line.includes('=')) {
                const eq = line.indexOf('=');
                const key = line.slice(0, eq).trim();
                const value = line.slice(eq + 1).trim();
                if (!this._index.has(section)) this._index.set(section, new Map());
                this._index.get(section).set(key, value);
                this.lines.push({ kind: 'kv', section, key, value });
            } else {
                this.lines.push({ kind: 'raw', text: raw });
            }
        }
        return this;
    }
    /** @param {string} section @param {string} key @returns {string|undefined} */
    get(section, key) { return this._index.get(section)?.get(key); }
    /** @param {string} section @returns {Record<string,string>} */
    section(section) {
        /** @type {Record<string,string>} */
        const out = {};
        const m = this._index.get(section);
        if (m) for (const [k, v] of m) out[k] = v;
        return out;
    }
    /** @returns {string[]} */
    sections() { return [...this._index.keys()].filter(Boolean); }
    /**
     * 设置键值；键/段落不存在则追加（段落追加到文件末尾）。
     * @param {string} section @param {string} key @param {string|number} value
     */
    set(section, key, value) {
        const v = String(value);
        let m = this._index.get(section);
        if (!m) {
            m = new Map(); this._index.set(section, m);
            this.lines.push({ kind: 'section', section });
            this.lines.push({ kind: 'kv', section, key, value: v });
            m.set(key, v);
            return this;
        }
        if (m.has(key)) {
            m.set(key, v);
            for (const l of this.lines) if (l.kind === 'kv' && l.section === section && l.key === key) { l.value = v; break; }
            return this;
        }
        m.set(key, v);
        // 插到该段落最后一个 kv 之后，保持成块
        let insertAt = -1;
        for (let i = 0; i < this.lines.length; i++) {
            const l = this.lines[i];
            if (l.kind === 'kv' && l.section === section) insertAt = i;
        }
        const node = { kind: 'kv', section, key, value: v };
        if (insertAt >= 0) this.lines.splice(insertAt + 1, 0, node);
        else this.lines.push(node);
        return this;
    }
    /** @param {string} section @param {string} key */
    remove(section, key) {
        this._index.get(section)?.delete(key);
        this.lines = this.lines.filter((l) => !(l.kind === 'kv' && l.section === section && l.key === key));
        return this;
    }
    /** @param {string} section */
    removeSection(section) {
        this._index.delete(section);
        this.lines = this.lines.filter((l) => l.section !== section);
        return this;
    }
    toString() {
        const out = [];
        for (const l of this.lines) {
            if (l.kind === 'section') out.push('[' + l.section + ']');
            else if (l.kind === 'kv') out.push(l.key + '=' + l.value);
            else out.push(l.text ?? '');
        }
        while (out.length && out[out.length - 1] === '') out.pop();
        return out.join('\n') + '\n';
    }
}

/** BGR(0xBBGGRR) -> {r,g,b} @param {number} v */
export function bgrToRgb(v) {
    return { r: v & 0xFF, g: (v >> 8) & 0xFF, b: (v >> 16) & 0xFF };
}
/** {r,g,b} -> BGR(0xBBGGRR) @param {{r:number,g:number,b:number}} c */
export function rgbToBgr(c) {
    return (((c.b & 0xFF) << 16) | ((c.g & 0xFF) << 8) | (c.r & 0xFF)) >>> 0;
}
/** \'#rrggbb\' -> BGR 数值 @param {string} hex */
export function hexToBgr(hex) {
    const h = hex.replace('#', '').trim();
    return rgbToBgr({
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    });
}
/** BGR 数值 -> \'#rrggbb\' @param {number} v */
export function bgrToHex(v) {
    const { r, g, b } = bgrToRgb(v);
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
/** 解析 ini 里的 0xNNNNNN / 十进制 @param {string|undefined} s */
export function parseIniNumber(s) {
    if (s === undefined) return undefined;
    const t = s.trim();
    if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
}
