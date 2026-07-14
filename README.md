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
│  ├─ chess.css
│  ├─ chess.js
│  └─ engine.js
└─ mahjong/
   ├─ index.html
   ├─ mahjong.css
   ├─ config.js
   ├─ tiles.js
   ├─ hu.js
   ├─ score.js
   ├─ ai.js
   ├─ storage.js
   ├─ render.js
   └─ game.js
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

- Chess：已搭好页面、棋盘渲染和模块接口。
- Mahjong：已搭好牌桌、牌面渲染、规则模块接口和状态管理框架。
- 后续逻辑按模块逐步实现，不再向单个 HTML 里堆代码。
