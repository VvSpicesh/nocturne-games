# Nocturne Chess Stable v1.0 — Test Report

日期：2026-07-14  
对照：`docs/CHESS_REQUIREMENTS.md`、`docs/CHESS_AUDIT.md`  
更新：Strict regression pass（仅修确认缺陷，无新功能 / 无重构 / 无改目录）

## 修改文件列表

### Stable v1.0 主体

| 文件 | 变更摘要 |
|------|----------|
| `chess/js/engine.js` | 完整棋规：合法走法、将军/将死/和、易位、过路兵、升变、`applyMove`、`evaluateGameState` |
| `chess/js/storage.js` | versioned 整盘存档、`validate`/`migrate`、损坏降级 |
| `chess/js/ai.js` | 纯函数选步；简单/普通/困难；无 DOM；超时保护 |
| `chess/js/renderer.js` | 主题、吃子、计时、存档状态、升变面板、将军高亮、记谱 |
| `chess/js/game.js` | 统一调用 engine；存档触发；AI 调度；悔棋/新对局；时钟 |
| `chess/index.html` | Stable UI：主题按钮、计时、吃子、升变弹层 |
| `chess/css/board.css` | CSS 变量格色、将军高亮、固定 8×8 |
| `chess/css/themes.css` | blue / wood；黑深白象牙白；朝向 |
| `chess/css/ui.css` | 侧栏、按钮、吃子、弹层、Toast |

### Regression 补丁（本次）

| 文件 | 修复 |
|------|------|
| `chess/js/game.js` | 终局时固化计时；AI 异步回调校验 mode/turn/gameOver；启动失败路径不依赖 Renderer 一定可用 |
| `chess/js/engine.js` | `leavesKingInCheck` 在 `applyMoveRaw` 失败时安全返回 |

未修改：`mahjong/**`、`shared/**`、`legacy/**`、目录结构。

---

## Strict regression 检查结果

| 检查项 | 结果 |
|--------|------|
| 未定义变量（主路径） | PASS |
| 脚本加载顺序 `engine→storage→renderer→ai→game` | PASS |
| 模块接口一致（legal / applyMove / chooseMove） | PASS |
| 存档字段齐全且可 `JSON.stringify` | PASS |
| AI 使用 `getAllLegalMoves`（非伪合法） | PASS |
| 真实走棋仅 `ChessEngine.applyMove` | PASS |
| 终局后 `applyMove` / 点格均不可续走 | PASS |
| 悔棋恢复 `engineState`（含易位/过路兵） | PASS（入口快照还原） |
| CSS 类名 vs renderer（`face-away` / `check` / `dark`） | PASS |
| HTML ID vs JS | PASS（18 个关键 ID） |

### 本次确认并已修复的问题

1. **终局计时回跳**：`gameOver` 后 `getElapsedSeconds` 不再累加会话时间，但进入终局前未把已走时间写入 `elapsedSeconds`，显示会倒退。  
2. **AI 思考中新开局竞态**：`setTimeout` 回来后若已非黑方 AI 回合，仍可能继续 `playMove`。  
3. **启动 catch 二次失败**：若 `ChessRenderer` 未加载，原 catch 再调 `showBootError` 会再抛错。  
4. **`leavesKingInCheck` 空结果**：`applyMoveRaw` 失败时访问 `next.state` 可能异常。

### 检查后确认非问题（不改）

- `pseudoMoves` / `allMoves` 仅作兼容导出；AI / game 主路径不走它们。  
- 升变 modal 在无障碍树中可见但不显示（`hidden`）。  
- resize 触发 persist 符合需求（保存+重布局，不重置棋局）。

---

## 功能完成状态

