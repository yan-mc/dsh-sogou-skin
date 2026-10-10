// @ts-check
/**
 * 搜狗皮肤「素材槽位」规格表。
 *
 * 设计要点：这里的 slot 是【角色】而不是文件名 —— 文件名由 Skin.ini 决定，皮肤作者可以随意命名
 * （样本 A 用 skin2_1.bmp，样本 B 用 skin1_1.png 承担同类角色）。因此插件按角色组织素材，
 * 由 assembler 统一分配规范文件名并同步写入 Skin.ini。
 *
 * 全部结论来自对两个真实样本（明文 ZIP 代际 + 商店 v3 代际）的实测，详见 01-格式解析/。
 */

/** 面板类槽位。 */
export const PANEL_SLOTS = [
    {
        slot: 'panel_h', group: '候选窗底图', label: '横排候选窗底图',
        required: true, writableSection: 'Scheme_H1', writableKey: 'pic', defaultFile: 'skin1.png',
        // 横排候选窗只会【变宽】（打字变长），纵向尺寸不变 —— 所以只需要在横向设防
        growAxis: 'h',
        purpose: '横向候选窗的整窗背景。左侧常放可拉伸的纯色条，右侧放立绘/装饰。',
        sizeHint: '宽 400~700，高 40~300；必须带 alpha 通道',
        nineSlice: true,
    },
    {
        slot: 'panel_v', group: '候选窗底图', label: '竖排候选窗底图',
        required: true, writableSection: 'Scheme_V1', writableKey: 'pic', defaultFile: 'skin2.png',
        // 竖排候选窗只会【变高】（候选变多），横向尺寸不变
        growAxis: 'v',
        purpose: '纵向候选窗的整窗背景。通常是竖直长条 + 右下角立绘。',
        sizeHint: '宽 150~550，高 150~500；必须带 alpha 通道',
        nineSlice: true,
    },
    {
        slot: 'bar', group: '状态栏', label: '状态栏底图',
        required: true, writableSection: 'StatusBar', writableKey: 'pic', defaultFile: 'bar.png',
        purpose: '输入法状态栏（中/英、标点、菜单那一排按钮）的背景图/徽记。',
        sizeHint: '宽 100~400，高 20~200；可带 alpha。图标会按 pos 坐标叠在它上面',
        // 实测：三个皮肤（含官方默认皮肤）的 [StatusBar] 段都【没有】 layout_* 键 ——
        // 状态栏底图按原尺寸绘制、不参与九宫格拉伸。所以标 false，也不做拉伸体检。
        nineSlice: false,
    },
    {
        slot: 'bar_mask', group: '状态栏', label: '状态栏遮罩图',
        required: false, writableSection: 'StatusBar', writableKey: 'pic_mask', defaultFile: 'bar_mask.png',
        purpose: '状态栏底图的遮罩（官方默认皮肤用 bar_mask.png）。用于把底图裁成想要的形状。',
        sizeHint: '与状态栏底图同尺寸；灰度或带 alpha 的 PNG',
        nineSlice: false,
    },
    {
        slot: 'strip_h_pinyin', group: '候选窗分体底图', label: '横排-拼音串区底图',
        required: false, writableSection: 'Scheme_H2', writableKey: 'pinyin_pic', defaultFile: 'skin2_1.png',
        purpose: '只有当横排候选窗想「拼音串区」和「候选区」用不同底图时才需要（Scheme_H2）。',
        sizeHint: '很窄的小图即可，例如 28×27；用 1 像素边框标出可拉伸边界',
        nineSlice: true,
    },
    {
        slot: 'strip_h_cand', group: '候选窗分体底图', label: '横排-候选区底图',
        required: false, writableSection: 'Scheme_H2', writableKey: 'zhongwen_pic', defaultFile: 'skin1_2.png',
        purpose: '同上，横排候选区的底图。',
        sizeHint: '很窄的小图即可，例如 6×25',
        nineSlice: true,
    },
    {
        slot: 'strip_v_cand', group: '候选窗分体底图', label: '竖排-候选区底图',
        required: false, writableSection: 'Scheme_V2', writableKey: 'zhongwen_pic', defaultFile: 'skin2_2.png',
        purpose: '竖排候选区的底图（Scheme_V2）。',
        sizeHint: '很窄的小图即可，例如 5×115',
        nineSlice: true,
    },
];

