# v0.16 牌桌布局重构方案（最终确认稿）

> **状态：已确认，实施中。**  
> 确认日期：2026-07-16。编码以本文为准。  
> 布局 Bug：**优先改 `table.css`（Grid/CQ）与 `fitTiles`；禁止在 `style.css` 加临时几何补丁。**

---

## Layout Philosophy（布局哲学）

牌桌布局优先级：

1. **所有麻将牌必须完整可见。**
2. **所有区域不得重叠。**
3. **再追求视觉美观。**

任何时候，不允许为了让界面更整齐，而裁切、隐藏或遮挡麻将牌。

---

## Layout Invariants（布局不变量）

下列交集必须为空集（Ø）。任何布局修改不得违反；`layout-tests` **必须**自动验证：

```
hand ∩ meld     = Ø
hand ∩ discard  = Ø
meld ∩ discard  = Ø
meld ∩ center   = Ø
discard ∩ center = Ø
```

（同家与跨区相对中央均适用上述条款；实现上按矩形 `getBoundingClientRect` 检测。）

---

## 0. 目标与真源

### 目标

1. 删除旧布局债：`style.css` 无牌桌几何；废除 neutralize。
2. 四家各 **info / hand / meld / discard** 独立格子；废除 `.side-river`；**第一版就拆，无兼容旧结构。**
3. `fitTiles()` **只算** `tileWidth` / `tileHeight` / 可选 `gap`；Grid 与换行交给 CSS；带缓存。
4. **仅允许** `data-layout="portrait" | "landscape"`；禁止再増 phone/tablet/fold/desktop 等 layout 类型；设备差异只用 **Container Query**。
5. 弃牌等关键牌全部可见；放不下继续缩小；仍不够 → `data-fit=fail` → 测试 FAIL；**无 +N**。
6. 测试：几何 + Stress + Golden（`maxDiffRatio=0.001`）+ Random Stress 1000 局 + 浏览器截图 + HTML Report + Debug Overlay。
7. **发布门禁**：Geometry / Stress / Golden 全 PASS，否则禁止 Merge。

### 真源

| 职责 | 真源 |
|------|------|
| Grid / CQ / 区格 / overlay 锚点 / debug | `table.css` |
| `portrait\|landscape`、`fitTiles`+缓存 | `table-layout.js` |
| DOM 壳 | `index.html` |
| 视觉（无几何） | `style.css` |
| 回归 | `layout-tests.*` + `layout-tests/` 产物 |

---

## 1. 区域结构（第一版即拆）

每家四区，**不得**把玩家信息放进 hand：

```
info     — 名字（永不隐藏）、张数、定缺、庄家等；可扩在线/AI/网络/托管
hand     — 仅手牌
meld     — 仅副露
discard  — 仅弃牌
```

+ `center` + `overlay`（唯一 absolute 层）。

### Landscape：Compact Info（不默认隐藏）

始终保留：玩家名字、剩余牌数（手牌张数）、定缺状态。  
可隐藏：长文本、次要说明、调试信息。  
**玩家名字任何时候不能消失。**

### DOM（无兼容分支）

```html
<div class="table" data-layout="portrait|landscape">
  <!-- ×4 方位 -->
  <section class="zone zone-*-info" id="info-N">...</section>
  <section class="zone zone-*-hand"><div class="seat" id="seat-N"></div></section>
  <section class="zone zone-*-meld"><div class="meld-zone" id="meld-N"></div></section>
  <section class="zone zone-*-disc"><div class="discard-zone" id="discard-N"></div></section>
  <div class="table-center" id="table-center">...</div>
  <div class="table-overlay">...</div>
</div>
```

删除：`.side-river`、hand 内 header、一切「info 暂留 seat」方案。

---

## 2. 删除的旧规则（`style.css`）

删除全部牌桌 absolute / `--band-*` / meld-rail / neutralize（详见实施清单）。  
保留皮肤与组件外观。删除源头，不留覆盖补丁。

---

## 3. Grid：仅 Portrait / Landscape + CQ

