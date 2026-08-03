# 项目交接文档（Project Handoff）

> **Cursor 聊天记录不是项目记忆。** 换电脑 / 新会话时以本文件与 `docs/`、`.cursor/rules/` 为准。

更新日期：2026-08-03

## 0. 换机基线（Snapshot）

| 项 | 值 |
|---|---|
| 远程仓库 | https://github.com/VvSpicesh/nocturne-games.git |
| 分支 | `main` |
| 基线提交 | `db8d3bb`（handoff + verify 已入库）及其后本文件更新提交 |
| 麻将版本 | **v0.15.24** |
| SW CACHE | `nocturne-games-v115` |
| 正式站点 | https://vvspicesh.github.io/nocturne-games/ |
| 麻将页 | https://vvspicesh.github.io/nocturne-games/mahjong/ |
| 统一校验 | `python scripts/verify.py` → 应 `VERIFY OK` |
| 无需 | `npm install`（禁止业务 npm） |

换机后第一句话优先让 Cursor 读：`docs/00_project_handoff.md`、`docs/04_decisions.md`、`docs/05_next_tasks.md`、`.cursor/rules/*.mdc`，然后跑 verify。

## 1. 项目定位

Nocturne Games：长期维护的**纯前端**游戏平台（大厅 + 国际象棋 + 四川麻将等），GitHub Pages 直开，PWA 可离线。

权威规范：`docs/Nocturne_Games_Project_Guide.md`

## 2. 当前开发阶段

- 平台：PWA 可用（`nocturne-games-v115`）
- 象棋：Stable 可玩
- 麻将：血战到底家庭大字版，版本 **v0.15.24**（横屏布局 / 事件提示 / 暗杠显示持续打磨）
- 工程：跨会话交接文档 + `scripts/verify.py` 已就绪

## 3. 已完成内容（摘要）

- 大厅 + Chess + Mahjong 可玩；根目录 Service Worker + `shared/pwa.js`
- 麻将：定缺、换三张、血战、杠分、花猪/查叫、叫牌/换听提示、副露来源、事件 toast 统一、终局 reveal
- 普通手机横屏 compact-landscape：满屏牌桌、顶栏可滚、左右副露统一尺寸、暗杠单层四张、选中上浮不裁切
- Headless 验收：`mahjong/rule-tests.js`（可由 `python scripts/verify.py` 跑）

## 4. 当前未完成内容

见 `docs/05_next_tasks.md`（E2E/视觉自动化、AI 拆分、更多番种 UI、gomoku 骨架等）。

## 5. 核心业务原则

- 不引入 React / Vue / Angular / TypeScript / **npm** / 外部麻将库 / Workbox
- 麻将模块职责：`game.js` 规则状态 AI；`render.js` UI；`tiles.js` SVG；`hu.js`；`score.js`；`storage.js`；`config.js`
- SW：改预缓存必须 bump `nocturne-games-vN`；不碰 localStorage 存档
- Debug / 规则测试按钮仅 localhost

## 6. 技术栈

- HTML / CSS / JavaScript ES Module
- GitHub Pages + 原生 Service Worker
- 本地静态服务：`python -m http.server`
- 校验：Python `scripts/verify.py` +（可选）Node 跑规则单测

## 7. 主要目录结构

```text
nocturne-games/
├─ index.html                 # 大厅
├─ service-worker.js
├─ shared/                    # PWA / settings / header …
├─ mahjong/                   # 四川麻将
├─ chess/
├─ docs/                      # 交接、决策、任务、测试结果、Guide
├─ scripts/                   # verify / rule-tests runner
└─ .cursor/rules/             # alwaysApply 规则
```

## 8. 重要文档入口

| 文档 | 用途 |
|---|---|
| `docs/Nocturne_Games_Project_Guide.md` | 长期工程规范 |
| `docs/PWA.md` | PWA 安装 / 清缓存 |
| `docs/00_project_handoff.md` | 本交接页 |
| `docs/04_decisions.md` | 已定决策 |
| `docs/05_next_tasks.md` | 下一步任务 |
| `docs/test-results/latest-test-result.md` | 最近一次 verify |
| `mahjong/ARCHITECTURE.md` / `CHANGELOG.md` | 麻将结构与变更 |
| `.cursor/rules/*.mdc` | Cursor 强制规则 |

## 9. 开发前必须执行

```bash
git pull --rebase origin main
python -m http.server 8080
# 另开终端：
python scripts/verify.py
```

阅读：`00_project_handoff` → `04_decisions` → `05_next_tasks` → Guide。

## 10. 开发完成必须执行

```bash
python scripts/verify.py
```

然后更新：

- `docs/test-results/latest-test-result.md`
- 视需要：`CHANGELOG` / `05_next_tasks` / `04_decisions` / handoff

## 11. 换电脑继续开发流程

### A. 新电脑首次

```bash
git clone https://github.com/VvSpicesh/nocturne-games.git
cd nocturne-games
git checkout main
git pull --rebase origin main
```

1. 安装 **Python 3**（`python -m http.server` + `scripts/verify.py`）
2. 建议安装 **Node.js LTS**（规则单测）。仅装 Cursor 时，verify 也可尝试使用 Cursor 自带 `node.exe`
3. **不要** `npm install`
4. `python scripts/verify.py` → `VERIFY OK`
5. 用 Cursor 打开本仓库根目录；确认 `.cursor/rules/` alwaysApply 已生效
6. 先读文档（handoff / decisions / next_tasks / Guide），再改代码
7. 重要结论写入 `docs/`，不要依赖聊天记录

### B. 本地试玩

```bash
python -m http.server 8080
```

- 大厅：http://localhost:8080/
- 麻将：http://localhost:8080/mahjong/

## 12. 当前已知风险

- UI / 横屏 / PWA 仍依赖人工真机验收（rule-tests 中 UI1–UI3 blocked）
- 无 ESLint / TypeScript；靠规范与人工 review
- 部分环境 PATH 无 `node`，需依赖 Cursor helper 或自行安装
- 麻将 `game.js` 体量大，后续宜拆 AI（见 next_tasks）
