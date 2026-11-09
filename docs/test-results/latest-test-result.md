# Latest Test Result

日期：2026-11-09。任务：发布 Turn Beans Phase 26 图片关卡工坊与区域级三档难度。
发布基线：main / 698d8df。用户已明确要求发布本版。

## 发布范围

- turn-beans：独立图片工坊、主体及豆阵识别、保色调色板、手动框选、多色软限制。
- 区域级 2/3/4 色循环，真实引擎回放、碎块质量检查、失败重试、JSON 严格校验与导出。
- 关卡页入口与云端目录读取；保留原有六关、原图和原解法。
- 授权检查反馈、超时和异常提示；publish-config.js.endpoint 仍为空，真实 OAuth/App 未接入。
- 首次发布的四色主体示例升级为区域算法；target、palette 与 id 保持不变。
  旧 phase26.2 样本移作 test-fixtures/phase26.2-level.json，继续验证旧 JSON 兼容。
- service-worker.js 仅更新缓存名 v116→v117 和转豆豆运行资源，124 条预缓存；缓存处理逻辑不变。
- 原始 imageInput 图片留在本地，不加入提交。未修改大厅、象棋或麻将业务代码。

## 本地验证

16 组转豆豆单体共 207 项通过：

| 套件 | 通过数 |
| --- | --- |
| color-processing | 13 |
| bead-grid | 13 |
| subject-extraction | 14 |
| image-processing | 9 |
| level-generator | 15 |
| generator-ui | 23 |
| palette-policy | 10 |
| region-processing | 12 |
| level-library | 13 |
| publisher-client | 10 |
| publisher | 13 |
| publisher-ui | 9 |
| engine | 39 |
| levels（六关及附加轮廓） | 10 |
| auto-fill | 1 |
| save-codec | 3 |

运行对应 node turn-beans/*-tests.js 与 node turn-beans/publisher-tests.mjs。
python scripts/verify.py：VERIFY OK。
附带麻将规则 86 项通过，3 项 UI/设备检查仍为人工项。
工坊和游戏页面的本地 JS/CSS 引用均已加入预缓存，索引 SHA-256 与 UTF-8/LF JSON 内容一致。
发布文本扫描未发现 PAT、GitHub token 或私钥；真实授权信息未配置。
所有 HTTP、OAuth/GitHub、DOM、Worker 验证都用内存替身，仅运行本机单体，不做真实网络/E2E测试。

## 示例验证

四色主体示例，32×32、636 个有效豆：easy/medium/hard 全部通过区域质量与真实引擎回放；
平均错色块为 118.5 / 39 / 19 格，点击为 58 / 88 / 110。target 和四种颜色不变。
原有 engine.js、levels.js 与发布基线哈希一致，Phase 25 棋盘禁用状态颜色修复保留。

## 交付与剩余风险

源代码提交后由仓库已有 pages build and deployment 工作流发布；正式部署结果以该提交的工作流为准。
授权 Worker 与真实 OAuth/App 网关没有部署；不能在网页内登录并上传 GitHub，仍可本地生成和导出。
尚未验收浏览器视觉、移动设备、PWA 实机离线及多设备联调；本次不启动浏览器、Quick Tunnel 或 E2E。
区域优先可能降低换色率，原图碎色或缺乏大连通区时可能明确生成失败。
历史 UI 静态套件 6 组已知基线失败（performance/phase14/phase17/static/timing/visual）
未纳入这 207 项；其旧动画/文案断言没有在本次发布中重写。详见 turn-beans/README-PHASE26.md。
