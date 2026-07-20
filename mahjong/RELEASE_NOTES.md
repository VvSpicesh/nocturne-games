# RELEASE NOTES — Nocturne Mahjong

## v0.14.39

**日期**：2026-07-20
**Service Worker 缓存**：`nocturne-games-v44`

### UI
- 新摸牌改为手牌**最右侧** + 间隔；碰杠清除摸牌标记

---

## v0.14.38

**日期**：2026-07-20
**Service Worker 缓存**：`nocturne-games-v43`

### UI
- 新摸牌右置 + 间隔；副露来源箭头；补杠「自摸补杠」；碰后立即显示

---

## v0.14.37

**日期**：2026-07-20
**Service Worker 缓存**：`nocturne-games-v42`

### 语音
- 胡牌结算整句播报（减少碎读）；番型与番数取自现有结算结果，不重算规则

---

## v0.14.36

**日期**：2026-07-20
**Service Worker 缓存**：`nocturne-games-v41`

### 平台
- 统一顶栏工具栏（声音 / 全屏 / 设置入口）；本局规则开关仍在第二行

---

## v0.14.35

**日期**：2026-07-16
**Service Worker 缓存**：`nocturne-games-v40`

### 平台
- 接入共用 Fullscreen 按钮与状态同步；偏好写入统一 settings，但刷新不强制进入全屏

---

## v0.14.34

**日期**：2026-07-16
**Service Worker 缓存**：`nocturne-games-v39`

### 设置
- 麻将规则开关开始接入共享 `shared/settings.js`
- 音频优先读取 `common.soundEnabled` / `common.speechEnabled`，保留旧本地键作兼容 fallback

### 清理
- 删除首页临时「测试语音」调试入口

---

## v0.14.33

**日期**：2026-07-16  
**Service Worker 缓存**：`nocturne-games-v38`

### 语音
- 本地预录报牌（牌名、碰杠胡、胡牌说明片段拼接）；平板无系统 TTS 也可出声

---

## v0.14.32-speech3

**日期**：2026-07-16  
**Service Worker 缓存**：`nocturne-games-v37`

### 语音（Android / 小新平板）
- 无语音包或 speak 挂死时跳过 TTS，恢复发牌速度；骰子 / 发牌 Web Audio 仍可用

---

## v0.14.32-speech2

**日期**：2026-07-16  
**Service Worker 缓存**：`nocturne-games-v36`

### 语音（Android / 小新平板）
- 等待 `getVoices` 后再 speak；去掉有害预热；调试面板二次重试 + `speakPhrase` 对照
- 象棋纳入走子 / 将军 Web Audio

---

## v0.14.32-speech1

**日期**：2026-07-16  
**Service Worker 缓存**：`nocturne-games-v35`

### 临时调试
- 顶栏「测试语音」：排查部分 Android Chrome 无声音（不改正式播音逻辑）

---

## v0.14.32

**日期**：2026-07-16  
**Service Worker 缓存**：`nocturne-games-v34`

### 功能
- 声音播报（打牌 / 碰杠胡），大厅开关
- 查叫 / 未下叫结算；封顶番（花猪与未下叫共用，大厅可选）
- 终局 reveal：每家得分说明 + 最终牌面

### 布局
- 牌桌仍为 v0.14.30 compact-landscape / absolute 方案；v0.16 布局实验仅保留在 `backup/layout-v016-failed`

---

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
| 查叫 | 配置与 `readyHandResults` 占位保留；本 RC **不**处罚未下叫 |
| 基础牌型 | 互斥优先级：清龙七对 → 清七对 → 龙七对 → 暗七对 → 清大对 → 清一色 → 大对子 → 平胡 |
| 根 | 手牌+副露统一统计；同种四张计 1 根，不重复；龙七对根额外加番 |
| 额外番 | 杠上花 / 杠上炮 / 抢杠胡默认 +1；海底 / 绝张默认关（绝张不做简化误判） |
| 计分 | `multiplier = 2^(totalFan-1)`；`baseStake` 默认 1 |
| 自摸加底 | 每家付「胡额 + 1 份底金」；**不**把加底写入 `totalFan` |
| 杠分 | 独立于胡番：暗杠未胡各 2 底；直杠放杠者 2 底；弯杠未胡各 1 底；抢杠成功则该次弯杠不结算 |
| 结算结构 | `roundSettlement`：`huPayments` / `gangPayments` / `flowerPigResults` / `readyHandResults` / `playerDeltas` |

### 自动化规则测试

- 套件：`mahjong/rule-tests.js`（localhost「规则测试」或 `rule-tests-runner.html`）
- 结果：**39 PASS · 0 FAIL · 3 BLOCKED**
- BLOCKED 仅为人工回归项（见下），不表示规则断言失败
- 结算关键断言：各场景 `playerDeltas` / deltas **合计为 0**；自摸加底不进入 `totalFan`

### 人工验收清单（RC → 正式版前）

- [ ] **换三张 / 定缺 / 操作动画**：弹层手牌可见；万条筒牌面可选；碰杠胡大按钮与飘字正常；二次点击出牌与新摸牌抬高正常
- [ ] **四档响应式布局**：手机竖屏、矮横屏紧凑、折叠/平板、PC，四家与手牌不严重重叠
- [ ] **PWA 与 GitHub Pages 离线**：Pages 路径可开；更新条/硬刷新后为新缓存；离线可进入大厅与麻将

### 已知未纳入本 RC

- 完整「查大叫 / 未下叫」赔付（配置保留，不做错误简化听牌判断）
- 可选地区牌型默认关闭（金钩钓 / 带幺等仅识别+配置能力）
- `drizzleMode` 等杠扩展默认关闭

### 建议正式版门槛

上述 3 项人工清单全部勾选，且无回归 Bug，再打正式 release（去掉 RC 标记）。

---

更细的逐版本条目见 [CHANGELOG.md](./CHANGELOG.md)。  
站点级历史见 [../docs/RELEASE_NOTES.md](../docs/RELEASE_NOTES.md)。
