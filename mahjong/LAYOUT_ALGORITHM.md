# 牌桌布局算法（现行 v0.15.3）

> 本文整理的是**当前实现实际在跑的算法**，不是理想目标态。  
> 桌面端仍有明显交叉/挤占问题；修布局前请先以本文为准对照代码。

相关文件：

| 文件 | 职责 |
|------|------|
| `index.html` | `.table` DOM 分区与节点 ID |
| `table.css` | Grid 安全带、区格、本版牌面尺寸 |
| `table-layout.js` | 量桌 → `data-layout` + CSS 变量 |
| `style.css` | 旧 absolute 几何（末尾 neutralize，但仍有样式残留） |
| `render.js` | 往固定 ID 的 seat/meld/discard 灌 DOM；`initTableLayout` |

**禁止改动范围（布局债以外）：** SVG 牌面、算分、AI、规则、PWA。

---

## 1. 设计意图（这版想做成什么）

把「手牌 / 副露 / 弃牌 / 中央信息」拆成 **互不共享同一单元格的安全区**：

- 南北：手牌行 ≠ 弃牌河行（纵向分层）
- 东西：手牌 + 河包在 **通高侧列**里，河不再只占中央一行
- 区格默认 **裁切**（`overflow: hidden`），不用滚动条白框
- 牌宽由 **JS 全局变量** + **容器查询二次钳制** 共同决定

实际结果：网格骨架已分格，但桌面端仍可能区域交叉——见文末「已知失败模式」。

---

## 2. 座位编号与 DOM 所有权

渲染层（`render.js`）只认 ID，**不关心 Grid**：

| 座位 index | 方位 | 手牌容器 | 副露 | 弃牌 |
|-----------|------|----------|------|------|
| 0 | 自己（南） | `#seat-0` | `#meld-0` | `#discard-0` |
| 1 | 上家（西） | `#seat-1` | `#meld-1` | `#discard-1` |
| 2 | 对家（北） | `#seat-2` | `#meld-2` | `#discard-2` |
| 3 | 下家（东） | `#seat-3` | `#meld-3` | `#discard-3` |

`state.discards` 是全局时间序数组 `{player, tile}`；`renderDiscards` 按 `player` 分发到对应 `#discard-*`。

副露：`player.melds[]` → `#meld-*` 内多个 `.meld-group`。

Overlay（仍 absolute，叠在整桌最上）：

- `#startOverlay` 大厅
- `#actionDock` 操作条
- `.player-action-effect` 飘字（`player-action-{bottom|left|top|right}`）

---

## 3. DOM 分区结构（`index.html`）

```
.table[data-layout]
├── .zone-w（grid: wside，通高）
│   ├── #seat-1.seat-left          ← 手牌靠外
│   └── .side-river
│       ├── #meld-1
│       └── #discard-1             ← 河靠内（朝桌心）
├── .zone-e（grid: eside，通高）
│   ├── .side-river
│   │   ├── #discard-3
│   │   └── #meld-3
│   └── #seat-3.seat-right
├── .zone-n-seat  → #seat-2
├── .zone-n-river → #meld-2 + #discard-2
├── .table-center → 剩余牌 / 阶段 / 轮到
├── .zone-s-river → #discard-0 + #meld-0
├── .zone-s-seat  → #seat-0
└── .table-overlay
```

西列内部顺序：`手牌 | 河`  
东列内部顺序：`河 | 手牌`  
（手牌靠屏幕外缘，副露弃牌靠近中央列。）

---

## 4. CSS Grid 空间算法（`table.css`）

### 4.1 网格定义

**3 列 × 5 行：**

```
列：  --col-side | minmax(0,1fr) | --col-side
行：  --row-n-seat | --row-river | minmax(--center-min,1fr) | --row-river | --row-s-seat
```

**areas：**

```
wside | nseat  | eside
wside | nriver | eside
wside | center | eside
wside | sriver | eside
wside | sseat  | eside
```

`.zone-w` / `.zone-e` 的 `grid-area` 为 `wside` / `eside`，**纵向跨全部 5 行**。  
中间列五格：对家手牌 → 对家河 → 中央 → 自己河 → 自己手牌，**互不叠格**。

### 4.2 默认轨道变量（未套 data-layout 覆盖前）

| 变量 | 默认（`.table`） | 含义 |
|------|------------------|------|
| `--col-side` | `clamp(108px, 20%, 200px)` | 左右通高列宽 |
| `--row-n-seat` | `clamp(52px, 11%, 92px)` | 对家手牌行高 |
| `--row-river` | `clamp(52px, 12%, 96px)` | 南北弃牌河行高 |
| `--row-s-seat` | `clamp(100px, 22%, 168px)` | 自己手牌行高 |
| `--center-min` | `80px` | 中央信息格最小高度 |
| `--hand-tile-w` | `clamp(28px, 3.6vw, 52px)` | 手牌基准宽（CSS 兜底） |
| `--meld-tile-w` | `hand × 0.48` | 副露牌宽 |
| `--discard-tile-w` | `hand × 0.42` | 弃牌宽 |
| `--tile-w` / `--tile-h` | hand / hand×1.42 | 兼容旧名；牌高宽比固定 **1.42** |