/**
 * 状态栏按钮槽位。
 * variants 里的每个名字都是一张图；Skin.ini 中用逗号连接，表示「按当前输入法状态二选一」。
 */
export const BUTTON_SLOTS = [
    { slot: 'cn_en', group: '状态栏按钮', label: '中/英切换', required: true,
      variants: ['cn', 'en', 'a'], purpose: '中文态 / 英文态 / 第三态（a 槽用途全网无文档，照抄样本即可）' },
    { slot: 'biaodian', group: '状态栏按钮', label: '标点切换', required: false,
      variants: ['cn_biaodian', 'en_biaodian'], purpose: '中文标点 / 英文标点' },
    { slot: 'quan_ban', group: '状态栏按钮', label: '全角/半角', required: false,
      variants: ['quan', 'ban'], purpose: '全角（实心圆）/ 半角（半月）' },
    { slot: 'quan_shuang', group: '状态栏按钮', label: '全拼/双拼', required: false,
      variants: ['quanpin', 'shuanpin'], purpose: '全拼 / 双拼' },
    { slot: 'fan_jian', group: '状态栏按钮', label: '简/繁', required: false,
      variants: ['jian', 'fan'], purpose: '简体 / 繁体' },
    { slot: 'softkeyboard', group: '状态栏按钮', label: '软键盘', required: false,
      variants: ['key'], purpose: '软键盘入口' },
    { slot: 'menu', group: '状态栏按钮', label: '菜单', required: false,
      variants: ['menu'], purpose: '主菜单（扳手/齿轮）' },
    { slot: 'sogousearch', group: '状态栏按钮', label: '搜索', required: false,
      variants: ['ie'], purpose: '搜狗搜索入口（放大镜）' },
    { slot: 'passport', group: '状态栏按钮', label: '账号', required: false,
      variants: ['pass', 'passon'], purpose: '未登录 / 已登录' },
    { slot: 'skinmanager', group: '状态栏按钮', label: '皮肤管理器', required: false,
      variants: ['skinmanager'], purpose: '皮肤管理器入口（新样本才有）' },
    { slot: 'voice', group: '状态栏按钮', label: '语音输入', required: false,
      variants: ['voice'], purpose: '语音输入入口（官方默认皮肤里有，第三方皮肤很少做）' },
    { slot: 'picface', group: '状态栏按钮', label: '表情/图片', required: false,
      variants: ['picface'], purpose: '表情与图片输入入口' },
    { slot: 'logo', group: '状态栏按钮', label: '品牌 Logo', required: false,
      variants: ['logo'], purpose: '状态栏左侧的品牌标识（官方默认皮肤用三态 logo1/2/3）' },
];

/**
 * 覆盖层按钮（overlay）—— 它们不是「状态栏按钮」，而是**画在候选窗内部**的浮层，
 * 因此放在 [Scheme_H1]/[Scheme_V1]/[Scheme_H2]/[Scheme_V2] 里，且用 10 元组的
 * `<名字>_align` 定位而不是 `<名字>_pos=x,y`。
 *
 * 本插件目前**只读不写**：装配时不会生成这些条目，但 `skin_inspect` 会把它们原样展示，
 * 便于用户拿官方皮肤的数值做参考。改写它们需要先逆向 `_align` 十元组的语义。
 */
export const OVERLAY_SLOTS = [
    { slot: 'pageup', scope: 'scheme', variants: ['ov_pageup_on', 'ov_pageup_off'],
      alignExample: 'H1: 0,0,0,48,0,0,0,2,6,2', purpose: '候选翻页-上一页' },
    { slot: 'pagedown', scope: 'scheme', variants: ['ov_pagedown_on', 'ov_pagedown_off'],
      alignExample: 'H1: 0,0,0,32,0,0,0,2,6,2', purpose: '候选翻页-下一页' },
    { slot: 'sugg', scope: 'scheme', variants: ['opensugg', 'closesugg'],
      alignExample: 'H1: 0,0,0,9,0,0,0,2,6,2', purpose: '展开/收起更多候选' },
    { slot: 'custom0', scope: 'scheme', variants: ['ov_custom01'],
      alignExample: 'H1: 1,0,0,1,1,0,0,2,6,1', purpose: '用户自定义浮层按钮（custom0..N）' },
];

