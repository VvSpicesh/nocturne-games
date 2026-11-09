# 静态公开关卡库

index.json 是目录；levels/{id}.json 是单张目标及 easy/medium/hard 三档。
subject-demo 是已验证的区域换色示例，首次随网站发布；原始 target 不变。内置原六关仍在 levels.js。

公开读取无需登录。不同设备通过同一已发布网站读取相同的静态目录；
页面启动、切回标签页或“刷新云端目录”时重新读取。没有用户专属目录。

目录使用严格 schemaVersion、revision、updatedAt、唯一 id、固定相对路径、
关卡 version、SHA-256。读取 no-store，关卡 URL 带 version/digest；
内存缓存按 id/version/digest 区分，目录变化淘汰旧缓存。
JSON 不属于现有根 Service Worker 的 stale-while-revalidate 资源类型。
目录与资源 CDN 更新不同步时会拒绝摘要不匹配内容并提示重试，不降级为可玩。

空目录、HTTP 错误、网络中断、格式错误分别提示。加载失败不影响内置六关。
file:// 无法读取云目录，页面明确提示，仍可使用内置六关和本地图片生成器。

统一文档由 level-document.js 严格校验：
- schemaVersion:1，id/name/width/height/palette/version/metadata。
- palette 使用 A–Z、a–z、0–9、- 单字符到 #RRGGBB 的映射，最多 63 色以兼容既有存档；'.' 只代表 inactive。16 色是推荐值，旧 A–P 编码不变。
- target.rows 是唯一正确目标，行数及每行长度必须与尺寸完全一致。
- variants.easy/medium/hard 各含 initialRows、solution、verified、statistics，
  不允许单独定义或改变 target。
- source、创建/更新时间、生成器版本和自动补空回放模式记录在 metadata。
- 真实 TurnBeansEngine 必须回放成功、目标全部正确、三盘清空；
  调色板、主体 mask、每色数量、所有统计必须匹配重算结果。
- statistics 的换色率分母仅为 active cells，verified:true 不能绕过验证。

新导出使用 generatorVersion=phase26.3，statistics 严格记录及重算错色区域、碎块比例、配对连通块分布，并执行区域质量检查。
旧 phase26.2 文件继续按原统计契约与真实引擎回放读取，不重写旧库数据。
原生成器旧 JSON 的 parseJSON/exportJSON 保留用于兼容测试；
工坊下载、公开库与发布接口使用新的统一文档。失败版本禁止统一导出或发布。

游戏存档 ID 包含关卡 ID、版本、难度，更新版本不复用旧关卡进度。
现有存档仍执行原 canonical initialBoard 对比，内置六关不改数据或解法。

本地单体：
node turn-beans/level-library-tests.js

未运行真实网络、浏览器或多台设备联调；这里验证的是读取逻辑和相同数据源的契约。
