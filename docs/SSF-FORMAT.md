# 搜狗输入法皮肤 (.ssf) 格式解析 & 开源 DSH 皮肤生成插件可行性报告

> 主样本：`输入法皮肤/雷电将军影宝.ssf`（281,685 B / 53 条目，皮肤编辑器产出的明文 ZIP）
> 对照样本：`D:\备份\安装程序\原神—雷电将军.ssf`（302,440 B / 17 条目，商店分发的加密 v3 容器）
> 标注：✅ 本次实测确证 ｜ 🟡 强推断 ｜ 🌐 来自公开资料/社区（附链接）｜ ❓ 未知

---

## 0. 结论先行

1. **明文 ZIP 代际**（你的文件）：就是一个带私有 extra field 的标准 ZIP，内含 1 个 UTF-16LE 的 `Skin.ini` + 52 张图片。
   本次已用**纯 Python（仅 `zlib`）手写读写器完成逐字节无损往返**，并**自动派生出一款全新配色皮肤**。✅
2. **加密 v3 代际**（商店下载的）：结构为 `"Skin" + u32(3) + AES-256-CBC(硬编码公开密钥) + zlib + 自研文件表`。
   本次**亲自解密成功**，读出 17 个文件与完整 `skin.ini`。✅ 该格式**无签名、无 HMAC**。