兼容别名（给旧 overlay 公式用）：

- `--col-seat = --col-side × 0.42`
- `--col-river = --col-side × 0.58`

### 4.3 `data-layout` 四套模板（只改轨道，不改 areas）

由 JS 写入 `data-layout` 后，CSS 覆盖上述变量：

| layout | 典型触发 | 侧列 / 北行 / 河行 / 南行 要点 |
|--------|----------|------------------------------|
| `phone-portrait` | `w ≤ 600` | 侧列更窄；南行偏高；`min-height` 保底 |
| `phone-landscape` | `h ≤ 420` 且横屏 | 整桌 `height: 100dvh - 3.2rem`；隐藏南北 seat-meta |
| `tablet` | `w < 1400` 或偏竖屏 | `aspect-ratio: 4/3` |
| `desktop` | 其余 | `aspect-ratio: 16/10`；`max-height: 100dvh - 7.5rem`；宽度再被高×比例封顶 |

宽屏（`min-width: 1400px` 且 `min-aspect-ratio: 5/4`）时：`.game-layout` 变成 **桌 | 侧栏** 两列，sidebar 不再压在桌下。

### 4.4 区格内部排布

| 区 | 方向 | 规则摘要 |
|----|------|----------|
| `.zone-w` / `.zone-e` | row | seat 宽 `min(48%, 72px)`；`.side-river` 吃剩余宽；`overflow: hidden` |
| `.side-river` | row | 内含 meld + discard；西 justify-start，东 justify-end |
| `.zone-n-seat` / `.zone-s-seat` | column | seat 填满格；`overflow: hidden` |
| `.zone-n-river` / `.zone-s-river` | column | 上：meld 上、discard 下；下：discard 上、meld 下 |
| 南北 meld | wrap | `max-height ≈ meld牌高 + 8px` |
| 南北 discard | wrap | `flex:1`，裁切 |
| 侧河 meld | column + wrap | `max-width ≈ meld宽×1.2` |
| 侧河 discard | column + wrap | 竖排 + 旋转，裁切 |

**裁切策略：** 所有 `.zone`、meld、discard、seat 统一 **禁止 `overflow: auto`**，装不下就裁掉/缩小牌，不出现滚动白框。

### 4.5 单牌尺寸算法（CSS 层，在变量之上再钳）

牌高统一：`height = width × 1.42`。

**南（自己）手牌**（容器 `container-type: size`）：

```
fitW = (100cqi - 4px) / 14.4
fitH = (100cqh - 4px) / 1.42
w    = min(--hand-tile-w, fitW, fitH)
```

**北（对家）手牌：** 同理，但上限再乘 `0.55`：

```
w = min(--hand-tile-w × 0.55, fitW, fitH)
```

**东西手牌**（竖排 + 旋转）：

```
sideW = min(--hand-tile-w × 0.52, 100cqh/13.2, 100cqi/1.5)
```

旋转后用负 margin 压紧：`margin-bottom = sideW - sideW×1.42`（牌高>牌宽时把投影高度收成约「牌宽」一格）。

**副露 / 弃牌：** 直接用 `--meld-tile-w` / `--discard-tile-w`；左右旋转同手牌逻辑。

### 4.6 Overlay 定位（仍 absolute）

相对 `.table`：

- actionDock：`right = --col-side + 8px`，`bottom = --row-s-seat + 8px`
- FX bottom/top：用 `--row-s-seat` / `--row-n-seat` + `0.35 × --row-river`
- FX left/right：约 `--col-side × 0.45`

---

## 5. JS 尺寸算法（`table-layout.js`）

入口：`initTableLayout(table)`（`game.js` / `render.js` 各调一次）  
→ `ResizeObserver(table)` → 每次：

```
applyTableSize(table)
  1) --table-w / --table-h = clientWidth / clientHeight
  2) layout = classifyLayout(w, h) → 写 data-layout
  3) applyTileVars(table, layout)
```

### 5.1 断点：`classifyLayout(w, h)`

按顺序：

1. `h ≤ 420 && w > h` → `phone-landscape`
2. `w ≤ 600` → `phone-portrait`
3. `w < 1400 || (h/w) > 1.1` → `tablet`
4. 否则 → `desktop`

### 5.2 手牌宽上下限：`handLimits(layout)`

| layout | min (px) | max (px) |
|--------|----------|----------|
| phone-landscape | 18 | 32 |
| phone-portrait | 26 | 42 |
| tablet | 32 | 56 |
| desktop | 36 | 64 |

### 5.3 牌宽公式：`applyTileVars`

量南位格（`.zone-s-seat`）：