/**
 * 官方浮层定位预设 —— 从本机 **5 个内置皮肤**（医生版 Skin.dat、标准版 Skin.dat / SkinDark /
 * TrendySkin / TrendySkinDark）里逐条抽出的 77 个 `*_align` 十元组，去重后的代表值。
 *
 * ## 十元组的部分逆向结论（有实证，但未完全解开）
 *
 * 记 `a[0..9]`：
 *
 * - ✅ **`a[2]` / `a[3]` = 按钮中心的 (dx, dy) 偏移**。
 *   证据一：竖排 V1 里 pageup/pagedown **只有 `a[2]` 不同**、`a[3]` 恒为 0；横排 H1 里**恰好相反**。
 *   证据二：三个皮肤的 V1 中 `a[2]` 之和恒为 32（医生版 8+24、标准版 7+25、Trendy 7+25），
 *   即两个按钮居中排布在一条 32px 宽的带子上；间距 16/18 与各自图标宽度(17/14)+间隙吻合。
 * - ✅ **`a[7]` / `a[8]` 是布局常量**：三个皮肤一致地 横排=(2,6)、竖排=(0,8)。
 * - ✅ **`a[9]` 与方案族相关**：`Scheme_*1` → 2，`Scheme_*2` → 0（custom 类浮层例外）。
 * - ❓ `a[0]` `a[1]` `a[4]` `a[5]` `a[6]` 的确切含义**未解**。
 *
 * ## 因此本插件的策略：原样透传
 *
 * 不猜、不改、不重新计算。用户要么直接选下面的官方预设，要么从任意现成皮肤里抄一组数值。
 * 这比"只读不写"实用得多，也不会写出引擎看不懂的东西。
 */
export const OVERLAY_PRESETS = {
  'H1-pageup-医生版': '0,0,0,48,0,0,0,2,6,2',
  'H1-pagedown-医生版': '0,0,0,32,0,0,0,2,6,2',
  'H1-sugg-医生版': '0,0,0,9,0,0,0,2,6,2',
  'H1-pageup-标准版': '0,0,0,38,0,0,0,2,6,2',
  'H1-pagedown-标准版': '0,0,0,24,0,0,0,2,6,2',
  'H1-custom0-标准版': '1,3,2,2,1,0,0,2,5,0',
  'V1-pageup-医生版': '0,8,8,0,0,2,1,0,8,2',
  'V1-pagedown-医生版': '0,8,24,0,0,2,1,0,8,2',
  'V1-pageup-标准版': '0,8,7,0,0,2,1,0,8,2',
  'V1-pagedown-标准版': '0,8,25,0,0,2,1,0,8,2',
  'V2-cand_pageup-标准版': '0,8,10,0,0,2,1,0,5,0',
  'V2-cand_pagedown-标准版': '0,8,25,0,0,2,1,0,5,0',
  'H2-cand_pageup-标准版': '0,0,0,24,0,0,0,0,6,0',
  'H2-cand_pagedown-标准版': '0,0,14,8,0,0,0,0,6,0',
  '通用-custom0': '1,0,0,1,1,0,0,2,6,1',
};

/** [StatusBar] 里除按钮外还有这几个键（来自官方默认皮肤）。 */
export const STATUSBAR_EXTRA_KEYS = {
    pic_mask: '状态栏底图的遮罩图（官方默认皮肤用 bar_mask.png）',
    flash_cnt: 'Flash 皮肤专用：动画数量',
};

/** 三种交互态：后缀 1/2/3 的含义由 Skin.ini 显式声明（cn_en / cn_en_hover / cn_en_down）。 */
export const STATES = [
    { key: 'normal', suffix: 1, iniSuffix: '', label: '常态' },
    { key: 'hover', suffix: 2, iniSuffix: '_hover', label: '悬停' },
    { key: 'down', suffix: 3, iniSuffix: '_down', label: '按下' },
];

/** 图标默认尺寸（现代主流；引擎允许皮肤自定义，2007 年的老皮肤有 16×17 / 20×24）。 */
export const DEFAULT_ICON_SIZE = { w: 20, h: 20 };

/** 状态栏按钮默认排布（照抄样本 A，单位像素，从 bar.png 左上角起算）。 */
export const DEFAULT_BUTTON_POS = {
    cn_en: [23, 1], quan_ban: [43, 1], biaodian: [63, 1], softkeyboard: [83, 1],
    menu: [100, 1], fan_jian: [102, 1], sogousearch: [126, 1], quan_shuang: [126, 1],
    passport: [100, 1], skinmanager: [100, 4],
    voice: [12, 4], picface: [12, 5], logo: [0, 4],
};

