// @ts-check
/**
 * 布局参数自动推导。
 *
 * 实测得到的语义（详见 01-格式解析/报告）：
 *  - layout_horizontal = mode, left,  right   九宫格「不可拉伸」的左右边宽
 *  - layout_vertical   = mode, top,   bottom  九宫格「不可拉伸」的上下边高
 *  - pinyin_marge / zhongwen_marge = top, bottom, left, right（文字区相对窗体四边的内边距）
 *  - anchor = x, y  窗口锚点
 *
 * 这些数字原本由搜狗皮肤编辑器用「导引线」手工画出来。本模块用「找出底图上最大的一块纯色区域」
 * 来反推导引线，再交给预览图 + 用户/AI 复核。
 */
import { getPixel } from '../image/raster.js';
/**
 * 中间可拉伸区域的「细节密度」：相邻像素差异超过阈值的比例。
 * 越接近 0 说明这块区域越平，横向/纵向拉伸越不会看出破绽。
 * @param {import('../image/png.js').Raster} r
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {'h'|'v'} axis 拉伸方向：'h' 沿水平拉（比较同一行相邻像素），'v' 沿垂直拉
 * @param {number} [tol]
 * @returns {number} 0..1
 */
export function detailDensity(r, x, y, w, h, axis, tol = 14) {
    if (w < 2 || h < 2) return 1;
    let busy = 0;
    let total = 0;
    for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
            const a = getPixel(r, xx, yy);
            const b = axis === 'h' ? getPixel(r, xx + 1, yy) : getPixel(r, xx, yy + 1);
            // 两端都透明的像素对直接【不参与统计】—— 否则大片透明会把"细节密度"稀释掉，
            // 真正有装饰的地方反而测不出来。
            if (a[3] < 8 && b[3] < 8) continue;
            total++;
            if (Math.abs(a[0] - b[0]) > tol || Math.abs(a[1] - b[1]) > tol || Math.abs(a[2] - b[2]) > tol || Math.abs(a[3] - b[3]) > tol) busy++;
        }
    }
    // 全是透明的区域没有"细节"可言
    return total ? busy / total : 0;
}

/**
 * 九宫格配置体检 —— 专门抓「输入长文本时窗体被拉长、边角变形」这一类问题。
 *
 * 出事原理：layout_horizontal = mode,left,right 里的 left/right 是**不可拉伸**的左右边宽。
 * 一旦某一边写成 0，那一侧的装饰（尖角、箭头、圆角）就会落进可拉伸区，被横向拉变形。
 * 本函数把这件事变成可检测的硬指标，而不是靠人盯着预览图看。
 *
 * @param {import('../image/png.js').Raster} r
 * @param {{left:number,right:number,top:number,bottom:number}} ns
 * @param {{busyThreshold?:number}} [opts]
 * @returns {{ok:boolean, issues:{level:'error'|'warn',code:string,msg:string}[], midW:number, midH:number, hDetail:number, vDetail:number}}
 */
