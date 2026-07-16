# v0.16.0（进行中）

- 布局重构：四家独立 `info/hand/meld/discard`；仅 `portrait|landscape` + CQ
- `fitTiles` 只算牌尺寸（带缓存）；无 +N
- 删除 neutralize；布局真源 `table.css` + `table-layout.js`
- **layout-tests**：几何 / Stress / Golden(0.001) / Random×1000 / 浏览器截图 / HTML Report → [layout-tests.html](./layout-tests.html)
- **发布门禁**：Geometry ∧ Stress ∧ Golden 全 PASS，否则禁止 Merge（见 [layout-tests/README.md](./layout-tests/README.md)）
- 设计终稿：[LAYOUT_v0.16_DESIGN.md](./LAYOUT_v0.16_DESIGN.md)

# v0.15.3

- 见 [LAYOUT_ALGORITHM.md](./LAYOUT_ALGORITHM.md)（v0.15 归档说明）