**永远只允许这两种 `data-layout`。禁止** 再增加 phone / tablet / fold / desktop / magic-* / ipad 等类型。

差异统一用 Container Query 改：轨道比例、字号、gap、span。不得新增 layout 类型。

### `portrait` / `landscape` areas（已确认并校正）

原稿 5 列中 `wh`/`wm` 不连续（非法 Grid）。实施为 **7 列 × 9 行**（侧手通高 + 副露/弃牌辅列；**中央独占一行**，不与弃牌共轨）：

```
w0 wi ni ni ni ei e0
wh nh nh nh nh nh eh
wh nm nm nm nm nm eh
wh wm nd nd nd em eh
wh wm ct ct ct em eh
wh wd sd sd sd ed eh
wh sm sm sm sm sm eh
wh sh sh sh sh sh eh
s0 si si si si si s1
```

- `wh`/`eh`：侧手通高矩形  
- `nh`/`nm`/`sm`/`sh`：南北占中五列（含辅列），牌面宽度一致  
- `wm`/`em`：侧副露在中带（北弃+中央行），勿贴顶与对家手牌并行  
- `wd`/`ed`：侧弃牌在南弃牌行带  
- 无 `.side-river`；info 格保留；landscape 用矮 info 行 + `.info-secondary { display:none }`（名字/张数/定缺仍在）
- 窄屏等设备差：用 `data-narrow|short|wide|tall`（由实测桌面尺寸写入），不用无效的自引用 Container Query 改 `.table` 自身
禁止再增加 phone / tablet / fold / desktop 等 layout 类型。

---

## 4. `fitTiles`

只负责：`tileWidth`、`tileHeight`、可选 `gap`。  
不负责：Grid、换行、布局。

缓存 key：

```
layout + containerWidth + containerHeight + tileCount + orientation
```

命中直接返回，避免每次 render 重算。

装不下（估测在 minW+gapMin 下仍溢出）→ `data-fit=fail`，仍不藏牌；测试 FAIL。

---

## 5. 测试与门禁

### 固定视口

390×844、844×390、932×430、1180×1240、1280×800、1920×1080。

### 场景

empty-melds、melds-4、discards-24、action-dock、fx、**stress**（满副露+满弃牌+亮牌）、**Random Stress 1000 局**。

### 检测

Invariants + 越界 + 滚动 + `data-fit`；浏览器内 **html-to-image 或 dom-to-image**；HTML Report；Golden `maxDiffRatio=0.001`。

### Debug Overlay

按钮/快捷键：为 hand/meld/discard/center 画彩色边界；Release 默认关。

### 发布门禁

Geometry PASS ∧ Stress PASS ∧ Golden PASS，否则禁止 Merge。

### 截图

纯浏览器；不引入 Puppeteer / Playwright / Node 截图。

---

## 6. 迁移阶段（实施节奏）

每完成一阶段输出：修改文件、已完成、测试结果、下一阶段。

1. 文档冻结 ← **本文件**  
2. DOM 四区 + render 拆 info  
3. `table.css` 两套模板 + CQ + Debug Overlay 样式  
4. `table-layout.js` fitTiles + 缓存  
5. 清除 `style.css` 几何债  
6. `layout-tests`（几何/截图/报告/Golden/Stress/Random）← **已落地** [`layout-tests.html`](./layout-tests.html)  
7. 门禁文档与版本 `v0.16.0`

---

## 7. 开放点（已全部关闭）

| 项 | 决议 |
|----|------|
| info 拆分 | 第一版就拆，无兼容 |
| Landscape info | Compact Info，名字不消失 |
| Golden | maxDiffRatio = 0.001 |
| 截图 | 浏览器 html-to-image / dom-to-image |
| Grid 类型 | 仅 portrait / landscape + CQ |
| +N | 不做 |
| fitTiles | 只尺寸 + 缓存 |
| Random Stress | 1000 局 |
| Debug Overlay | 有，默认关 |
| 门禁 | Geometry+Stress+Golden |
| 补丁 | 禁止 style.css 几何补丁 |

---

**本文即最终方案。**
