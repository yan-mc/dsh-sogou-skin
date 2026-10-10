# 示例

## draw-showcase.mjs

**不需要任何素材，clone 下来直接跑：**

```
node examples/draw-showcase.mjs
```

输出到 `examples/out/`：

| 文件 | 内容 |
|---|---|
| `primitives.png` | 绘图原语总览：多段渐变、径向渐变、抗锯齿曲线、外发光、内发光、高斯模糊、颗粒、**沿轮廓勾边** |
| `panel-h.png` | 用代码画一条横排候选窗底图，演示**头 / 中 / 尾三段式**结构 |
| `statusbar.png` | 用代码画一个状态栏底图，演示**中心图案 + 环形按钮位**布局 |

这是 `examples/` 里唯一的示例，因为它**在哪都能跑** —— 不读任何外部文件。

---

## 为什么没有更多示例

这个项目开发过程中写过几十个创作脚本，但它们都读**开发者本机的素材路径**，
clone 下来必然跑不通。与其放一堆跑不了的脚本，不如放一个能跑的。

真正"像设计师一样做皮肤"的完整流程，写在
[`skills/sogou-skin-authoring/SKILL.md`](../skills/sogou-skin-authoring/SKILL.md) 里，
包括每一步该看什么、什么情况下该返工。

## 只想快速看效果？

用 CLI 的一条龙命令，它会用程序化占位素材生成一个完整的、能装的皮肤：

```
node src/cli.js demo ./我的演示皮肤
```