/**
 * 官方键名词表 —— 由**搜狗输入法医生版自带的默认皮肤**（Skin.dat，70 个条目，
 * 内含 8964 字节的 Skin.ini）逐个键提取而来，再与两个真实样本合并。
 * 这是目前能拿到的最权威的键名清单，`skin_validate` 用它来发现拼错的键。
 */
const STATIC_KEYS = {
    General: ['skin_name', 'skin_version', 'skin_author', 'skin_email', 'skin_time', 'skin_info',
        'skin_id', 'class', 'class_id', 'tag', 'preview_square', 'preview_comp'],
    Display: ['font_size', 'font_ch', 'font_en', 'pinyin_color', 'zhongwen_first_color', 'zhongwen_color',
        'comphint_color', 'use_gdip', 'aero', 'glow', 'default_skin', 'LargeFontSupport',
        'ninehint_color', 'clear_edge'],
    Scheme_H1: ['layered', 'pic', 'layout_horizontal', 'layout_vertical', 'separator', 'seperatorui',
        'to_left_right', 'pinyin_marge', 'zhongwen_marge', 'anchor', 'transparent_color_enable',
        'transparent_color', 'click_color', 'click_color_enable', 'opaque', 'custom_cnt', 'widget_cnt'],
    Scheme_V1: ['layered', 'pic', 'layout_horizontal', 'layout_vertical', 'separator', 'seperatorui',
        'to_left_right', 'pinyin_marge', 'zhongwen_marge', 'anchor', 'transparent_color_enable',
        'transparent_color', 'click_color', 'click_color_enable', 'opaque', 'custom_cnt', 'widget_cnt'],
    Scheme_H2: ['layered', 'pinyin_pic', 'zhongwen_pic', 'pinyin_layout_horizontal', 'pinyin_layout_vertical',
        'pinyin_marge', 'zhongwen_layout_horizontal', 'zhongwen_layout_vertical', 'zhongwen_marge',
        'transparent_color_enable', 'transparent_color', 'click_color', 'click_color_enable', 'opaque',
        'comp_custom_cnt', 'cand_custom_cnt', 'widget_cnt'],
    Scheme_V2: ['layered', 'pinyin_pic', 'zhongwen_pic', 'pinyin_layout_horizontal', 'pinyin_layout_vertical',
        'pinyin_marge', 'zhongwen_layout_horizontal', 'zhongwen_layout_vertical', 'zhongwen_marge',
        'transparent_color_enable', 'transparent_color', 'click_color', 'click_color_enable', 'opaque',
        'comp_custom_cnt', 'cand_custom_cnt', 'widget_cnt'],
    StatusBar: ['pic', 'pic_mask', 'pic_preview', 'flash_cnt', 'webpage_url', 'widget_cnt'],
};

/**
 * 搜狗皮肤配置层的类结构 —— 从 UIPlugin.dll 的 RTTI 里直接读出来的（命名空间 SkinConfigFile）。
 * 这解释了 ini 里每个键最终被解析成什么类型：
 *
 *   SkinTypeBase ── 所有配置项的基类
 *   ├─ SkinInt / SkinBool / SkinStr / SkinColor      标量
 *   ├─ SkinPos            → 按钮位置 `_pos=x,y`
 *   ├─ SkinAlign          → 浮层对齐（那个十元组）
 *   ├─ SkinAlignEx        → 对齐的扩展形式
 *   ├─ SkinSeperator      → `separator=颜色,左,右`
 *   ├─ SkinToLeftRight    → `to_left_right`（样本皮肤里从未出现）
 *   ├─ SkinImage / SkinSplit / SkinFlashs            图像相关
 *   ├─ SkinBtn / SkinBtnUi / SkinBtnComponent        按钮
 *   └─ SkinBtnsComponent / SkinBtnsCustom            按钮集合
 *
 * 引擎解析多整数用的格式串是 `%d,%d,%d,%d` 与 `%d,%d,%d,%d,%d,%d`；
 * 三个数的 layout_* 应当是先按逗号切分再逐段转整数。
 */
