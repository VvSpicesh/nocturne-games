# 转豆豆 Phase 26：主体生成、统一关卡文档与公开关卡库

更新：2026-11-09。基线：main / 698d8df。
本版发布验证完成：207 项转豆豆单体通过，VERIFY OK。静态网站由 GitHub Pages 发布；部署结果以本版 Actions 为准。真实 OAuth/App 发布后端未接入，未做真实网络或端到端测试。

## 当前入口

- 转豆豆关卡首页右侧“图片关卡工坊”，或 generator.html。
- 原有六关保持原图和原解法，游戏首页另有“云端关卡”区域。
- level-library/index.json 与 levels/{id}.json 是匿名公开目录和关卡。
  包含已验证的“四色主体示例”，首次随网站发布，使用当前区域换色算法。
- “发布关卡”按钮默认禁用。publish-config.js 的 endpoint 为空，
  不存在可直接使用的 OAuth/App 登录授权服务。

业务改动限于 turn-beans/。发布准备另更新根 SW 缓存版本/资源清单和交接文档，不改大厅、象棋或麻将业务。
engine.js、levels.js、style.css 与本轮开始时的文件哈希一致：
原六关、Phase 25 禁用棋格 opacity:1!important / filter:none!important 均保留。
game.js 只增加云端关卡载入、版本存档 ID 使用和云端标题/完成导航处理，
index.html 只补充模块引用，页面没有重建。

## 图片主体提取

上传 JPG、PNG、WebP，浏览器本地解码、裁剪、移动与 1–4 倍缩放。
普通图片提供 32×32、40×40、56×40；分析采样最多为最终豆阵的 4 倍分辨率。
图片模式默认自动识别。拼豆锁定使用原豆阵尺寸，不将多颗豆子缩成一格；详见 [颜色与原色锁定说明](./README-COLOR-LOCK.md)。

1. 对四角及边缘窄带估计背景主色、支持率与自动阈值。
2. “背景容差”滑杆范围 -40～80，默认 0 表示自动阈值；右移移除更多近似背景，
   左移保留更多浅色边界。透明图优先使用 alpha。
3. 只移除与边缘连通且颜色距离匹配的背景，避免删除封闭的白眼等内部细节。
4. 对非背景区域做八邻接连通域分析、剔除明显碎点。
   默认仅最大主体；自动保留主体及附近足够大的碎片；保留全部也不会保留背景。
5. 进行一次轻微闭运算并保留原有细线；新增位置从最近主体像素取色，
   不把原背景重新混入量化。
6. 按主体 bounding box 等比例居中并保留透明边距，再进行减色和保守近色去杂点。

主体外所有格为 inactive，无豆色、无目标色，行编码统一为 '.'。
减色、统计、换色率分母、连通块和引擎点击仅使用 active cells。
原图、裁剪窗口、mask、去背景主体、target 和三档初始豆阵同时可见。
模式/容差变化会立即废弃旧验证结果；识别失败明确提示，不退回整幅背景生成。

已有 imageInput 的 15 张 JPG 在上一轮离线样本检查中均返回一个最大主体，
默认 32×32 有效豆数为 238–628。该结果不是人工边界准确性保证。
本轮容差、细线和近背景边缘行为由单体测试覆盖；未运行浏览器视觉验收。

## 三档与引擎验证

当前使用 regions-v1 区域级换色，详见 [区域算法与实测](./README-REGIONS.md)。
先按同底色四邻域分割，净化小区域规划，再以连通区域/子区做等面积颜色循环。
target、mask、调色板和颜色数量不变；小细节可保留正确颜色，不再随机抽取 5 格/2 格散点。
easy/medium/hard 优先 2/3/4 色循环，区域面积参考上限为 128/64/32，最低 6 格，
取豆操作仍由原引擎限制为每次 10 颗、三盘各 20。

新增错色区域数、平均/最大块、单点双点占比和 (baseColor, beanColor) 分布。
质量不合格或引擎验证失败最多重试 6 次；全部失败不展示候选，不标记可玩，不允许统一导出。
32×32 标准样本平均块 192/64/32；用户原图 19 色版本为 170.67/63.27/15.24，三档均无单点/双点错色。
区域优先可能降低换色率，不能声称所有困难图 100% 换色。三档仍共用同一 target。

## 统一 JSON

level-document.js 是唯一公开文档校验器，详见 level-library/README.md。

根字段为 schemaVersion:1、id、name、width、height、palette、target、
variants、version、metadata。
palette 使用 A–Z、a–z、0–9、- 单字符到规范大写 #RRGGBB 的映射，'.' 只代表 inactive；旧 A–P 编码不变。
target.rows 是唯一正确目标；variants.easy/medium/hard 各含 initialRows、
solution、verified、statistics，不允许另设 target。
metadata 记录图片来源、主体模式、背景容差、创建/更新时间、生成器及回放版本。

严格校验行数、每行长度、符号、调色板、同一 mask、版本与时间格式、
解法上限、真实回放和重算后的全部统计。未知字段与伪造 verified 会被拒绝。
下载和库文件使用新格式，旧格式解析器没有删除。