| 需求域 | 状态 | 说明 |
|--------|------|------|
| 初始局面 / 白先 | Done | `createInitialState` |
| 伪合法 + 合法过滤 | Done | `getPseudoMoves` / `getLegalMoves` / `getAllLegalMoves` |
| isSquareAttacked / findKing / isInCheck | Done | |
| 王车易位 | Done | 权限、空位、途经安全 |
| 吃过路兵 | Done | `enPassantTarget` 仅下一手 |
| 升变 Q/R/B/N | Done | engine 参数 + UI 面板 |
| applyMove 唯一执行入口 | Done | game 仅调用 engine |
| evaluateGameState | Done | playing/check/checkmate/stalemate |
| 终局禁走 | Done | applyMove + UI 拦截 |
| 本地双人 / 人机（白人类黑 AI） | Done | |
| AI 三档且无 DOM | Done | 困难 depth=2 + 时间预算 |
| 整盘存档 version:1 | Done | 走棋/悔棋/翻转/换肤/模式难度/后台事件 |
| 损坏存档降级 | Done | 备份 corrupt key + 新局提示 |
| 主题 blue/wood | Done | `data-theme`，单棋盘 DOM |
| 棋谱 / 吃子 / 计时 / 保存状态 | Done | |
| 悔棋双人一步 / 人机回到玩家前 | Done | 不倒退总计时 |
| 新对局二次确认 | Done | 保留模式/难度/主题，重置其余 |
| resize 不重置棋局 | Done | 只 persist + re-render |

---

## 测试步骤与结果

环境：本地 `python -m http.server 8080` + Chromium CDP。

### 基线回归（Stable 初验）

| # | 用例 | 结果 |
|---|------|------|
| 1 | e2-e4 后黑方有合法走法 | PASS |
| 2 | 王不能走入被攻击格 | PASS |
| 3 | 被将军时所有合法步解除将军 | PASS |
| 4 | 王车易位后王 g1、车 f1、权限清除 | PASS |
| 5 | 吃过路兵后被吃兵消失 | PASS |
| 6 | 底线升变可选后/车/象/马 | PASS |
| 7 | storage 保存/读取 theme、flipped、局面 | PASS |
| 8 | 损坏 localStorage 不抛死，返回 corrupt | PASS |
| 9 | 损坏后重新打开页面显示正常新棋盘 | PASS |
| 10 | AI easy/hard 返回合法步 | PASS |
| 11 | AI 不访问 document | PASS |
| 12 | 64 格宽高一致 | PASS |
| 13 | 将死 → checkmate 且 applyMove 拒绝 | PASS |

### Strict regression 复测（补丁后）

| # | 用例 | 结果 |
|---|------|------|
| R1 | 18 HTML ID 均存在 | PASS |
| R2 | CSS `face-away` / `.check` 存在 | PASS |
| R3 | 存档字段全量 + moveHistory 可序列化往返 | PASS |
| R4 | 主题切换 blue↔wood | PASS |
| R5 | 将死局面禁止再走 | PASS |
| R6 | 补丁代码已由本地与 HTTP 同源文件提供 | PASS |

---

## 尚未完成项目

相对产品化远期项（**不阻塞 Stable v1.0**）：

1. 完整 SAN / PGN 导出  
2. 三次重复 / 五十回合和棋  
3. 困难 AI 更深搜索、开局库  
4. 固定仓内自动化测试脚本文件（当前为 CDP 即时回归）

---

## 最终剩余风险

1. **困难 AI**：depth=2 + ~480ms 预算，中局可能早停，强度有限但不卡死。  
2. **存档体积**：`moveHistory` 含完整 `engineState` 快照，长对局 localStorage 变大；极端情况可能触发配额（浏览器差异）。  
3. **resize/orientation 频繁 persist**：符合需求，但可能造成高频写盘/状态栏「已保存」刷新。  
4. **新对局使用 `window.confirm`**：可用；与升变面板不同（升变不用 prompt）。  
5. **旧键 `ng-chess-mode-v023`** 不再迁移：仅丢失旧版偏好，不影响 Stable 存档键。  
6. **人机模式下升变**：仅白方人类升变；黑方 AI 升变由 AI 返回的 `promotion` 字段决定（合法集内自带），无 UI。

---

## 结论

Strict regression 已完成：**发现并修复 4 处确认缺陷**，其余清单项通过。  
**Stable v1.0 基线维持**；无目录改动、无 mahjong/shared/legacy 改动、无新功能扩张。
