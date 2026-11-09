# 下一步任务（Next Tasks）

更新日期：2026-11-09

## 1. 当前最高优先级

- [ ] **换机落地**：新电脑 `git pull` / clone → `python scripts/verify.py` → `VERIFY OK`
- [ ] 真机验收普通手机横屏（667×375 / 740×360 / 780×360 / 844×390）：副露同尺寸、暗杠四张、无左右侵入手牌区、选中上浮不裁切
- [ ] 确认 GitHub Pages 已更新到麻将 v0.15.24 / SW `nocturne-games-v117`
- [ ] 新会话开发前先跑通 `python scripts/verify.py`

## 2. 下一阶段任务

- [ ] 麻将：更完整四川番种表 / 封顶选项体验复查
- [ ] 麻将：将 `game.js` 内 AI 迁出到 `ai.js`（保持行为不变）
- [ ] 平台：`shared/` Dialog / Toast API 与麻将事件提示进一步对齐
- [ ] Chess：更深 AI / localhost Debug 场景入口

## 3. 暂缓任务

- [ ] gomoku 子项目骨架
- [ ] 统一跨游戏设置页大改版
- [ ] 删除 `legacy/`（需确认无回滚需求）

## 4. 测试补充任务

- [x] Headless：`mahjong/rule-tests.js` 接入 `scripts/verify.py`
- [x] Smoke：关键路径 + SW precache 落盘检查
- [ ] 自动化截图 / 横屏视觉回归（当前无；需选型且不违反「禁 npm」或改为文档化人工清单）
- [ ] PWA 离线与「添加到主屏幕」清单每次发版勾选（见 `docs/PWA.md`）
- [ ] UI1–UI3（rule-tests blocked）改为可勾选人工清单并链到 test-results

## 5. 技术债

- [ ] `game.js` 体量过大，读写成本高
- [ ] 部分模块 import 带 `?v=`，依赖 strip-query-loader 才能在 Node 下跑
- [ ] README 中 PWA 版本号描述可能滞后于 `service-worker.js` 的 `CACHE`
- [ ] 无 ESLint；靠 Guide + review

## 6. 验收标准（发版前）

- [ ] `python scripts/verify.py` → `VERIFY OK`
- [ ] `mahjong/CHANGELOG.md` 已写本版说明
- [ ] SW `CACHE` 已 bump（若改了预缓存或关键静态资源）
- [ ] `docs/test-results/latest-test-result.md` 已更新
- [ ] 真机或 cloudflared 抽检：大厅 / 象棋 / 麻将可开；麻将核心流程可玩


## 2026-11-09：Phase 26 发布后

- [x] 图片生成、保色、多色软限制、区域级三档及 JSON/关卡库单体验证（207 项）
- [x] PWA 缓存更新到 v117，补齐工坊运行资源；原六关与存档保留
- [x] 授权检查按钮反馈、超时和失败重试；未配置时禁用发布
- [ ] 实现/接入 AUTH OAuth/App 网关、GITHUB 私有绑定及 Secrets 后再启用网页发布
- [ ] 真机检查图片识别/框选、区域预览、移动布局和 PWA 离线
- [ ] 验收跨设备读取已发布目录、缓存更新提示；不把静态网站发布当作 OAuth 后端已上线
