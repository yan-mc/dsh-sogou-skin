// @ts-check
/**
 * 自带的 5x7 点阵字模 —— 用于预览图里的拼音串与按钮标签。
 * 字形直接用 ASCII art 写在代码里（可读、可复核），运行时编译成位图，不依赖任何字体文件。
 * 只有大写字母 / 数字 / 少量符号；小写会自动折叠成大写。
 */
const GLYPHS = {
    'A': [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
    'B': ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
    'C': [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
    'D': ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
    'E': ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
    'F': ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
    'G': [' ####', '#    ', '#    ', '#  ##', '#   #', '#   #', ' ####'],
    'H': ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
    'I': ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
    'J': ['  ###', '   # ', '   # ', '   # ', '#  # ', '#  # ', ' ##  '],
    'K': ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
    'L': ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
    'M': ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
    'N': ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
    'O': [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
    'P': ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
    'Q': [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
    'R': ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
    'S': [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
    'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
    'U': ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
    'V': ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
    'W': ['#   #', '#   #', '#   #', '#   #', '# # #', '## ##', '#   #'],
    'X': ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
    'Y': ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
    'Z': ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
    '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
    '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
    '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
    '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
    '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
    '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
    '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
    '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
    '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
    '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
    '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
    ',': ['     ', '     ', '     ', '     ', ' ##  ', ' ##  ', ' #   '],
    '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
    '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
    ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
    '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
    '?': [' ### ', '#   #', '    #', '   # ', '  #  ', '     ', '  #  '],
    '+': ['     ', '  #  ', '  #  ', '#####', '  #  ', '  #  ', '     '],
    '_': ['     ', '     ', '     ', '     ', '     ', '     ', '#####'],
    ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** 字符间距（点数） */
export const TRACKING = 1;

/** 编译成 Uint8Array：每个字符 5 列，每列低 7 位表示从上到下的行。 */
const COMPILED = (() => {
    /** @type {Record<string, Uint8Array>} */
    const out = {};
    for (const [ch, rows] of Object.entries(GLYPHS)) {
        const cols = new Uint8Array(GLYPH_W);
        for (let x = 0; x < GLYPH_W; x++) {
            let bits = 0;
            for (let y = 0; y < GLYPH_H; y++) if (rows[y][x] === '#') bits |= (1 << y);
            cols[x] = bits;
        }
        out[ch] = cols;
    }
    return out;
})();

/** 无法渲染的字符（例如汉字）用「豆腐块」表示 —— 这是排版界的通行做法，比问号更像"这里有字"。 */
const TOFU = (() => {
    const cols = new Uint8Array(GLYPH_W);
    for (let x = 0; x < GLYPH_W; x++) cols[x] = 0b0111110;
    return cols;
})();

/** @param {string} ch @returns {Uint8Array|undefined} */
export function glyph(ch) {
    const g = COMPILED[ch] || COMPILED[ch.toUpperCase()];
    if (g) return g;
    if (ch === ' ') return COMPILED[' '];
    // 非 ASCII（汉字等）本插件没有字库 -> 豆腐块
    return ch.charCodeAt(0) > 127 ? TOFU : COMPILED['?'];
}

/** @param {string} text @param {number} [scale] @returns {{w:number,h:number}} */
export function measureText(text, scale = 1) {
    return {
        w: text.length * (GLYPH_W + TRACKING) * scale - TRACKING * scale,
        h: GLYPH_H * scale,
    };
}

/**
 * 把文本画进 Raster（就地修改）。不做抗锯齿 —— 预览图里点阵反而更清晰。
 * @param {import('./png.js').Raster} r
 * @param {string} text
 * @param {number} x @param {number} y 左上角
 * @param {[number,number,number,number]} rgba
 * @param {number} [scale]
 * @returns {number} 实际绘制宽度
 */
export function drawText(r, text, x, y, rgba, scale = 1) {
    let cx = x;
    for (const ch of text) {
        const g = glyph(ch);
        if (g) {
            for (let gx = 0; gx < GLYPH_W; gx++) {
                const bits = g[gx];
                if (!bits) continue;
                for (let gy = 0; gy < GLYPH_H; gy++) {
                    if (!(bits & (1 << gy))) continue;
                    for (let sy = 0; sy < scale; sy++) {
                        for (let sx = 0; sx < scale; sx++) {
                            const px = cx + gx * scale + sx;
                            const py = y + gy * scale + sy;
                            if (px < 0 || py < 0 || px >= r.width || py >= r.height) continue;
                            const i = (py * r.width + px) * 4;
                            // source-over
                            const a = rgba[3] / 255;
                            r.data[i] = Math.round(r.data[i] * (1 - a) + rgba[0] * a);
                            r.data[i + 1] = Math.round(r.data[i + 1] * (1 - a) + rgba[1] * a);
                            r.data[i + 2] = Math.round(r.data[i + 2] * (1 - a) + rgba[2] * a);
                            r.data[i + 3] = Math.max(r.data[i + 3], rgba[3]);
                        }
                    }
                }
            }
        }
        cx += (GLYPH_W + TRACKING) * scale;
    }
    return cx - x;
}