export function auditNineSlice(r, ns, opts = {}) {
    // growAxis: 'h' = 只在横向变宽；'v' = 只在纵向变高；undefined = 两轴都查。
    // 只查真正会变化的那根轴 —— 否则会给"永不变化的轴上内缩为 0"报假警。
    const axis = opts.growAxis || 'both';
    const busyThreshold = opts.busyThreshold ?? 0.35;
    const W = r.width;
    const H = r.height;
    const L = Math.max(0, Math.floor(ns.left || 0));
    const R = Math.max(0, Math.floor(ns.right || 0));
    const T = Math.max(0, Math.floor(ns.top || 0));
    const B = Math.max(0, Math.floor(ns.bottom || 0));
    const midW = W - L - R;
    const midH = H - T - B;
    /** @type {{level:'error'|'warn',code:string,msg:string}[]} */
    const issues = [];

    // 小图（分体底图、图标）本来就是整块拉伸的贴片，不该按窗体底图的标准去挑刺
    const isMainPanel = W >= 64 && H >= 48;
    if (!isMainPanel) {
        return { ok: true, issues, skipped: true, midW, midH, hDetail: 0, vDetail: 0 };
    }

    // 退化判定：内缩之和一旦 >= 目标尺寸，九宫格就不成立，引擎会整图缩放
    if (axis !== 'v' && midW <= 2) {
        issues.push({ level: 'error', code: 'no-h-stretch',
            msg: '左右边宽之和 = ' + (L + R) + '，几乎等于图宽 ' + W + '，没有可水平拉伸的中间带 —— 窗体变宽时整图会被硬缩放' });
    }
    if (axis !== 'h' && midH <= 2) {
        issues.push({ level: 'error', code: 'no-v-stretch',
            msg: '上下边高之和 = ' + (T + B) + '，几乎等于图高 ' + H + '，没有可垂直拉伸的中间带' });
    }

    /**
     * 关键判据：某一边宽为 0 时，**只有当那条边附近确实有可见的、有细节的内容**才算问题。
     * 空白/纯色边宽为 0 完全正常 —— 这样才不会到处误报。
     */
    const edgeProblem = (band, side) => {
        const strip = Math.max(4, Math.round((side === 'left' || side === 'right' ? W : H) * 0.12));
        let content = 0;
        let total = 0;
        const x0 = side === 'left' ? 0 : side === 'right' ? W - strip : 0;
        const y0 = side === 'top' ? 0 : side === 'bottom' ? H - strip : 0;
        const w = (side === 'left' || side === 'right') ? strip : W;
        const h = (side === 'top' || side === 'bottom') ? strip : H;
        for (let y = y0; y < y0 + h; y++) {
            for (let x = x0; x < x0 + w; x++) {
                total++;
                if (getPixel(r, x, y)[3] > 16) content++;
            }
        }
        const ratio = total ? content / total : 0;
        if (ratio < 0.05) return null;
        const detail = detailDensity(r, x0, y0, w - 1, h, 'h');
        if (detail < 0.06) return null;   // 有内容但是纯色/渐变，拉伸无害
        return { ratio, detail };
    };

    const checks = [
        ['left', L, '左端'], ['right', R, '右端'], ['top', T, '上端'], ['bottom', B, '下端'],
    ].filter(([side]) => axis === 'both'
        || (axis === 'h' && (side === 'left' || side === 'right'))
        || (axis === 'v' && (side === 'top' || side === 'bottom')));
    for (const [side, value, label] of checks) {
        if (value !== 0) continue;
        const p = edgeProblem(value, side);
        if (!p) continue;
        issues.push({ level: 'warn', code: side + '-zero',
            msg: label + '边宽 = 0，但该侧 12% 区域里有可见且有细节的内容（不透明占比 ' +
                Math.round(p.ratio * 100) + '%，细节密度 ' + Math.round(p.detail * 100) + '%）。' +
                '**输入长文本、候选窗被拉长时，' + label + '的尖角/箭头/圆角会被拉变形** —— ' +
                '把 ' + side + ' 设为该装饰的实际像素宽度（可参考原皮肤 Skin.ini 里作者标定的值）' });
    }

    const hDetail = midW > 2 ? detailDensity(r, L, T, midW - 1, midH, 'h') : 1;
    const vDetail = midH > 2 ? detailDensity(r, L, T, midW, midH - 1, 'v') : 1;
    if (midW > 2 && hDetail > busyThreshold) {
        issues.push({ level: 'warn', code: 'busy-middle',
            msg: '可水平拉伸区里细节偏多（相邻像素差异 ' + Math.round(hDetail * 100) + '%）—— 里面可能混进了图案或装饰，拉长时会被拉变形。建议把 left/right 调大' });
    }
    if (midH > 2 && vDetail > busyThreshold) {
        issues.push({ level: 'warn', code: 'busy-middle-v',
            msg: '可垂直拉伸区里细节偏多（' + Math.round(vDetail * 100) + '%），同上' });
    }

    // 候选词会往条子下方排。底图最底部在【中间 x 范围】若透明，第二行以后的候选就会掉到黑色桌面上。
    // 实测案例：闲云条子 y156..208（底图高 236），底下空 28px，9 个候选里后 4 个落在桌面上。
    if (r && r.data && r.width) {
        const W = r.width, H = r.height;
        const x0 = Math.floor(W * 0.25), x1 = Math.ceil(W * 0.75);
        let opaque = 0, total = 0;
        for (let y = Math.max(0, H - 4); y < H; y++) {
            for (let x = x0; x < x1; x++) { total++; if (r.data[(y * W + x) * 4 + 3] > 40) opaque++; }
        }
        const ratio = total ? opaque / total : 0;
        if (ratio < 0.6) {
            issues.push({ level: 'error', code: 'bar-not-to-bottom',
                // ⚠️ 这条是【启发式提示，不是判定】。
                // 实测反例：复刻-雷电将军的底图最底部也不透明（0%），但它在真机上渲染完全正常 ——
                // 因为它靠 layout_vertical 的 bottom 固定区把条子颜色带下去了。
                // 所以这条只用来"提醒你打开 render.png 看一眼"，**不要因为报了这条就去改一张正常的皮肤**。
                msg: '提示（非判定）：底图最底部在中间区域只有 ' + Math.round(ratio * 100) + '% 不透明。' +
                    '候选词会往条子下方排，若那一片没有背景，第二行以后的候选会掉到桌面上。' +
                    '**已知反例**：复刻-雷电将军同样触发这条，但真机渲染正常（它靠 layout_vertical 的底部固定区兜住了）。' +
                    '所以请打开 render.png 与真机截图确认，**不要仅凭这条就去改一张正常的皮肤**。' });
        }
    }
    return { ok: issues.filter((i) => i.level === 'error').length === 0, issues, skipped: false, midW, midH, hDetail, vDetail };
}