```
southW = zone.clientWidth  || tableW × 0.62
southH = zone.clientHeight || tableH × 0.2

byW = southW / 14.4
byH = max(12, (southH - 28) / 1.42)

hand     = clamp(min(byW, byH), handMin, handMax)
meld     = clamp(hand × 0.48, 12, hand × 0.55)
discard  = clamp(hand × 0.42, 10, hand × 0.50)
```

写入：

- `--hand-tile-w`
- `--meld-tile-w`
- `--discard-tile-w`
- `--tile-w`（= hand，兼容旧式）

**注意：**

- JS **只按南位宽高** 估一套全局牌宽；北/侧再用 CSS 系数缩小。
- 南北河、侧河 **没有** 按自身格子再算一套 discard/meld 尺寸。
- `ResizeObserver` 只 observe `.table`，不 observe 子区；依赖子区随 table 重排后 client 尺寸已更新。

---

## 6. 与 `style.css` 的双层关系（重要）

`style.css` 仍保留 **v0.14 及更早** 的 absolute 安全带（`--band-*`、`.seat-left` 定位、`.discard-left` inset、`.meld-left` rail 等）。

文件末尾有 **v0.15 neutralize**：

- `.table` → `display:grid !important`
- seat / discard / meld 强制 `position:relative`，清掉 top/left/…
- seat 强制 `overflow:hidden`；清 height/min/max-height
- discard/meld 清绝对坐标与 width 锁死

但 **没有** 删掉整段旧规则：选择器仍在，部分属性（如 `.hand` 的 min-height、`.seat-top .hand` 细节、媒体查询里座位字号）仍可能与 `table.css` 叠生效。排查桌面「看起来还不对」时，应在开发者工具核对 **最终计算样式是否来自 legacy**。

布局真源应以 `table.css` + `table-layout.js` + DOM 区格为准；`style.css` 的牌桌几何视为待清债务。

---

## 7. 端到端数据流

```
窗口 / 侧栏变化
    ↓
.table 尺寸变化（ResizeObserver）
    ↓
classifyLayout → data-layout → 切换轨道变量（列宽行高）
    ↓
applyTileVars → --hand/meld/discard-tile-w
    ↓
CSS Grid 摆区格
    ↓
各 .hand / meld / discard 内：变量 × 容器查询 / 旋转 margin
    ↓
render.js 只更新 #seat-*/#meld-*/#discard-* 内容，不改几何
```

---

## 8. 已知失败模式（现行算法下仍会发生）

以下是「算法写清楚之后仍对不上预期」的清单，方便下一轮重构对照，**不是已修复声明**：

1. **桌面仍交叉：** 用户反馈仅电脑端也不对——侧列通高 + 中间五行在理论上分格，但可视牌仍可能越界或被裁得难看；需对照截图查是「真叠层」还是「格子内裁切/过小」。
2. **全局牌宽只看南：** 桌面 `--row-n-seat` 很矮（~60–92px）时，北牌 `0.55×hand` 仍可能相对行高偏大；虽有 `cqh` 钳制，但 seat-header 占高、容器高度是否为 0 会影响 `cqh`。
3. **侧列宽 vs 内容：** `--col-side` 固定轨宽，内又拆 seat(~48%) + river；副露竖排旋转后占地大，靠裁切而非再缩放。
4. **南北河行高固定：** 弃牌多时 wrap 后被 `overflow:hidden` 裁掉，看起来像「丢了」或贴边，易被误解为叠到手牌上。
5. **aspect-ratio 与 max-height 双约束：** desktop `16/10` + `max-height: 100dvh-7.5rem` 可能让桌在宽屏上变矮，行百分比随之变紧。
6. **legacy CSS 干扰风险：** neutralize 未覆盖到的规则仍可能改 min-height / flex / 字号占位。
7. **两处 `initTableLayout`：** `game.js` 与 `render.js` 各注册一次 Observer——功能上重复，一般无害，但属噪音。

---

## 9. 版本演进（仅布局）

| 版 | 算法要点 |
|----|----------|
| ≤0.14 | absolute + `--band-*` 安全带补丁战 |
| 0.15.0 | 四 panel（手+河同格）+ grid + data-layout |
| 0.15.1 | 定缺手牌单行 cqi |
| 0.15.2 | 5 行分格；左右河仍占中央一行 → 白框滚动 |
| **0.15.3（现行）** | 3 列：侧列通高含河；南北分行；裁切；南位高宽双钳 JS |

简版叙事见 `LAYOUT_v0.15.md`；**算法细节以本文为准**。

---

## 10. 下次改布局时建议对照检查清单

1. 开发者工具：选中对家手牌 / 自己弃牌 / 左河，确认 `grid-area` 是否分属不同格。  
2. Computed：`--hand-tile-w`、`--row-n-seat`、`--row-s-seat`、`--col-side` 数值。  
3. `data-layout` 在桌面是否真是 `desktop`（窗口够大时）。  
4. 是否仍命中 `style.css` 的 absolute/`--band-*` 相关属性。  
5. 修 bug 优先改 **格分配 / 轨道变量 / 牌宽公式**，避免再堆 z-index 遮盖。
