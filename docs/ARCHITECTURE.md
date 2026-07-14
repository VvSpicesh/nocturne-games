# Nocturne Games Architecture

纯前端静态站点。目标是长期可拆分维护：每个游戏只依赖本目录模块 + `shared/`。

## 顶层结构

```text
nocturne-games/
├─ index.html              # 游戏大厅
├─ shared/                 # 共用视觉与极少量全局脚本
│  ├─ base.css
│  └─ app.js
├─ chess/                  # 国际象棋
│  ├─ index.html
│  ├─ css/                 # board / themes / ui
│  └─ js/                  # engine / renderer / ai / storage / game
├─ mahjong/                # 四川麻将
│  ├─ index.html
│  ├─ css/                 # table / tiles / ui
│  └─ js/                  # tiles / hu / score / ai / storage / renderer / game (+ config)
├─ docs/                   # 架构、路线图、需求与规则
└─ legacy/                 # 重组前源文件备份（勿直接引用）
```

## 运行方式

- 推荐：`python -m http.server 8080`（项目根目录）
- 也可用 Live Server
- 线上：GitHub Pages，入口为仓库根目录 `index.html`

脚本加载顺序很重要：先工具模块，后 orchestrator（`game.js`）。

## Chess 模块

| 模块 | 文件 | 职责 |
|------|------|------|
| engine | `js/engine.js` | 局面、伪合法走子、评估分值 |
| renderer | `js/renderer.js` | 棋盘 DOM、棋谱、Toast |
| ai | `js/ai.js` | 电脑走子调度与选招 |
| storage | `js/storage.js` | 模式/难度本地存储 |
| game | `js/game.js` | 输入、状态机、把各模块串起来 |

CSS：`board.css`（棋盘格）、`themes.css`（棋子外观）、`ui.css`（侧栏与控件）。

## Mahjong 模块

| 模块 | 文件 | 职责 |
|------|------|------|
| config | `js/config.js` | 花色与规则开关 |
| tiles | `js/tiles.js` | 牌墙、洗牌、牌面 SVG |
| hu | `js/hu.js` | 胡牌判定（占位） |
| score | `js/score.js` | 番型计分（占位） |
| ai | `js/ai.js` | AI 出牌策略（部分已在 game 内联） |
| storage | `js/storage.js` | 牌局持久化 |
| renderer | `js/renderer.js` | 座位、弃牌区、操作区 |
| game | `js/game.js` | 发牌、换三张、定缺、摸打流程 |

CSS：`table.css`（桌面与座位布局）、`tiles.css`（牌面样式）、`ui.css`（侧栏与提示）。

## 设计约束

1. **不向单个 HTML 堆逻辑**：页面只挂载 DOM 与脚本引用。
2. **模块之间通过全局对象协作**（当前阶段，便于静态托管；日后可改为 ES modules）。
3. **行为变更走版本，不改 silent**：框架整理不得改变用户可见行为。
4. **`legacy/` 只作对照**，线上页面不得再引用其中脚本。