export function findFlatBand(r, opts = {}) {
    const axis = opts.axis || 'h';
    const tol = opts.tol ?? 12;
    const flatRatio = opts.flatRatio ?? 0.75;
    const W = r.width;
    const H = r.height;
    const n = axis === 'h' ? W - 1 : H - 1;
    const span = axis === 'h' ? H : W;
    /** @type {number[]} */
    const flat = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        let same = 0;
        let counted = 0;
        for (let j = 0; j < span; j++) {
            const a = axis === 'h' ? getPixel(r, i, j) : getPixel(r, j, i);
            const b = axis === 'h' ? getPixel(r, i + 1, j) : getPixel(r, j, i + 1);
            // 两端都透明的像素对不参与统计 —— 否则大片透明区会被误判成"平坦带"
            if (a[3] < 8 && b[3] < 8) continue;
            counted++;
            // 一边透明一边不透明 = 明显的边界，不算平
            if (Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol) same++;
        }
        // 分母必须是【真正参与统计的像素对数】，不是整列长度，
        // 否则大片透明区会把平坦度稀释到 0.5 以下，永远找不到平坦带
        flat[i] = counted ? same / counted : 0;
    }
    let bestStart = -1;
    let bestEnd = -1;
    let cur = -1;
    for (let i = 0; i <= n; i++) {
        const ok = i < n && flat[i] >= flatRatio;
        if (ok && cur < 0) cur = i;
        else if (!ok && cur >= 0) {
            if (bestStart < 0 || (i - cur) > (bestEnd - bestStart)) { bestStart = cur; bestEnd = i; }
            cur = -1;
        }
    }
    if (bestStart < 0 || bestEnd - bestStart < 4) return null;
    const score = flat.slice(bestStart, bestEnd).reduce((a, b) => a + b, 0) / (bestEnd - bestStart);
    const span_len = axis === 'h' ? W : H;
    return {
        start: bestStart, end: bestEnd, score,
        left: axis === 'h' ? bestStart : 0,
        right: axis === 'h' ? span_len - bestEnd : 0,
        top: axis === 'v' ? bestStart : 0,
        bottom: axis === 'v' ? span_len - bestEnd : 0,
    };
}


