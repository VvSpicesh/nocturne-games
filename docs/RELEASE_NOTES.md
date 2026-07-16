# RELEASE NOTES

## Mahjong v0.14.32-speech1

**Service Worker**：`nocturne-games-v35`

### 临时调试
- 「测试语音」按钮（不改正式播音）

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

---

## Mahjong v0.14.32

**Service Worker**：`nocturne-games-v34`

### 功能
- 声音播报、查叫/未下叫结算、封顶番、终局 reveal

### 布局
- 继续使用 v0.14.30 可玩牌桌；v0.16 布局实验见分支 `backup/layout-v016-failed`

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

---

## Mahjong v0.14.30

**Service Worker**：`nocturne-games-v33`

### 布局
- 普通手机横屏独立 compact-landscape 五段分区，清理冲突 media query

### 修复
- 荣耀浏览器横屏 viewport 高度兼容（`100vh` / `100dvh` / `-webkit-fill-available`）

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

---

## Mahjong v0.14.28

**Service Worker**：`nocturne-games-v31`

### 调整
- 自己副露回到座位外侧，紧贴座位上沿线
- 上家/下家座位底边与自己座位上沿线齐平，间隔对称对家

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

---

## Mahjong v0.14.26

**Service Worker**：`nocturne-games-v29`

### 调整
- 上家/下家方位字号与对家/自己一致；默认具体名为空
- 自己副露与手牌分层，避免横屏遮挡（含 v0.14.25）

同批发布：Chess stable11 — 将死/逼和/子力不足/认输结束弹框。

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

---

## Mahjong v0.14.24 Release Candidate

**状态**：Release Candidate  
**规则自动验收**：39 PASS / 0 FAIL / 3 BLOCKED（人工 UI）  
**Service Worker**：`nocturne-games-v28`

### 已实现
- 定缺与缺一门；定缺弹层展示手牌并以牌面选万/条/筒
- 花猪检测与处罚（向其余每位支付；查叫本 RC 不处罚）
- 基础牌型、根、额外番；`2^(totalFan-1)` 倍数计分
- 自摸加底（不进 totalFan）；杠分独立结算；`roundSettlement` 分流
- 39 项自动化规则测试通过

### 人工验收清单（RC → 正式版）
- [ ] 换三张 / 定缺 / 操作动画
- [ ] 四档响应式布局
- [ ] PWA 与 GitHub Pages 离线

完整稿：`mahjong/RELEASE_NOTES.md`。变更明细：`mahjong/CHANGELOG.md`。

> 规则/计分层（`game.js` / `hu.js` / `score.js`）冻结：非验收明确 Bug 不再改生产逻辑。

---

## Mahjong v0.14.15

Service Worker 缓存：`nocturne-games-v18`

### 修改
- 顶栏增加「← 返回游戏大厅」，可回到站点主页

---

## Mahjong v0.14.14（评分与桌面打磨）

Service Worker 缓存：`nocturne-games-v17`

### 新增 / 重要功能
- **计分**：起始 20000、一番一分、自摸加一番；允许负分；侧栏分数；终局战况总结；2 小时用眼提示
- **胡牌**：弹窗放大显示胡牌图；桌面赢家手牌最右明牌胡张
- **暗杠**：他家全牌背；自家末张明牌
- **PWA**：离线 / 安装 / 更新条（见下）

### 体验
- 座位名：自己瑞、上家安彬、对家兰儿、下家小诺
- 布局：副露 / 弃牌 / 侧栏高度 / 点炮文案等多项打磨
- 明杠显示为「杠」；一炮多响结算修复

详见 `mahjong/CHANGELOG.md`。

---

## nocturne-games-v1（PWA）

### 新增
- Progressive Web App：`manifest.webmanifest` + `service-worker.js` + `shared/pwa.js`
- 本地图标：`assets/icons/icon.svg`、`icon-192.png`、`icon-512.png`
- 离线可打开大厅、国际象棋、四川麻将
- 顶栏「发现新版本，刷新后更新」+ Toast 离线/恢复提示
- 文档：`docs/PWA.md`

### 说明
- 存档仍使用 localStorage；升级 SW 不会清空牌局
- 不引入 npm / Workbox / 外部依赖
