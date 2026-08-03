# 决策记录（Decisions）

> 聊天记录不作准。新决策请追加到本文件并提交 Git。

## 已确定的产品决策

### 2026-07 — 四川麻将：血战到底家庭大字版
- **决策**：以家庭向大字 UI + 血战规则为主线迭代。
- **原因**：目标用户含老人模式；平台定位休闲可玩。
- **影响**：`mahjong/*` 规则与 UI 优先级高于竞技向复杂度。

### 2026-07 — 事件提示统一为座位旁 toast
- **决策**：碰/杠/胡/出牌统一 `showPlayerEvent`；去掉中央 WinNotice。
- **原因**：减少双系统维护；横屏信息密度更好。
- **影响**：`render.js` / `game.js` / `style.css`。

### 2026-07-23 — 暗杠展示为单层四张「背·明·明·背」
- **决策**：取消「四底+二顶」叠层 DOM。
- **原因**：叠层在横屏易被看成 5 张或错位。
- **影响**：`meld-view.js`、相关 rule-tests MV3。

## 已确定的技术决策

### 长期 — 纯静态 ES Module + GitHub Pages + 自研 SW
- **决策**：不引入 React/Vue/TS/npm/Workbox。
- **原因**：可维护、直开、PWA 可控。
- **影响**：全仓库；禁止新增 npm 业务依赖。

### 2026-07-23 — 用 Python verify + 可选 Node 跑规则单测
- **决策**：统一入口 `python scripts/verify.py`；不设 `package.json` scripts。
- **原因**：Guide 禁止 npm；Python 已用于本地 `http.server`。
- **影响**：`scripts/verify.py`、交接文档、Cursor workflow 规则。

### 长期 — Service Worker 唯一根目录文件
- **决策**：`shared/pwa.js` 以 `new URL("../service-worker.js", import.meta.url)` 注册；改预缓存 bump `nocturne-games-vN`。
- **原因**：避免多 SW / 路径错误。
- **影响**：任何预缓存变更流程。

## 不再采用的方案

| 日期 | 方案 | 原因 |
|---|---|---|
| 历史 | 外部麻将规则库 | 可控性与体积 |
| 历史 | Workbox / 外部 PWA 库 | Guide 禁止；自研 SW 足够 |
| 2026-07 | 暗杠四底二顶叠层 | 视觉误判为多牌/错位 |
| 2026-07 | compact 下按座位单独 `--meld-zone-tile-scale` | 左右副露尺寸不一致 |

## 重要约束

- 不碰 SW activate 时的 localStorage
- Debug 场景仅 localhost
- 大改（约 300+ 行 / 数据结构 / 新模块）先方案后编码
- 可读性 > 可维护性 > 扩展性 > 功能数量

## 需要以后复查的决策

- [ ] compact-landscape 分区百分比是否需按更多机型微调（`--top-zone-height` 等）
- [ ] 是否引入无依赖的轻量 E2E（仍避免 npm 的话可选 Playwright 系统安装版，或维持人工）
- [ ] `game.js` 拆分 `ai.js` 的时机与边界

---

### 2026-08-03 — 换机以 Git docs + verify 为准
- **决策**：换电脑不依赖聊天记录；先读 `docs/00_project_handoff.md` 再 `python scripts/verify.py`。
- **原因**：跨设备 / 跨会话连续性。
- **影响**：新会话启动流程、README「换电脑继续开发」。