/**
 * 找出图像里最大的一块近似纯色区域（在降采样网格上做，避免逐像素爆开销）。
 * @param {import('../image/png.js').Raster} r
 * @param {{tol?:number, grid?:number}} [opts]
 * @returns {{x:number,y:number,w:number,h:number,color:[number,number,number],coverage:number}|null}
 */
export function detectSolidRegion(r, opts = {}) {
    const tol = opts.tol ?? 12;
    const grid = opts.grid ?? 160;
    const step = Math.max(1, Math.ceil(Math.max(r.width, r.height) / grid));
    /** @type {Map<number, {n:number, minX:number,maxX:number,minY:number,maxY:number}>} */
    const buckets = new Map();
    for (let y = 0; y < r.height; y += step) {
        for (let x = 0; x < r.width; x += step) {
            const [pr, pg, pb, pa] = getPixel(r, x, y);
            if (pa < 200) continue;
            // 量化到 5 位/通道，容忍轻微渐变与噪点
            const key = ((pr >> 3) << 10) | ((pg >> 3) << 5) | (pb >> 3);
            let b = buckets.get(key);
            if (!b) { b = { n: 0, minX: x, maxX: x, minY: y, maxY: y }; buckets.set(key, b); }
            b.n++;
            if (x < b.minX) b.minX = x;
            if (x > b.maxX) b.maxX = x;
            if (y < b.minY) b.minY = y;
            if (y > b.maxY) b.maxY = y;
        }
    }
    let best = null;
    for (const [key, b] of buckets) {
        const area = (b.maxX - b.minX + step) * (b.maxY - b.minY + step);
        // 用「桶内像素数 / 包围盒面积」衡量纯净度，避免选中稀疏但包围盒巨大的颜色
        const density = b.n / Math.max(1, area / (step * step));
        const score = b.n * density;
        if (!best || score > best.score) {
            best = {
                score, n: b.n,
                x: b.minX, y: b.minY,
                w: b.maxX - b.minX + step, h: b.maxY - b.minY + step,
                color: [((key >> 10) & 31) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3],
                coverage: +(b.n / ((r.width / step) * (r.height / step))).toFixed(3),
            };
        }
    }
    if (!best) return null;
    // 按容差把包围盒向外扩一点，吸收抗锯齿边
    return {
        x: Math.max(0, best.x - tol),
        y: Math.max(0, best.y - tol),
        w: Math.min(r.width - Math.max(0, best.x - tol), best.w + tol * 2),
        h: Math.min(r.height - Math.max(0, best.y - tol), best.h + tol * 2),
        color: best.color,
        coverage: best.coverage,
    };
}

/**
 * 由纯色区反推九宫格边界。
 * @param {import('../image/png.js').Raster} r
 * @param {{tol?:number}} [opts]
 * @returns {{left:number,right:number,top:number,bottom:number,confidence:number,note:string}}
 */