export const SKIN_CONFIG_CLASSES = [
    'SkinTypeBase', 'SkinInt', 'SkinBool', 'SkinStr', 'SkinColor', 'SkinPos', 'SkinAlign', 'SkinAlignEx',
    'SkinSeperator', 'SkinToLeftRight', 'SkinImage', 'SkinSplit', 'SkinFlashs',
    'SkinBtn', 'SkinBtnUi', 'SkinBtnComponent', 'SkinBtnsComponent', 'SkinBtnsCustom',
];

/** 动态键：状态栏按钮的三态 + 显示开关 + 位置；以及候选窗内的浮层按钮。 */
const DYNAMIC_PATTERNS = [
    /^[a-z0-9_]+_display$/,          // cn_en_display
    /^[a-z0-9_]+_pos$/,              // cn_en_pos=x,y
    /^[a-z0-9_]+_hover$/,            // cn_en_hover
    /^[a-z0-9_]+_down$/,             // cn_en_down
    /^[a-z0-9_]+_align$/,            // pageup_align=十元组
    /^(comp_|cand_)?custom\d+(_display|_align)?$/,   // custom0 / comp_custom0_align
    /^(comp_|cand_)?custom_cnt$/,
    /^(comp_|cand_)?(pageup|pagedown)(_display|_align|_hover|_down)?$/,
    /^sugg(_display|_align|_hover|_down)?$/,
];

/** [StatusBar] 里裸键名就是按钮槽位名，例如 cn_en=cn1.png,en1.png,a1.png */
const BUTTON_NAMES = new Set(BUTTON_SLOTS.map((b) => b.slot));

/**
 * 判断一个键是否在官方词表内。
 * @param {string} section @param {string} key
 * @returns {boolean}
 */
export function isKnownKey(section, key) {
    const statics = STATIC_KEYS[section];
    if (statics && statics.includes(key)) return true;
    if (section === 'StatusBar' && BUTTON_NAMES.has(key)) return true;
    for (const re of DYNAMIC_PATTERNS) if (re.test(key)) return true;
    return false;
}

/** @returns {string[]} 已知段落名 */
export function knownSections() { return Object.keys(STATIC_KEYS); }

/** @returns {string[]} 某个段落的静态已知键 */
export function knownKeysOf(section) { return STATIC_KEYS[section] ? [...STATIC_KEYS[section]] : []; }


/** 插件内置的默认 Skin.ini 骨架（可用占位符替换）。 */
export function defaultSkinIni(meta = {}) {
    const name = meta.name || '我的皮肤';
    const author = meta.author || '匿名';
    const info = meta.info || '用 DSH 搜狗皮肤工坊生成';
    const today = meta.time || new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    return [
        '[General]',
        'skin_name=' + name,
        'skin_version=1.0',
        'skin_author=' + author,
        'skin_email=' + (meta.email || ''),
        'skin_time=' + today,
        'skin_info=' + info,
        '',
        '[Display]',
        'font_size=' + (meta.fontSize ?? 16),
        'font_ch=' + (meta.fontCh || '微软雅黑'),
        'font_en=' + (meta.fontEn || 'Arial'),
        // 注意是 0xBBGGRR（Windows COLORREF），不是 RGB —— 所以 R 在最低字节。
        'pinyin_color=' + (meta.pinyinColor || '0x635f1d'),
        'zhongwen_first_color=' + (meta.firstColor || '0x524a0f'),
        'zhongwen_color=' + (meta.zhongwenColor || '0x746f2a'),
        'comphint_color=' + (meta.compHintColor || '0x408ab0'),
        'use_gdip=1',
        'aero=0',
        'glow=0',
        'LargeFontSupport=1',
        '',
    ].join('\n');
}

