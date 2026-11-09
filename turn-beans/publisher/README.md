# GitHub 发布接口：未配置、未部署

当前仓库未发现安全登录/发布后端。这里提供可单体测试的 Cloudflare Worker 入口和
Git Data 适配器；**没有实现或部署真实 OAuth/App 网关**。默认 ENABLED=false，
前端 publish-config.js 的 endpoint 为空，发布按钮禁用。

## 必须补齐的服务与配置

1. 实现或接入真实 AUTH 服务（Cloudflare Service Binding）。
   - GitHub OAuth 登录或 GitHub App 用户授权；回调 URL 固定。
   - 校验 state/PKCE，服务端交换 code 并通过 GitHub 验证用户身份。
   - 使用签名且有到期时间的 HttpOnly、Secure 会话 Cookie，跨域时正确配置 SameSite。
   - 服务端保存会话与 CSRF token；禁止把 OAuth token 放到前端或 localStorage。
   - GET /session 只对 Worker 的私有服务绑定开放，返回
     { login, csrfToken, expiresAt }；未登录返回 401。
   - /auth/login、/auth/callback 由 Worker 转发至 AUTH，网关必须限制回跳地址，
     不得接受任意 redirect URL；登出与会话撤销由该网关负责。
2. 实现或接入私有 GITHUB 服务绑定。
   - 收到 Worker 发往 https://api.github.com/repos/VvSpicesh/nocturne-games/... 的请求后，
     加入短期 GitHub App installation token，再转发 GitHub API。
   - 必须独立限制 owner/repo、允许的方法与 Git Data/contents/permission 路径，
     禁止成为任意 URL 代理。服务绑定不得作为匿名公网代理暴露。
   - GitHub App 仅安装到本仓库，授予必要的 Contents read/write 与用户仓库权限查询能力；
     根据 GitHub 当前 App 权限配置验证权限接口可用，缺少权限时拒绝发布。
3. OAuth Client ID/Secret（如使用 OAuth）、App ID、Installation ID、App 私钥、
   会话签名密钥及 token 全部只放入平台 Secrets 或可信服务的私有存储。
   本仓库不包含它们，也不提供 PAT 前端替代方案。
4. 配置 PUBLIC_ORIGIN 为精确 HTTPS origin；配置可信 AUTH/GITHUB 绑定，
   再将 ENABLED 设为 true。wrangler.example.toml 默认未启用公网 route。
5. 由管理员另行配置 Pages 构建/发布流程，并在前端 publish-config.js 填入
   已配置的 HTTPS Worker origin。只有完成上述条件才允许启用实际发布。

本任务没有创建这些外部服务、OAuth/App 注册、Secrets、Git commit 或部署。
文件协议页面仅用于本地生成；授权发布应从允许的 HTTPS 网站发起。

## 接口与拒绝路径

- GET /capabilities：检查绑定、会话及 GitHub 返回的真实 admin 权限。
  未配置返回 configured:false；授权不足不能获得发布能力。
- POST /publish：
  { document, expectedRevision, confirmOverwrite, expectedVersion? }。
  检查 Origin、会话、CSRF、大小上限、完整 schema、三档真实引擎回放、颜色守恒。
  忽略客户端角色断言，不把客户端 verified 当作证据。
- 新 ID 必须 version=1，目录记录与实际关卡文件都不能已存在。
- 更新必须 confirmOverwrite=true、expectedVersion=旧版本、version=旧版本+1。
  保留原创建时间；时间不能倒退。目录 revision 不一致返回 409。
- 写入 owner/repo/branch 固定为 VvSpicesh/nocturne-games/main，无法通过请求更改。
  仅允许 turn-beans/level-library/index.json 及 levels/{id}.json。
- 读取基线 commit，在同一 Git tree/commit 写入关卡和索引，
  以 force:false 更新引用；并发冲突返回 409，不强推、不自动重试覆盖。
  失败可能留下不可达的 Git 对象，但不会使分支只出现一半文件。

成功响应只表示 Git 提交完成，deployment=pending、online=unconfirmed。
“检查公开版本”会独立从匿名静态目录检查版本/摘要并回放验证；
它不会把 GitHub 提交等同于 Pages 构建成功，也没有伪造构建状态。

## 运行与验证边界

仅执行 Node 单体测试，AUTH/GITHUB 接口全部用内存假的服务替换：
node turn-beans/publisher-client-tests.js
node turn-beans/publisher-tests.mjs
node turn-beans/publisher-ui-tests.js

没有真实网络、OAuth 登录、GitHub 写入、Cloudflare 打包或部署验收。
引擎回放耗费 CPU，部署前须评估平台 CPU 配额、内存、管理员请求限流及费用，
不得假设免费 Worker 配额可以承载较大关卡验证。业务不新增 npm 依赖。

设计参考（官方文档，非实际网络测试）：
- https://docs.github.com/en/rest/git/refs#update-a-reference
- https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

## 2026-11-09：“检查授权”点击反馈修复

当前 publish-config.js 的 endpoint 仍为空，没有接入或部署真实 OAuth/App 授权服务。
旧按钮点击后只是再次显示同一条“尚未配置”文字，用户看不到明确的完成反馈。

本次更新 publisher-ui.js、publisher-client.js、publisher-ui-tests.js，新增 publisher-client-tests.js：

- 每次检查显示编号、检查中和明确结果；按钮检查期间禁用，重复点击共享当前检查。
- 未配置时明确提示需先配置授权发布服务，图片生成和 JSON 导出仍可使用。
- 配置错误、未登录、网络异常、超时和响应格式错误均有可见结果；失败后允许重试。
- 默认检查期限 10 秒，包括响应 JSON 读取；超时中止请求，恢复按钮。
- 新检查期间旧授权失效，较旧请求晚返回不能覆盖最新拒绝；配置和管理员权限均有效才允许发布。
- 云端目录读取器按需创建，目录模块的初始化不会阻止授权检查按钮绑定。
- 不改 publish-config.js，不保存任何授权密钥到前端或存储，不发起真实授权/网络请求。

“检查授权”用于读取现有会话和发布服务状态。
配置完成但尚未登录时，使用独立的“GitHub 管理员登录”链接完成登录，再返回检查授权。
要实际登录/上传，仍须完成本文件前面的 AUTH、GITHUB 服务绑定及端点配置；本次没有部署这些服务。

本次本地单体：客户端 10、发布 UI 9、发布接口 13、生成器 UI 23，共 55 项通过；
scripts/verify.py 为 VERIFY OK。网络、OAuth/GitHub 与 DOM/Worker 全部由内存替身测试。
未进行浏览器或真实网络验收，未 commit、push 或部署。
