# Nocturne Games PWA

版本缓存名：`nocturne-games-v117`（见根目录 `service-worker.js`）。

## 能做什么

- 首次 **HTTPS** 或 **localhost** 联网访问后，核心资源会写入 Cache Storage
- 之后断网仍可打开：大厅、国际象棋、四川麻将
- 可「添加到主屏幕」，以 standalone 方式启动
- **不**使用 npm / Workbox / 外部 CDN
- Service Worker **不会**清除 `localStorage` 牌局存档

## 添加到主屏幕

### Android（Chrome）
1. 用 Chrome 打开站点（GitHub Pages 或本机 HTTPS/localhost）
2. 菜单 → **安装应用** / **添加到主屏幕**
3. 从桌面图标打开

### iOS（Safari）
1. Safari 打开站点
2. 分享 → **添加到主屏幕**
3. 从主屏幕图标打开

## 本地测试

Service Worker 仅在 **localhost** 或 **HTTPS** 生效。

```bash
# 在仓库根目录
python -m http.server 8080
```

打开：`http://localhost:8080/`

### Chrome DevTools → Application

1. **Service Workers**：应看到 `service-worker.js`，状态 activated  
2. **Cache Storage**：应有 `nocturne-games-v117`
3. 勾选 **Offline**  
4. 刷新大厅；进入 `chess/index.html`、`mahjong/index.html`  
5. 取消 Offline → Toast「网络已恢复」；再 Offline →「当前为离线模式」  
6. 修改 SW 缓存名为 `v2` 并刷新 → 出现顶栏「发现新版本，刷新后更新」；**不要期望自动刷新**；点击「刷新更新」后旧缓存应删除  
7. 麻将有存档时：只 Unregister SW / 删 Cache，**不要**删 Local Storage → 存档应仍在  

### 清除 Service Worker 与缓存（保留牌局）

1. Application → **Service Workers** → Unregister  
2. Application → **Cache Storage** → 删除 `nocturne-games-*`  
3. **不要**点 Application → Storage → Clear site data（会连带清 Local Storage）  
4. 硬刷新页面  

重新生成图标（可选）：

```bash
python scripts/generate_nocturne_icons.py
```

## 缓存策略摘要

| 类型 | 策略 |
|------|------|
| HTML / navigation | network-first，失败用缓存；再失败回大厅 |
| CSS / JS / 图标 / manifest | stale-while-revalidate |
| 非 GET / 外域 | 不拦截 |

预缓存清单见 `service-worker.js` 中 `PRECACHE`（随真实文件维护）。带 `?v=` 的 URL 与 ES Module 无查询路径都会缓存；`match` 带 `ignoreSearch` 回退。

## GitHub Pages

注册：

```js
const swUrl = new URL("../service-worker.js", import.meta.url);
navigator.serviceWorker.register(swUrl);
```

`shared/pwa.js` 固定在 `shared/`，因此无论大厅还是子游戏，都能解析到仓库根的 `service-worker.js`。默认 scope 覆盖整个 `/nocturne-games/` 子路径。