3. 因此「做一个开源 DSH 插件快速生成搜狗皮肤」**技术上完全成立**，且：
   - 写明文 ZIP 皮肤 = 已被社区大量实践 ✅
   - **写加密 v3 皮肤 = 全网尚无公开实现**（知名工具 [ssfconv](https://github.com/fkxxyz/ssfconv) 里是 `assert False  # TODO`）——这是本插件最锋利的差异化点
4. 真正的风险**不是技术，是法务与素材版权**（见 §6）。

---

## 1. 容器层：两代格式

### 1.1 代际 A —— 明文 ZIP（皮肤编辑器产出）

| 项 | 实测值 |
|---|---|
| 签名 | `50 4b 03 04`（标准 ZIP） |
| EOCD / 中央目录 | offset 281,663 / 277,811（3,852 B），无归档注释 |
| version made by | `0x0B17` = NTFS(11) / 规范 2.3 |
| 压缩 | 52 条 DEFLATE(8)，`bar.png` STORED(0) |
| 时间 | 2023-09-24 21:05:24 |

搜狗官方文档也直说了这一点 🌐（[skin_use.php](https://pinyin.sogou.com/skins/skin_use.php)）：
> 皮肤文件为 ssf 格式，是采用 zip 压缩格式的文件。你可以把皮肤文件的后缀名 ssf 改成 zip，然后解压出来……再把后缀名 zip 改成 ssf，就是一个完整的皮肤文件了。等同于搜狗输入法皮肤编辑器制作的文件。

**私有 extra field `SD`**：ID 直接写 ASCII 两字节 `53 44`（"SD"，uint16 小端即 `0x4453`），违反 PKWARE 的 `0x8000+` 约定。

```
本地头 : 53 44 | 68 00 | d0 00 00 00 + 100 字节常量          (len=104)
中央目录: 53 44 | 04 00 | d0 00 00 00                        (len=4)
```

- 这 104 字节在**本样本全部 53 个条目上完全相同** ✅ ⇒ 不是逐条目哈希/签名，而是**文件级常量标记**。
- 🌐 社区样本里该 4 字节前缀取值有 `A4 00 00 00`(164，图片) 与 `D0 00 00 00`(208，skin.ini)，语义**未知** ❓（已排除 CRC32 / 压缩前后大小 / 条目数）。
- 🌐 **该字段是可选的**：delisha551 的构建产物零 extra field 也能正常安装。⇒ 生成器可以直接省略它。
- 另带标准 `UT`(0x5455) 时间戳字段（本地 13 B / 中央 5 B），同样可选。

### 1.2 代际 B —— 加密 v3 容器（商店分发）

```
[0:4]  "Skin"                      魔数
[4:8]  uint32 LE = 3               版本
[8:]   AES-256-CBC 密文（无 padding，长度必为 16 的倍数）
       key = 5236461AD38503669045162879033623DDBE6F03FF04E3CAD57FFCA350E49ED9
       iv  = E07AAD35E090AA038A51FD05DF8C5D0F
  解密后[0:4]  uint32 LE = 解压后长度
  解密后[4:]   zlib 流 (0x78DA)
    膨胀后头部: uint32 totalSize; uint32 offsetTableSize
    偏移表:     offsetTableSize/4 个 uint32 绝对偏移
    每个条目:   uint32 nameLen; nameLen 字节 UTF-16LE 文件名; uint32 contentLen; contentLen 字节内容
```

**本次亲自验证结果** ✅：密文长 302,432 = 16×18,902 整除；解出长度 306,113 与头部声明一致；
读出 **17 个条目**与完整 `skin.ini`（UTF-16LE+BOM，3,592 B）。

> 🌐 该密钥至少在 [kimtoy](https://github.com/KDE/kimtoy/blob/master/kssf.cpp)、
> [ssf2fcitx](https://github.com/VOID001/ssf2fcitx)、[ssfconv](https://github.com/fkxxyz/ssfconv)、
> [unSSF](https://github.com/frg2089/unSSF) 四个独立项目中出现，属于"公开的秘密"。
> 🌐 四套实现**全部只是 AES-CBC + zlib**，没有任何 MAC / 认证标签 / 服务端校验 ⇒
> **改过的皮肤重新加密后与官方产物在密码学上无法区分**。

### 1.2b 第 1 代：`Skin.dat` 里的**明文内层**（本机搜狗安装里发现的官方默认皮肤）

本机 **搜狗输入法医生版 1.1.0.1278** 的 `Skin.dat`（108,659 B）就是它自带的默认皮肤，
用的是同一套容器的**第 1 版**：

```
[0:4]  "Skin"           魔数
[4:8]  uint32 LE = 1    版本
[8:]   内层容器【明文：无 AES、无 zlib】
         u32 totalSize; u32 offsetTableSize; 偏移表(绝对偏移);
         每项: u32 名长(BYTES) + UTF-16LE 名 + u32 内容长 + 内容
```

**这直接印证了 v3 的结构**：v3 = 完全相同的内层，外面套 AES-256-CBC + zlib。
本插件用同一个 `buildV3Inner()` 只需去掉加解密就能解开 `Skin.dat` ——
实测解出 **70 个条目**，含一份 **8,964 字节的 `Skin.ini`**（比两个样本皮肤都大得多），
这是目前能拿到的最权威的官方键名参考。

> 附带确认：v3 内层与 v1 内层结构**完全一致** ⇒ 本插件重建 v3 内层时能与官方产物**逐字节相同**，
> 唯一差异在压缩流（搜狗自研 ZipLib 比 zlib 略强：302,428 vs 302,460 B，差 0.01%）。

官方默认皮肤还补齐了两份样本都没出现的**完整按钮词表**（详见 §3.4）。

---

## 2. 条目清单与资源角色

### 代际 A（53 条）

| 类别 | 文件 | 规格 | 用途 |
|---|---|---|---|
| 配置 | `Skin.ini` | 4,424 B，UTF-16LE+BOM，**CRLF** | 唯一的配置文件 |
| 候选窗背景 | `skin1.png` / `skin2.png` | 650×258 / 522×428 RGBA | 横排 / 竖排候选窗底图 |
| 状态条 | `bar.png` | 120×122 RGBA | 状态条底图 |
| 拉伸条 | `skin2_1.bmp` / `skin1_2.bmp` / `skin2_2.bmp` | 28×27 / 6×25 / 5×115 | H2/V2 方案的子区域底图 |
| 状态图标 | 46 张 `*.bmp` | **20×20，24 位未压缩 BMP** | 状态条按钮三态贴图 |

### 代际 B（17 条，对照片段）

`skin.ini`（3,592 B，UTF-16LE+BOM，**纯 LF 无 CR**）、`skin1.png`、`skin1_1.png`、`skin2_1.png`、`skin2_2.png`、`bar.png`、`comp_621868.png`（预览图）、`16337595085241_former.jpg`（方形缩略图），
以及 10 张 `*3.png` 状态图标 + `skinmanager1/3.png`。

> 注意：该皮肤**只提供了"按下态"(*3) 图标**，三态复用同一张图。图标尺寸与格式由皮肤自定义，
> 🌐 实测社区样本有 16×17 / 20×24 / 20×20 / 24×24，**20×20 是现代主流**，PNG 与 BMP 都合法。

### 状态图标命名（命名即语义）

**三态后缀**（由 `skin.ini` 显式声明，非猜测）✅：

```ini
cn_en=cn1.bmp,en1.bmp,a1.bmp        ; 常态   -> 后缀 1
cn_en_hover=cn2.bmp,en2.bmp,a2.bmp  ; 悬停   -> 后缀 2
cn_en_down=cn3.bmp,en3.bmp,a3.bmp   ; 按下   -> 后缀 3
```

| 名称 | 图形 | 按钮 |
|---|---|---|
| `cn` / `en` / `a` | 中 / 英 / A | 中英切换（三元组第三槽用途 ❓**全网无文档**） |
| `quan` / `ban` | ● / ◗ | 全角 / 半角 |
| `cn_biaodian` / `en_biaodian` | 中/英标点 | 标点切换 |
| `quanpin` / `shuanpin` | 全 / 双 | 全拼 / 双拼 |
| `jian` / `fan` | 简 / 繁 | 简繁切换 |
| `key` | 键盘 | 软键盘 |
| `menu` | 扳手 | 菜单 |
| `ie` | 放大镜 | 搜狗搜索 |
| `pass` / `passon` | 灰/蓝人像 | 账号（离线 / 登录） |
| `skinmanager` | — | 皮肤管理器（新样本才有） |

**透明与色键**：BMP 是 24 位**无 alpha**，所以透明只能靠色键——
`[Scheme_*]` 里的 `transparent_color_enable` / `transparent_color`。
本样本那三张拉伸条的**外围 1 像素环全是 `#CBCBCB`(203,203,203)**，即编辑器写入的"透明占位色" 🟡
（旁证：`pass1.bmp` 内残留 2 个孤立 `#CBCBCB` 像素，属编辑遗留）。
现代皮肤索性改用 PNG + alpha 通道绕开这个问题。

---

## 3. `Skin.ini` 逐段语义

7 个段落（`[General] [Display] [Scheme_H1] [Scheme_H2] [Scheme_V1] [Scheme_V2] [StatusBar]`），
缺段合法（引擎有回退）。键名**大小写敏感**，值为 `key=value`。

### 3.1 ⚠️ 颜色是 `0xBBGGRR`（Windows COLORREF），**不是 RGB** ✅ 本次实测确证

判据：用皮肤**自己的美术主导色相**去比对两种读法的色相。

| 样本 | 美术主导色相 | `zhongwen_color` 按 RGB 读 | 按 BGR 读 |
|---|---|---|---|
| A 雷电将军影宝 | **250°**（紫） | 0xcd484e → 357°（红）❌ | 0xcd484e → **243°（蓝紫）**✅ |
| B 原神—雷电将军 | **250°**（紫） | 0xaf5f5f → 0°（红）❌ | 0xaf5f5f → **240°（蓝）**✅ |

两个互相独立的皮肤给出**一致结论**：只有 BGR 读法才与各自的紫色主题协调。
（这也是 Windows 原生约定：`COLORREF` 就是 `0x00BBGGRR`。）
**换算**：`R = v & 0xFF`，`G = (v>>8) & 0xFF`，`B = (v>>16) & 0xFF`。

### 3.2 段落与键

```ini
[General]            ; 元数据
  skin_name / skin_version / skin_author / skin_email / skin_time / skin_info
  ; ↓ 以下 5 个是【搜狗服务器下发的】，皮肤编辑器产物里没有（已由 A/B 对比确证 ✅）
  skin_id / class / class_id / tag / preview_square / preview_comp

[Display]            ; 字体与配色（BGR！）
  font_size=16 / font_ch / font_en
  pinyin_color / zhongwen_first_color / zhongwen_color / comphint_color
  use_gdip / aero / glow / LargeFontSupport

[Scheme_H1] / [Scheme_V1]        ; 1 = 整窗单底图
  pic
  layout_horizontal = mode,left,right     ; mode 0=拉伸 1=平铺 🌐
  layout_vertical   = mode,top,bottom     ; mode 0=拉伸 1=平铺 2=固定 🌐
  pinyin_marge / zhongwen_marge           ; 🟡 四元组，见 §4.2
  separator=color,left,right / transparent_color_enable / transparent_color / opaque
  customN / customN_display / customN_align / custom_cnt
  anchor=100,130                          ; 仅样本A出现，🟡 窗口定位锚点

[Scheme_H2] / [Scheme_V2]        ; 2 = 拼音区/候选区各自贴图
  pinyin_pic / zhongwen_pic
  pinyin_layout_horizontal / pinyin_layout_vertical / pinyin_marge
  zhongwen_layout_horizontal / zhongwen_layout_vertical / zhongwen_marge
  comp_customN / cand_customN / custom_cnt

[StatusBar]
  pic=bar.png
  <按钮>_pos=x,y
  <按钮> / <按钮>_hover / <按钮>_down      ; 三态；逗号分隔多图 = 按输入法状态二选一
  <按钮>_display=1                        ; 是否显示（新样本才有）
```

### 3.3 A / B 样本的键差异（实证）

| 只在 B（商店版）出现 | 只在 A（编辑器版）出现 |
|---|---|
| `skin_id` `class` `class_id` `preview_square` `preview_comp`（服务端注入） | `anchor` |
| `*_display`（按钮显隐） | `fan_jian*` `menu*` `passport*` |
| `skinmanager*` | `quan_shuang*` `softkeyboard*` `sogousearch*` |

⇒ 皮肤工具必须**容忍任意键的缺失**，不能假设某个按钮一定存在。

### 3.4 官方默认皮肤补全的完整词表 ✅

两个第三方样本都没用全引擎能力。本机 `Skin.dat` 里的官方默认皮肤 Skin.ini（8,964 B）补齐了这些：

**状态栏按钮（`_pos` 定位，13 个）**：
`cn_en` `biaodian` `quan_ban` `quan_shuang` `fan_jian` `softkeyboard` `voice` `menu`
`sogousearch` `picface` `passport` `skinmanager` `logo`

> 样本 A 只有 9 个、样本 B 只有 4 个。**`voice`（语音）、`picface`（表情）、`logo`（品牌标识）
> 是两份样本都没有的**。

**候选窗浮层按钮（`_align` 十元组定位，4 类）**：
`pageup`（上一页）`pagedown`（下一页）`sugg`（展开/收起更多候选）`custom0..N`（用户自定义）

**新增键**：`[Display] default_skin`、`[StatusBar] pic_mask`（底图遮罩）、
四个 Scheme 段落的 `layered=1`（分层渲染）、`separator`（拼音区与候选区的分隔线）。

**词表覆盖度实测**：本插件把上述词表做成了 `skin_validate` 的键名校验，
对**官方默认皮肤(154 键) + 样本 A(81 键) + 样本 B(69 键) = 304 个键**全部识别，**未知 0 个** ✅

---

## 4. 布局数字的语义

### 4.1 `layout_horizontal/vertical` = 九宫格**不可拉伸边**（已确证 ✅）

对样本 B 的 `skin1.png`（449×182，`layout_horizontal=0,123,295`，`layout_vertical=0,0,1`）：
按 `left=123 / right=295 / top=0 / bottom=1` 切分后，**可拉伸中心区 x∈[123,154] 在全部 182 行上都是同一个颜色 (194,185,228)** ✅，
且该区间在图上正落在底图纯色段内。可视化见 `preview/guide_B_skin1.png`（红线=左右边界，绿线=上下边界）。

样本 A 的 `0,100,300 / 0,33,11` 数值较松（编辑器画的导引线没贴齐边缘），
中心区含大片透明像素，**不拉伸也看不出问题**——所以实践中**生成器应原样继承模板数字，不要自行推导** 🟡。

### 4.2 `*_marge` 顺序 = `top,bottom,left,right`（✅ 已确证，三个独立皮肤交叉验证）

| 皮肤来源 | pinyin_marge | zhongwen_marge |
|---|---|---|
| **官方默认皮肤**（本机 Skin.dat，8,964 B 的 Skin.ini） | `6,2,12,0` | `4,5,11,0` |
| 样本 A 雷电将军影宝 | `195,4,80,30` | `7,5,100,200` |
| 样本 B 原神—雷电将军 | `104,4,66,40` | `8,5,88,270` |

**判据（反证法）**：第 2 个数字在三个皮肤上恒定很小（2 / 4 / 5），符合"底边距"该有的样子；
第 4 个数字在带立绘的皮肤上很大（200 / 270），正好是给右侧立绘预留的空间。
若按 `left,top,right,bottom` 读，样本 A 会得出 **bottom=200**——在一张 258 像素高的图上，
200 像素的下边距是荒谬的。⇒ **顺序确认为 `top,bottom,left,right`** ✅

### 4.3 其它

`mode` 语义 🌐：horizontal 0=拉伸 1=平铺；vertical 0=拉伸 1=平铺 2=固定。

`separator=颜色,左,右` 与 `*_align`（**10 元组**）在官方默认皮肤里都有真实样例，
两个第三方样本里没有——说明它们是**较新的能力，第三方皮肤普遍没用**：

```ini
separator                 = 0xfbe6db,1,1          ; 拼音区与候选区之间的分隔线
pageup_align              = 0,0,0,48,0,0,0,2,6,2  ; 候选窗内浮层按钮的 10 元组定位
custom0_align             = 1,0,0,1,1,0,0,2,6,1
```

**`layered=1`** 出现在官方默认皮肤的全部四个 Scheme 段落里 —— 面板支持分层渲染。

### 4.4 `*_align` 十元组的逆向（部分解开）🟡→✅

从本机**5 个官方内置皮肤**里抽出 **77 个 `_align` 样本**
（医生版 `Skin.dat`、标准版 `Skin.dat` / `SkinDark` / `TrendySkin` / `TrendySkinDark`），
记十元组为 `a[0..9]`，得到三条**有实证**的结论：

**① `a[2]` / `a[3]` = 按钮中心相对锚点的 `(dx, dy)` 偏移** ✅

两条独立证据：

- **只有该动的那一位在动**：竖排 `Scheme_V1` 里 `pageup` 与 `pagedown` **只有 `a[2]` 不同**、
  `a[3]` 恒为 0；横排 `Scheme_H1` 里**恰好相反**（只有 `a[3]` 不同、`a[2]` 恒为 0）。
  这与"`↑` 在 `↓` 上方（横排，竖直堆叠）/ 左右并排（竖排）"的物理布局完全一致。
- **数值本身就是布局**：三个皮肤的竖排 `a[2]` 之和**恒为 32**
  （医生版 `8+24`、标准版 `7+25`、Trendy `7+25`）——
  即两个按钮**居中排布在一条 32px 宽的带子上**；间距 16 / 18 与各自图标宽度（17 / 14）加间隙吻合。

| 皮肤 | V1 pageup dx | V1 pagedown dx | 间距 | 翻页图标宽 |
|---|---|---|---|---|
| 医生版 | 8 | 24 | 16 | 17 |
| 标准版 | 7 | 25 | 18 | 14 |
| TrendySkin | 7 | 25 | 18 | 14 |

**② `a[7]` / `a[8]` 是布局常量** ✅ —— 三个皮肤完全一致：**横排 `(2,6)`、竖排 `(0,8)`**。

**③ `a[9]` 与方案族相关** ✅ —— `Scheme_*1` → 2，`Scheme_*2` → 0（custom 类浮层例外，恒为 0 或 1）。

**❓ 仍未解**：`a[0]` `a[1]` `a[4]` `a[5]` `a[6]`。样本量够但缺少对照实验（引擎在跑才能验证），
推测其中含锚点选择、垂直方向的另一轴偏移、以及按钮的缩放/边距。

**因此插件的策略是「原样透传」而不是「重新计算」**：
`skin_assign` 接受 `overlays[].align`，把 10 元组**逐字**写进 Skin.ini；
`skin_overlay_presets` 直接提供上述 5 个皮肤里的 15 组官方预设值供挑选。
这比"只读不写"实用得多，也不可能写出引擎看不懂的东西。

---

## 5. 可行性：做一个开源 DSH 皮肤生成插件

### 5.1 DSH 插件契约（从工作区内的 `dsh-normify` 逆推，✅ 实证）

DSH 插件 = 一个 npm 包 + 一份 Cordis patch：

```jsonc
// package.json
{
  "name": "@dsh-external/dsh-sogou-skin",
  "type": "module",
  "main": "./lib/index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.0-rc <5",
    "@deepseek-ai/dsh-tools": ">=0.1.5-rc.2 <0.2.0",
    "@deepseek-ai/dsh-skill": ">=0.1.5-rc.2 <0.2.0"
  }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-sogou-skin
      name: '@dsh-external/dsh-sogou-skin'
      config: {}
```

```ts
export const name    = '@dsh-external/dsh-sogou-skin';
export const inject  = ['tools', 'skills'];
export const Config  = z.object({ /* schemastery */ });
export function apply(ctx: Context, config: Config): void {
    ctx.tools.register({ name, description,
        behavior: 'read' | 'write' | 'destroy' | 'idempotent',
        parameters: <JSON Schema>,
        output: { schema, render },
        execute,
        isConcurrencySafe: () => true });      // 只读工具可并行
    ctx.skills.register({ name, description, content, provider,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: skillDir },
        invocation: { modelInvocable: true, userInvocable: true } });
    ctx.effect(() => disposer, 'label');
}
```

⇒ 插件是**一等公民**：可给模型注册新工具、注入技能、挂 `tools/post-execute` 钩子。

### 5.2 建议的工具面

| 工具 | behavior | 作用 |
|---|---|---|
| `ssf_inspect` | read | 自动识别代际；解析条目表 / skin.ini / 资源清单 / 告警 |
| `ssf_unpack` | write | 解包（含 v3 解密），`skin.ini` 转 UTF-8 便于编辑 |
| `ssf_pack` | write | 打包成 **ZIP 代际**（编辑器可再打开） |
| `ssf_encrypt` | write | 打包成 **v3 加密代际** ← **全网首个公开实现** |
| `ssf_derive` | write | 从模板派生新皮肤（元数据 + 调色板 + 全资源重着色/重绘） |
| `ssf_validate` | read | 缺资源 / 键拼写 / 尺寸位深 / 引用悬空 / 大小上限（< 600 KB）🌐 |
| 技能 `sogou-skin-authoring` | — | 规范 + 工作流，让模型自己会做皮肤 |

**依赖面近似为零**：ZIP 与 v3 容器都只需 `node:zlib` + `node:crypto`（AES-256-CBC 是标准算法，见 §1.2 我用 30 行 JS 就解开了）；
BMP 是无压缩裸位图，PNG 用 `zlib`+CRC32。**无需 Python、无需 native 依赖**。

### 5.3 本次已验证的部分（PoC 实测 ✅）

源码 `src/ssf.py`（纯 `zlib`，手写 ZIP 读写）：

1. **逐字节无损往返**：53 个条目 payload **SHA-256 全部一致**，`Skin.ini` 文本一致，
   `SD` 字段逐字节还原；产物通过 Python `zipfile.testzip()` 与 Windows `bsdtar -tf` **双重独立校验**。
   重打包 281,739 B vs 原 281,685 B（差 54 B 来自 deflate 等级与 UT 时间戳，无语义影响）。
2. **v3 解密读取**：用公开密钥成功解出对照样本的 17 个文件与完整 `skin.ini`。
3. **自动派生新皮肤**：`samples/青玉雷影.ssf`（277,154 B）——
   改写元数据与全部 `*_color`（按 BGR 写入），对 52 张图做**按图内主导色相归一化**的重着色（紫 → 青绿），
   图标仍是合法 20×20/24bpp BMP，ZIP 校验通过。见 `preview/variant2_preview.png`。

### 5.4 生态现状：同类开源项目 🌐

| 项目 | 语言 | ★ | 说明 |
|---|---|---|---|
| [fkxxyz/ssfconv](https://github.com/fkxxyz/ssfconv) | Python | 273 | 事实标准工具；**只读 v3，写加密是 `assert False`** |
| [VOID001/ssf2fcitx](https://github.com/VOID001/ssf2fcitx) | C++ | 138 | 最早实现，致谢 KDE kimtoy |
| [KDE/kimtoy](https://github.com/KDE/kimtoy/blob/master/kssf.cpp) | C++ | — | **最初的逆向工程**（GPL-2.0-or-later） |
| [frg2089/unSSF](https://github.com/frg2089/unSSF) | C# | 4 | ~120 行解包器 |
| [delisha551/sogou-pc-skin-builder-skills](https://github.com/delisha551/sogou-pc-skin-builder-skills) | Python | — | MIT；**最接近本设想**：完整 PC 皮肤构建技能 + 示例工程 + 确定性打包 |
| [sink0216/sogou-skin-maker-skill](https://github.com/sink0216/sogou-skin-maker-skill) | Python | — | MIT；Win/macOS 双端技能，含 `pack_mssf.py` `apng_tool.py` |
| [Remix-Design/Sogou-Input-Skin](https://github.com/Remix-Design/Sogou-Input-Skin) | — | 2049 | 最大的真实皮肤素材集（含 Figma 源） |

**两个关键空白** 🌐：

1. **没有任何*写* v3 加密容器的公开实现**——算法完全已知却无人实现，约 50 行工作量。
2. **npm 与 PyPI 上都没有 .ssf 库**，全是散落在仓库里的 CLI 脚本。
   ⇒ 一个「`@dsh-external/dsh-sogou-skin`」既是填补空白，也天然是**第一个 TypeScript 实现**。

### 5.5 风险清单

| # | 风险 | 级别 | 现状 / 缓解 |
|---|---|---|---|
| 1 | 改过的皮肤被搜狗拒绝 | **低** | ✅ v3 无任何签名/HMAC；🌐 Windows 无白名单门禁，社区手搓 ZIP 皮肤广泛可用。已知摩擦只是**皮肤缓存**（用唯一的 skin_name/version 即可） |
| 2 | 明文 ZIP 代际是否仍被现代客户端接受 | **低** | 🌐 官方文档明示 ZIP 可用；Remix-Design / delisha551 的产物即此格式且被安装 |
| 3 | `SD` 字段语义未知 | **低** | 🌐 已验证可选、可省略；稳妥做法是复制模板原值 |
| 4 | `*_marge` / `anchor` / `custom*` / `*_align` 语义未确证 | 中 | 🟡 生成器**原样继承**模板值，不做重排/推导 |
| 5 | **无法在本机实机验证导入** | **高（流程性）** | ❓ 本机**未安装搜狗输入法**（仅有 kzip/PDF 等其它搜狗产品的注册表残留）。M1 必须在装有搜狗的机器上做一次导入回归 |
| 6 | 版权 / 合规 | **中** | 见 §6 |

### 5.6 路线图

- **M0 ✅ 已完成**：格式双向解析（两代）、无损往返、v3 解密、主题派生 PoC
- **M1**：装搜狗客户端做**导入回归**；收集 5+ 明文样本确认 `SD` 与 `marge` 语义
- **M2**：TS 移植（`node:zlib` + `node:crypto`），落地 `@dsh-external/dsh-sogou-skin` 插件骨架 + 6 个工具
- **M3**：`ssf_encrypt` —— **首个公开的 v3 写出实现**（差异化核心）
- **M4**：`ssf_derive` 升级为**调色板驱动**：给「一张立绘 + 一个主色」→ 出整套皮肤
- **M5**：`sogou-skin-authoring` 技能，让模型自主完成"做皮肤"

---

## 6. 合规（这是真正的风险，不是技术）

🌐 搜狗[皮肤版权说明](https://pinyin.sogou.com/skins/reserve.php)第 5 条：
> 任何人在本网站所下载的作品不得进行转载、传播、出版、发行及其他商业用途。

**推论**：

- 做**生成器**本身不受该条款限制；
- 但**不得随工具分发任何从搜狗商店下载的皮肤**——工具应做到：读用户本地的皮肤、用用户自带的立绘生成；
- 本报告中的皮肤素材（雷电将军 = 米哈游版权，原神—雷电将军 = 官方联动皮肤）**仅作本地格式研究样本**，不随工具分发；
- 社区已形成的通行做法是 **「MIT 代码 / 非 MIT 素材」二分**：代码与文档 MIT，示例美术与打包产物明确排除（参见 delisha551 的 `ASSET_NOTICE.md`）；
- 逆向出的 AES 密钥本身是既成事实（四个公开项目已在使用），**有风险的动作是再分发别人的皮肤**。

建议本插件采用：**MIT 代码 + 0 内置素材 + `ASSET_NOTICE.md` 明确排除示例资产**。

---

## 附录：本次产出

| 路径 | 说明 |
|---|---|
| `README.md` | 本报告 |
| `src/ssf.py` | 纯 zlib 的 .ssf 读写 PoC（可 1:1 移植到 TypeScript） |
| `samples/roundtrip.ssf` | 无损重打包产物（往返验证） |
| `samples/青玉雷影.ssf` | 全自动派生的青绿主题皮肤 |
| `preview/variant2_preview.png` | 派生前后对比（背景 + 状态条 + 图标） |
| `preview/guide_B_skin1.png` | 九宫格导引线验证（红=左右，绿=上下） |
| `preview/icons_sheet.png` | 46 个状态图标的语义对照表 |
| `preview/skin1_on_checker.png` 等 | 三张布局 PNG 的透明通道预览 |
