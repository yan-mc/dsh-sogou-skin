# dsh-sogou-skin

**DSH 搜狗皮肤工坊** —— 解析、制作、预览、打包、安装搜狗输入法皮肤（`.ssf`）的 DeepSeek Harness 插件。

**零第三方依赖。** PNG / BMP 编解码、ZIP 读写、v3 加密容器、九宫格拉伸、引擎模型渲染器、
位图字体、抗锯齿绘图原语，全部是自己写的纯 JavaScript。

> ⚠️ **本仓库不含任何皮肤素材。** 详见 [ASSET_NOTICE.md](ASSET_NOTICE.md)。
> 插件只做一件事：**把你自己的图片，装配成你自己的皮肤。**

---

## 它解决什么问题

做一个搜狗皮肤本来很麻烦：要凑齐几十张图片、搞懂 `Skin.ini` 里一百多个键的含义、反复打包安装看效果。

这个插件把整件事变成一条可对话的流水线：

```
  皮肤需求清单  →  建工程  →  扫描你的素材  →  分配角色
       ↓
   装配 + 真渲染预览  →  不满意就改  →  打包 .ssf  →  装上
```

**而且它知道自己在说什么。** 引擎的九宫格行为、窗口尺寸、两排文字的位置公式，
全部是从真实皮肤与真机截图里标定出来的，不是猜的。

---

## 功能

### 14 个工具

| 工具 | 作用 |
|---|---|
| `skin_requirements` | 告诉你一个皮肤最少需要哪些素材 |
| `skin_init` | 建工程（生成 `skin.project.json` 与占位素材）|
| `skin_scan_assets` | 扫描你的图片目录，报告尺寸、透明度、主色 |
| `skin_assign` | 把素材分配到各个角色 |
| `skin_assemble` | 装配成皮肤文件树 + `Skin.ini` |
| `skin_preview` | **按引擎模型真渲染**，产出预览图 + 拉伸体检图 + 白底对照图 |
| `skin_repair` | 细节修复（抠图、去边、补角）|
| `skin_pack` | 打包成 `.ssf`（ZIP / v3 加密两种）|
| `skin_inspect` | 查看一个 `.ssf` 的完整结构 |
| `skin_unpack` | 解开 `.ssf` |
| `skin_validate` | 校验（含**九宫格退化探测**）|
| `skin_overlay_presets` | 浮层按钮的 15 组官方对齐预设 |
| `skin_install` | 装到本机搜狗 |
| `skin_list_installed` | 列出本机已装皮肤 |

外加技能 **`sogou-skin-authoring`**：把"像设计师一样做皮肤"的完整流程
（先定配色 → 逐图层 → 每步识图 → 不满意就返工）写成可复用的步骤。

### 自带 CLI

不装 DSH 也能用：

```
node src/cli.js init     <工程目录>
node src/cli.js scan     <素材目录>
node src/cli.js assemble <工程目录>
node src/cli.js preview  <工程目录>
node src/cli.js pack     <工程目录> [-o 输出.ssf]
node src/cli.js inspect  <皮肤.ssf>
node src/cli.js unpack   <皮肤.ssf> -o <目录>
node src/cli.js validate <工程目录>
```

---

## 安装

```
dsh plugin add <本仓库路径>
```

---

## 引擎模型（本项目的核心知识）

这些数字都是从**真实皮肤与真机截图**标定出来的：

### 窗口尺寸
**宽度按内容算，高度 = 底图原始高度，纵向永不缩放。**
真机实测：底图 650x258 → 候选窗 460x259 逻辑像素（DPI 168，缩放 1.75x）。

### 九宫格退化
`left + right > W` 或 `top + bottom > H` 时九宫格不成立，
引擎**只能整图硬缩放** —— 这是"整张底图被压扁拉长"的唯一根因。

### 两排文字的位置
```
拼音行 y = pinyin_marge[0]
候选行 y = pinyin_marge[0] + font_size + zhongwen_marge[0]
```

### 候选条必须贴底
条子下沿不贴图片底边的话，多行候选会掉到桌面上没有背景。

📖 完整格式说明见 [docs/SSF-FORMAT.md](docs/SSF-FORMAT.md)；
引擎模型与设计规律见 **[docs/LESSONS.md](docs/LESSONS.md)**（推荐先读这份）。

---

## 目录结构

```
dsh-sogou-skin/
├── src/
│   ├── index.js          插件入口
│   ├── tools.js          14 个 skin_* 工具
│   ├── cli.js            独立命令行
│   ├── image/            零依赖图像层
│   │   ├── png.js        PNG 编解码（8/16 位、灰度/调色板/RGB/RGBA、Adam7）
│   │   ├── bmp.js        BMP 编解码（含搜狗特有的 20x20 变体）
│   │   ├── raster.js     位图基元（缩放、九宫格、抠图、调色…）
│   │   ├── draw.js       抗锯齿绘图原语（曲线、渐变、模糊、发光、沿轮廓勾边）
│   │   └── font5x7.js    内置点阵字体
│   ├── ssf/              容器格式
│   │   ├── zip.js        手写 ZIP（含搜狗私有 SD 扩展字段）
│   │   ├── container.js  三代容器识别 + v3 AES 解密
│   │   └── ini.js        Skin.ini 解析（UTF-16LE / BGR 颜色）
│   └── skin/             业务层
│       ├── spec.js       键词表、角色定义、官方浮层预设
│       ├── layout.js     九宫格探测与体检
│       ├── assemble.js   装配器
│       ├── preview.js    设计示意图 + 拉伸体检
│       ├── render.js     引擎模型渲染器（真渲染 + 白底对照）
│       ├── probe.js      素材探测
│       └── placeholder.js 程序化占位素材
├── skills/sogou-skin-authoring/SKILL.md
├── examples/             创作脚本示例
├── test/                 14 个测试
└── docs/
    ├── SSF-FORMAT.md     格式解析
    └── LESSONS.md        经验教训
---

## 测试

全部测试**不需要任何外部素材**，在干净 checkout 里可直接运行：

```
node test/image.test.mjs      # 图像层
node test/container.test.mjs  # 容器层（三代格式 + 往返）
node test/keys.test.mjs       # 键词表
node test/vocab.test.mjs      # 词表覆盖
node test/clone.test.mjs      # 克隆保真（逐像素）
node test/bgcheck_test.mjs    # 白底/黑底对照
node test/stretch.mjs         # 九宫格拉伸体检
node test/overlay.mjs         # 浮层预设
node test/install.test.mjs    # 安装路径探测
```

---

## 许可

代码：**MIT**（见 [LICENSE](LICENSE)）。

**素材：本仓库不包含任何素材。** 插件里的"占位素材"都是运行时用代码画出来的几何图形。
详见 [ASSET_NOTICE.md](ASSET_NOTICE.md)。