export function detectNineSlice(r, opts = {}) {
    const W = r.width;
    const H = r.height;
    const solid = detectSolidRegion(r, opts);
    // ---- 首选：直接找图上「相邻像素一致」的最长连续带 ----
    // 九宫格中段本来就该是一段没有花纹的区域，拉长时把它抻开、其余部分原地不动。
    // 这比"最大纯色块的包围盒"精确得多 —— 后者会把带花纹的区域也算进去，拉长时花纹被抹开。
    // tol 取小值 + flatRatio 取高值 = 只认「真正没有花纹」的带（渐变都不算）。
    // 实测：这样在两个真实样本上稳定收敛，且检测出的 left 与原作者标定值只差约 20px。
    const hb = findFlatBand(r, { axis: 'h', tol: opts.tol ?? 4, flatRatio: opts.flatRatio ?? 0.92 });
    const vb = findFlatBand(r, { axis: 'v', tol: opts.tol ?? 4, flatRatio: opts.flatRatio ?? 0.92 });
    // 拉伸方向决定用哪条带：横排候选窗是【横向】变宽 -> 用水平带定 left/right；
    // 竖排候选窗是【纵向】变高 -> 用垂直带定 top/bottom。搞反了会把立绘区当成可拉伸区。
    const axis = opts.axis || 'h';
    const fb = opts.fallback || {};
    if (axis === 'v') {
        if (vb && vb.end - vb.start >= 6) {
            return {
                left: fb.left ?? 0, right: fb.right ?? 0,
                top: vb.top, bottom: vb.bottom,
                confidence: 0.9,
                note: '纵向拉伸：可拉伸区 y∈[' + vb.start + ',' + vb.end + ')，' +
                    (vb.end - vb.start) + 'px 无花纹',
            };
        }
    } else if (hb && hb.end - hb.start >= 6) {
        return {
            left: hb.left, right: hb.right,
            top: fb.top ?? 0, bottom: fb.bottom ?? 0,
            confidence: 0.9,
            note: '横向拉伸：可拉伸区 x∈[' + hb.start + ',' + hb.end + ')，' +
                (hb.end - hb.start) + 'px 无花纹，拉伸时不会把图案抹开',
        };
    }
    if (!solid) {
        return { left: 0, right: Math.round(W * 0.5), top: 0, bottom: Math.round(H * 0.5), confidence: 0, note: '没有找到不透明纯色区，用了保守默认值' };
    }
    let left = solid.x;
    let right = W - (solid.x + solid.w);
    let top = solid.y;
    let bottom = H - (solid.y + solid.h);
    const note = [];
    // 夹到合理区间：任何一边都不该超过 62%，否则等于整图不可拉伸
    const clamp = (v, total, name) => {
        const max = Math.round(total * 0.62);
        if (v < 0) { note.push(name + ' 为负已归零'); return 0; }
        if (v > max) { note.push(name + ' 超过 62%（' + v + '→' + max + '）'); return max; }
        return v;
    };
    left = clamp(left, W, 'left');
    right = clamp(right, W, 'right');
    top = clamp(top, H, 'top');
    bottom = clamp(bottom, H, 'bottom');
    // 如果左右加起来吃掉了全部宽度，说明没找到真正的拉伸带 —— 退化为「保留右侧美术、左侧可拉伸」
    if (left + right >= W - 4) {
        note.push('左右边界吃满整幅宽度，退化为「左侧可拉伸、右侧保留」');
        left = Math.round(W * 0.25);
        right = Math.round(W * 0.45);
    }
    const confidence = solid.coverage > 0.08 ? 0.8 : 0.45;
    return { left, right, top, bottom, confidence, note: note.join('；') || '由最大纯色区反推' };
}

/**
 * 由纯色区反推文字区内边距（top, bottom, left, right）。
 * @param {import('../image/png.js').Raster} r
 * @param {{artReserveSide?:'left'|'right'|null, pad?:number, tol?:number}} [opts]
 */
export function detectMargins(r, opts = {}) {
    const pad = opts.pad ?? 4;
    const solid = detectSolidRegion(r, opts);
    if (!solid) {
        return { pinyin_marge: [pad, pad, pad, Math.round(r.width * 0.4)], zhongwen_marge: [pad, pad, pad, Math.round(r.width * 0.4)], note: '未找到纯色区，使用保守默认' };
    }
    const top = solid.y + pad;
    const bottom = Math.max(pad, r.height - (solid.y + solid.h) + pad);
    const left = solid.x + pad;
    // 右侧留白给立绘：底图右边缘到纯色区右边缘的距离
    const artReserve = r.width - (solid.x + solid.w);
    const pinyin_marge = [top, bottom, left, Math.max(pad, Math.round(artReserve * 0.15))];
    const zhongwen_marge = [Math.max(pad, solid.y), bottom, left, Math.max(pad, artReserve)];
    return {
        pinyin_marge, zhongwen_marge,
        note: '由纯色区 ' + solid.x + ',' + solid.y + ' ' + solid.w + 'x' + solid.h + ' 反推；请用预览图复核',
    };
}