/** 默认皮肤工程配置。 */
export function defaultProject(meta = {}) {
    return {
        schema: 1,
        name: meta.name || '我的皮肤',
        author: meta.author || '匿名',
        info: meta.info || '用 DSH 搜狗皮肤工坊生成',
        email: meta.email || '',
        /** 素材目录（相对工程根） */
        assetDir: 'assets',
        /** 产物目录（相对工程根） */
        outDir: 'build',
        /** 角色 -> 素材分配；由 skin_scan_assets 的结果 + AI 决策填入 */
        roles: {},
        /** 状态栏按钮启用列表与坐标 */
        buttons: {
            enabled: ['cn_en'],
            pos: { ...DEFAULT_BUTTON_POS },
        },
        /** 图标规格 */
        icon: { ...DEFAULT_ICON_SIZE, format: 'bmp' },
        /** 三态生成策略：只给一张常态图时，由插件推导悬停/按下 */
        states: {
            hover: { mode: 'lighten', amount: 0.10 },
            down: { mode: 'darken', amount: 0.16 },
        },
        /**
         * 配色（#rrggbb），会换算成 BGR 写进 Skin.ini。
         *
         * 这是一套中性的青玉/暗金，和程序化占位素材的配色一致。
         * 早先默认是紫红系（#9b1562 / #ff00d9），和占位素材的青玉金冲突，
         * 生成出来的预览图看起来像两套设计拼在一起。
         */
        theme: {
            pinyinColor: '#1d5f63',
            firstColor: '#0f4a52',
            zhongwenColor: '#2a6f74',
            compHintColor: '#b08a40',
        },
        /** 九宫格可拉伸边；null = 自动探测 */
        nineSlice: {},
    };
}

/**
 * 最小可用皮肤：只有这些是「不给就做不出来」的。
 * @returns {{slots:string[], summary:string}}
 */
export function minimalRequirements() {
    return {
        slots: ['panel_h', 'panel_v', 'bar', 'cn_en'],
        summary: '最小可用皮肤 = 横排候选窗底图 + 竖排候选窗底图 + 状态栏底图 + 中/英切换图标。' +
            '其余按钮可以逐个追加；不给的按钮不会出现在状态栏上。',
    };
}

/**
 * 把规格表拍平成便于展示/遍历的数组。
 * @returns {{slot:string,group:string,label:string,required:boolean,purpose:string,sizeHint:string,variants:string[]|null}[]}
 */
export function flattenSpec() {
    const out = [];
    for (const p of PANEL_SLOTS) {
        out.push({
            slot: p.slot, group: p.group, label: p.label, required: p.required,
            purpose: p.purpose, sizeHint: p.sizeHint, variants: null,
        });
    }
    for (const b of BUTTON_SLOTS) {
        out.push({
            slot: b.slot, group: b.group, label: b.label, required: b.required,
            purpose: b.purpose,
            sizeHint: '建议每个变体 ' + DEFAULT_ICON_SIZE.w + '×' + DEFAULT_ICON_SIZE.h +
                '；格式 PNG（带透明）或 24 位 BMP（用色键透明）',
            variants: b.variants,
        });
    }
    return out;
}

/**
 * 依据图片的客观特征，猜它最适合哪个槽位。返回按置信度降序的候选，供 AI/用户确认。
 * @param {{width:number,height:number,hasAlpha:boolean,aspect:number}} probe
 * @param {{slot:string,group:string,label:string}[]} [available] 尚未被占用的槽位
 * @returns {{slot:string,confidence:number,reason:string}[]}
 */
export function suggestSlots(probe, available) {
    const cands = (available && available.length ? available : flattenSpec())
        .filter((s) => s.slot !== 'cn_en');
    const out = [];
    const add = (slot, confidence, reason) => {
        if (cands.some((c) => c.slot === slot)) out.push({ slot, confidence, reason });
    };
    const a = probe.aspect;
    if (probe.width >= 300 && a >= 1.8) {
        add('panel_h', 0.9, '宽幅横向长图（' + probe.width + '×' + probe.height + '），像横排候选窗底图');
    }
    if (probe.height >= 150 && a <= 0.9) {
        add('panel_v', 0.85, '竖向长图（' + probe.width + '×' + probe.height + '），像竖排候选窗底图');
    }
    if (probe.width >= 90 && probe.width <= 420 && probe.height >= 18 && probe.height <= 220 && a >= 1.0) {
        add('bar', 0.7, '中小尺寸横向图（' + probe.width + '×' + probe.height + '），像状态栏底图');
    }
    if (probe.width <= 64 && probe.height <= 64 && a >= 0.6 && a <= 1.7) {
        add('cn_en', 0.6, '小方图（' + probe.width + '×' + probe.height + '），像状态栏图标');
    }
    if (probe.width <= 48 && probe.height >= 30) {
        add('strip_h_pinyin', 0.4, '窄长小图，可能是分体底图');
        add('strip_h_cand', 0.4, '窄长小图，可能是分体底图');
        add('strip_v_cand', 0.4, '窄长小图，可能是分体底图');
    }
    return out.sort((x, y) => y.confidence - x.confidence);
}