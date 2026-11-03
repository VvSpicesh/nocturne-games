# 转豆豆 · Phase 4 网页试玩版

## 安装

将本压缩包中 `turn-beans/` 的文件复制进本地仓库：
`D:\Github\nocturne-games\turn-beans\`。

仅新增/覆盖 `turn-beans/` 内文件，不修改游戏大厅、象棋、麻将和 service worker。

## 本地单体测试（不需要联网或额外依赖）

在仓库根目录执行：

```powershell
node .\turn-beans\engine-tests.js
node .\turn-beans\levels-tests.js
```

预期分别是 `33 tests passed` 和 `4 levels tests passed`。

## 当前功能

- 进入关卡：完整目标图显示 1 秒，然后出现已生成的乱序图
- 盘面点击取豆/自动交换；3 个 20 颗 FIFO 混色备用盘
- 撤销、重开、通关提示、下一关、选关
- 浏览器 localStorage 自动保存，恢复进度；存档异常时安全回到关卡初始态
- 3 个内置可解关卡（测试代码验证真实通关序列）
- 触屏滚动查看大盘面，按钮调整图案尺寸

## 尚未实现

- 图片上传及图片转关卡生成器（下一阶段）
- 首页入口与 PWA 预缓存（最终接入阶段）
- 真实手机交互与布局验收（由用户手机执行）

**注意：** 这是网页静态文件，需要从项目的静态站点或本地 HTTP 服务访问；不要直接以 `file://` 模式作为 PWA 验收方式。没有修改 `../index.html`。
