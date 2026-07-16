# RELEASE NOTES — Nocturne Mahjong

## v0.14.30

**日期**：2026-07-15  
**Service Worker 缓存**：`nocturne-games-v33`

### 布局
- 普通手机横屏独立 compact-landscape（`orientation:landscape` + `max-height:600px`），五段百分比分区，避免副露/弃牌/中央计数器重叠
- 清理冲突的横屏/矮屏 media query；竖屏与平板断点互斥

### 修复
- 荣耀浏览器等横屏 viewport 高度兼容：`100vh` → `100dvh` → `-webkit-fill-available` fallback
- 补全 `html,body` 的 `height/min-height:100%`

---

## v0.14.28

**日期**：2026-07-15  
**Service Worker 缓存**：`nocturne-games-v31`

### 调整
- 自己副露回到座位盒外侧，紧贴座位上沿线（不再叠入手牌座）
- 上家/下家座位底边与自己座位上沿线齐平；上下间隔对称对家（座位 +6px，副露 +10px）

---

## v0.14.26

**日期**：2026-07-15  
**Service Worker 缓存**：`nocturne-games-v29`

### 调整
- 上家/下家方位文字字号与对家/自己一致
- 默认具体玩家名为空（存档键 `names_v11`）
- 自己副露与手牌分层（v0.14.25）：避免平板/折叠横屏副露被遮挡

规则层仍以 v0.14.24-rc 为准；本版仅为展示与布局修正。

---

## v0.14.24 Release Candidate

**状态**：Release Candidate（RC）  
**日期**：2026-07-15  
**自动验收**：39 PASS / 0 FAIL / 3 BLOCKED（人工 UI）  
**Service Worker 缓存**：`nocturne-games-v28`（以仓库当前 `service-worker.js` 为准）

本 RC 冻结规则与计分生产逻辑：`game.js` / `hu.js` / `score.js` 非人工验收发现的明确 Bug，不再改动规则行为。

---

### 已实现（本 RC 范围）

| 能力 | 说明 |
|------|------|
| 定缺与缺一门 | 换三张后选定缺；缺门未尽只能打缺门；禁碰/杠/胡缺门色；胡牌统一走 `canPlayerWin` |
| 定缺 UI | 弹层展示自己手牌；万/条/筒以牌面样式选择，并显示该花色张数 |
| 花猪 | 终局检测；按 `flowerPigFan` 向其余每位玩家各付一份；流水入 `flowerPigResults` |
| 查叫 | `getReadyHandInfo` + `settleReadyHands`；未下叫按花猪同款付款模型罚 `noReadyFan`；默认不与花猪叠罚 |
| 终局亮牌 | `revealAllHands` + `renderRoundReveal`：四家正面手牌 / 听牌图案 / 结算按钮 |
| 基础牌型 | 互斥优先级：清龙七对 → 清七对 → 龙七对 → 暗七对 → 清大对 → 清一色 → 大对子 → 平胡 |
| 根 | 手牌+副露统一统计；同种四张计 1 根，不重复；龙七对根额外加番 |
| 额外番 | 杠上花 / 杠上炮 / 抢杠胡默认 +1；海底 / 绝张默认关（绝张不做简化误判） |
| 计分 | `multiplier = 2^(totalFan-1)`；`baseStake` 默认 1 |
| 自摸加底 | 每家付「胡额 + 1 份底金」；**不**把加底写入 `totalFan` |
| 杠分 | 独立于胡番：暗杠未胡各 2 底；直杠放杠者 2 底；弯杠未胡各 1 底；抢杠成功则该次弯杠不结算 |
| 结算结构 | `roundSettlement`：`huPayments` / `gangPayments` / `flowerPigResults` / `readyHandResults` / `playerDeltas` |

### 自动化规则测试

- 套件：`mahjong/rule-tests.js`（localhost「规则测试」或 `rule-tests-runner.html`）
- 结果：**47 PASS · 0 FAIL · 3 BLOCKED**（v0.14.31 含查叫套件）
- BLOCKED 仅为人工回归项（见下），不表示规则断言失败
- 结算关键断言：各场景 `playerDeltas` / deltas **合计为 0**；自摸加底不进入 `totalFan`

### 人工验收清单（RC → 正式版前）

- [ ] **换三张 / 定缺 / 操作动画**：弹层手牌可见；万条筒牌面可选；碰杠胡大按钮与飘字正常；二次点击出牌与新摸牌抬高正常
- [ ] **四档响应式布局**：手机竖屏、矮横屏紧凑、折叠/平板、PC，四家与手牌不严重重叠
- [ ] **PWA 与 GitHub Pages 离线**：Pages 路径可开；更新条/硬刷新后为新缓存；离线可进入大厅与麻将

### 已知未纳入本 RC

- 可选地区牌型默认关闭（金钩钓 / 带幺等仅识别+配置能力）
- `drizzleMode` 等杠扩展默认关闭
- 未下叫「只赔已下叫家」等异地市规则变体（当前采用与花猪相同的「向其余每位各付」）

### 建议正式版门槛

上述 3 项人工清单全部勾选，且无回归 Bug，再打正式 release（去掉 RC 标记）。

---

更细的逐版本条目见 [CHANGELOG.md](./CHANGELOG.md)。  
站点级历史见 [../docs/RELEASE_NOTES.md](../docs/RELEASE_NOTES.md)。
