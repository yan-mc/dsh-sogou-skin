# 测试

**全部测试不需要任何外部素材**，在干净 checkout 里可直接运行：

```
node test/image.test.mjs       # 图像层（PNG/BMP 往返、缩放、九宫格、抠图）
node test/container.test.mjs   # 容器层（三代格式识别 + 往返）
node test/zipdiff.mjs          # ZIP 结构逐项对齐
node test/keys.test.mjs        # 键词表
node test/vocab.test.mjs       # 词表覆盖率
node test/clone.test.mjs       # 克隆保真（与原版逐像素比对）
node test/bgcheck_test.mjs     # 白底/黑底对照
node test/rowmodel.mjs         # 两排文字位置模型
node test/stretch.mjs          # 九宫格拉伸体检
node test/overlay.mjs          # 浮层预设
node test/install.test.mjs     # 安装路径探测
node test/validate_check.mjs   # 校验器
node test/compare_sogou.mjs    # 与官方渲染对比
node test/plugin.smoke.mjs     # 插件加载冒烟

# 或一次跑完：
npm run test:all
```

## 关于"可选样本"

有几个测试里会出现形如 `F:/.../输入法皮肤/00-原始样本/*.ssf` 的路径。
那是**开发时用来标定引擎行为的真实皮肤样本**，**不在本仓库里**（版权原因，见
[../ASSET_NOTICE.md](../ASSET_NOTICE.md)）。

这些测试**在样本缺失时会自动跳过相关断言**，所以 clone 下来照样能跑通 —— CI 里也是这么跑的。

如果你想自己准备样本：把任意合法获得的 `.ssf` 放到对应路径即可，
测试会自动把真实数据纳入比对。样本越全，标定越准。

## 为什么测试这么分散

这里的测试大多不是"写完代码补的测试"，而是**开发过程中用来定位问题的探针**
被固化下来的 —— 比如 `rowmodel.mjs` 是当初为了验证"候选窗到底是几排文字"写的。
它们保留了当时的判据，也就能防止那些问题复发。
