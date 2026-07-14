# Nocturne Games

一个可长期扩展的纯前端小游戏项目。

## 目录

```text
nocturne-games/
├─ index.html
├─ shared/
│  ├─ base.css
│  └─ app.js
├─ chess/
│  ├─ index.html
│  ├─ css/          # board, themes, ui
│  └─ js/           # engine, renderer, ai, storage, game
├─ mahjong/
│  ├─ index.html
│  ├─ css/          # table, tiles, ui
│  └─ js/           # config, tiles, hu, score, ai, storage, renderer, game
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ ROADMAP.md
│  ├─ CHESS_REQUIREMENTS.md
│  └─ MAHJONG_RULES.md
└─ legacy/          # 重组前备份，请勿直接引用
```

## 本地启动

推荐使用 VS Code / Cursor 的 Live Server 插件。

也可以在项目根目录运行：

```bash
python -m http.server 8080
```

然后打开：

- 首页：http://localhost:8080/
- 国际象棋：http://localhost:8080/chess/
- 四川麻将：http://localhost:8080/mahjong/

## 当前状态

- Chess：模块化框架，含棋盘、走子、人机与存档。
- Mahjong：模块化框架，含换三张、定缺与基础摸打。
- 详细说明见 `docs/`。
