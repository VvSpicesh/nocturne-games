# 转豆豆 Phase 7：图案预览、无方格轮廓、豆子音效

本次基于 Phase 6，只替换 `turn-beans/` 内文件，不修改游戏大厅/PWA。

- 修复开局 1 秒原图、通关正确图空白：此前目标板没有显式 `active`，显示层把 `undefined` 错认成 inactive；现在关卡显式标注有效/无效孔位，渲染层也只在 `active === false` 时隐藏。
- 开局提示改为“开始”，取消覆盖在图片上的遮罩文字；展示 1 秒后自动开始。
- 拼豆全部采用圆形底色孔/豆，不显示方形网格底板；透明区没有豆子也不显示孔位。
- 新增「小猫咪」关卡（第 04 关），耳朵、脸轮廓、眼睛、鼻子可见，内置可实际通关的路径。
- Web Audio 本地合成轻快“啵啵”跳动音，取豆、交换各有不同音高；游戏顶部可关音效（本地记忆）。无音频文件、无广告。
- 保留原有操作、FIFO、动画、缩放、撤销和重玩。

注意：原三个演示关卡的空白外围现在被改为无效/透明孔位，因此旧版该关未完成存档会被自动判为不兼容并重新开局；关卡已完成记录不会被清除。

本地单体测试：

```powershell
cd D:\Github\nocturne-games
node .\turn-beans\engine-tests.js
node .\turn-beans\levels-tests.js
node .\turn-beans\ui-static-tests.js
node .\turn-beans\ui-gesture-tests.js
node .\turn-beans\ui-visual-tests.js
```

手机端仍需自行检查：首次点击后的音效、安卓/苹果音量策略、动画节奏、猫咪轮廓、双指缩放、通关图完整显示。