## 公开读取、更新与缓存

- 首次只加载 index.json，选择难度时才请求对应关卡。
- 无需用户登录，读取请求 credentials:omit，公开索引是不同设备的共同来源。
- index 使用 revision，条目包含版本及 SHA-256。
- 目录 no-store 重新获取，关卡 URL 带版本与摘要；内存缓存按 id/version/digest 分开。
- 切回标签页或点击刷新会重新读取；更新版本不复用旧难度的存档 ID。
- JSON 不属于根 SW 当前的静态 stale-while-revalidate 清单。
  关卡目录里的 .gitattributes 固定 JSON 使用 LF，保证跨平台内容摘要一致。
- 网络中断、HTTP 失败、格式错误、空目录分别提示，错误不会伪装成空目录或可玩旧数据。
- 目录与关卡 CDN 暂时不同步时摘要不符会拒绝加载，待资源更新后重试。
- file:// 页面只能本地生成；公开目录需从网站或本地 HTTP 服务读取，页面会说明原因。
- 游戏脚本仍受现有根 SW 更新策略影响，部署后若看到旧界面可能需要再次刷新；
  本轮不越界修改根 SW。

## GitHub 发布

见 publisher/README.md 与默认关闭的 wrangler.example.toml。

已实现可测试的 Worker 接口、GitHub Git Data 适配器、前端发布按钮及状态：
真实服务端会话 → GitHub admin 权限 → Origin/CSRF → 有界请求解析 →
统一文档与三档真实引擎重验 → 版本/覆盖确认 → 双文件原子提交。

目标固定为 VvSpicesh/nocturne-games/main，仅允许关卡库 JSON 路径。
新 ID 不得存在；更新必须明确覆盖、匹配旧版本且版本加一。
同一 Git commit 写入关卡与 index，force:false 更新 ref；并发失败返回 409，不强推。
成功只表示 GitHub commit，部署待确认、上线待确认。公开读取精确版本/摘要通过后，
才显示公开资源已更新；不会伪造 GitHub Pages 构建任务状态。

尚缺实际 AUTH OAuth/App 网关和 GITHUB App 安全代理的实现/接入、平台绑定、
Secrets、允许的 HTTPS origin、前端发布端点及 Pages 流程。
没有真实授权配置时按钮保持禁用；本轮未创建不安全的 PAT 替代流程。
不在前端、localStorage、仓库保存 PAT、Client Secret、App 私钥或 OAuth token。

## 单体测试

直接执行 Node，不启动浏览器/服务器，不进行真实网络：

    node turn-beans/region-processing-tests.js
    node turn-beans/palette-policy-tests.js
    node turn-beans/color-processing-tests.js
    node turn-beans/bead-grid-tests.js
    node turn-beans/subject-extraction-tests.js
    node turn-beans/image-processing-tests.js
    node turn-beans/level-generator-tests.js
    node turn-beans/generator-ui-tests.js
    node turn-beans/level-library-tests.js
    node turn-beans/publisher-tests.mjs
    node turn-beans/publisher-ui-tests.js
    node turn-beans/engine-tests.js
    node turn-beans/levels-tests.js
    node turn-beans/auto-fill-tests.js
    node turn-beans/save-codec-tests.js
    python scripts/verify.py

工坊/库/发布相关 140 项通过：颜色 13、豆阵识别 13、主体 14、图片 9、生成器 15、工坊 UI 23、色数策略 10、区域 12、
公开库/统一文档 13、发布接口 13、发布 UI 5。
原引擎 39 项通过；原六关原生解法与附加轮廓检查全部通过（levels-tests 实际 10 项，
其旧脚本在前三个附加测试之前输出“7 levels tests passed”）。
自动补空与存档单体通过；统一 verify 为 VERIFY OK。
运行文件均经过 node --check。测试中的所有 HTTP、OAuth/App 与 GitHub 服务都是内存替身。

测试覆盖：行长/高度严格校验、同一 target、mask、颜色守恒、数据往返、伪造 verified、
管理员拒绝、来源/CSRF、覆盖确认、旧版本/目录冲突、并发写入、按需加载、
缓存失效、跨读取器一致性，以及提交/部署/上线状态区分。

## 仍然存在的验收边界

- 未运行真实 OAuth、GitHub 写入、Cloudflare 构建/部署、Pages、多设备或浏览器 E2E。
- Worker 回放的 CPU/内存配额、限流和平台配置需在后续实际部署前确认。
- 低对比度、复杂背景及与主体相连的文字/彩纸可能误识别，需调整容差或裁剪；
  缩小取景会永久裁掉主体外部分，算法不能恢复这些部分。
- 大图案在 file:// 主线程兼容模式或云端回放时可能短暂停顿。
- 旧 UI 静态套件有 6 组基线失败：ui-performance、ui-phase14、ui-phase17、
  ui-static、ui-timing、ui-visual；其断言针对旧动画或预览文案，本轮未修这些历史测试。
