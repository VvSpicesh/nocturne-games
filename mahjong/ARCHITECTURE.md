# Nocturne Mahjong — Architecture

四川麻将（血战到底）前端模块。原生 HTML / CSS / ES Module，GitHub Pages 直开即用。

## 文件职责

### `index.html`
入口页面：牌桌 DOM、规则开关、换三张 / 定缺 / 胡牌 / 终局弹窗、缓存版本号 `?v=`。

### `style.css`
布局与视觉（本轮规则改造不改牌尺寸与响应式断点）。

### `game.js`
负责：
- 阶段机：大厅 → 开局掷骰发牌 →（换三张）→ **定缺** → 摸打 → 血战 → 终局
- 定缺守卫（出牌 / 碰杠 / 胡）、AI 仅强制打缺门
- 调用 `score.js` 即时结算；终局调用花猪结算
- localhost：规则断言套件 + 碰杠场景

### `render.js`
DOM、定缺弹窗、非法出牌样式、胡牌/终局明细（含花猪）。

### `tiles.js`
牌名与 SVG 牌面（**本轮禁止修改**）。

### `rules-guard.js`
定缺 / 合法出牌 / 碰杠花色 / 花猪检测 / `emptyRoundSettlement`。

### `hu.js`
- 统一入口 `canPlayerWin`（含缺门）
- `getWinInfo`：互斥基础牌型、根、额外番、`multiplier = 2^(totalFan-1)`
- 可选牌型识别（默认关）：金钩钓 / 带幺 / 清带幺 / 将对

### `score.js`
- `baseStake` × 倍数；自摸再 +1 份底金（非 +1 番）
- 杠分独立流水；花猪独立流水（向其余每位各付）
- `roundSettlement`：`huPayments` / `gangPayments` / `flowerPigResults` / `readyHandResults`（查叫占位，本轮不处罚）

### `rule-tests.js`
固定手牌 / 分值断言（localhost「规则测试」按钮）。

### `config.js` / `storage.js`
规则深合并持久化；牌局存档。

## 运行时状态（概要）

```
state
├── phase            // … | 定缺 | 摸牌 | 出牌 | 等待操作 | 结束
├── players[4]       // + missingSuit: "w"|"t"|"b"|null
├── activeRules      // baseStake, settlementRules, patterns, extraPatterns, gangRules…
├── roundSettlement  // 胡/杠/花猪/查叫占位 + playerDeltas
├── scores / roundDelta / scoreLog
└── …
```

### 花猪付款模型（已确认）
每位花猪向**其余三位玩家**各付 `baseStake × 2^(flowerPigFan-1)`；与查叫不叠加（优先花猪）。本轮不做查叫处罚。

## 协作与文档约定

- 小改动直接改代码；大改动同步本文件与 `CHANGELOG.md`。
- 技术栈锁定：原生 HTML/CSS/JS Module；禁止 React/Vue/npm/TS/外部麻将库。
- **不要改**：`tiles.js`、牌面尺寸、响应式布局、PWA 形态、玩家默认名、现有动画视觉、AI 策略（除强制缺门出牌）。
