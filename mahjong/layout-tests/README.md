# Layout Tests（v0.16）

浏览器打开：[`layout-tests.html`](./layout-tests.html)

## 发布门禁

必须全部通过后才允许 Merge：

1. **Geometry PASS** — Layout Invariants + 越界 + 滚动 + `data-fit` + 禁止 `+N`
2. **Stress PASS** — 满副露 + 满弃牌 + 亮牌（× 全部视口）
3. **Golden PASS** — `maxDiffRatio ≤ 0.001`（先「Promote 截图 → Golden」写入 IndexedDB 基线）

## 操作

1. 「运行固定矩阵」— 6 视口 × 固定场景（可开截图/Golden）
2. 「运行 Stress」
3. 「Random Stress ×1000」— 仅几何，默认不截图
4. 全绿后「Promote 截图 → Golden」再开 Golden 复跑
5. 「下载 HTML 报告」

Debug Overlay：面板按钮或正式页 Alt+L。

## 不变式

```
hand ∩ meld = Ø
hand ∩ discard = Ø
meld ∩ discard = Ø
meld ∩ center = Ø
discard ∩ center = Ø
```
