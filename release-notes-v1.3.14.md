# v1.3.14 — 运行时资源路由加固：跨站网页不再能调用本地路由

## 安全

- **`/dsh-md-studio/runtime` 拒绝跨站调用**：浏览器发出的 `Sec-Fetch-Site: cross-site` 请求现在返回 **403**（`Cache-Control: no-store`），应用自身的同源/同站加载不受影响；没有该请求头的 CLI/离线自检（curl 等）仍然可用。
- **浏览器侧封堵跨源嵌入**：响应新增 `Cross-Origin-Resource-Policy: same-origin`，恶意网页用 `<img>` / `<script>` / 字体等方式加载该路由的资源，会在浏览器里直接失败。
- **补充 `X-Content-Type-Options: nosniff`**，避免内容被嗅探成可执行类型。
- **新增安全回归测试** `test/runtime-route.mjs`：同源 200、跨站 403、目录穿越 404、非 GET/HEAD 405、HEAD 无 body，已接入 CI。

> 该路由只服务包内 `runtime` 静态资源（mermaid/KaTeX/字体，内容等同 npm 公开包），不涉及用户文件；本次加固关闭的是"任意网页可探测/调用本地服务"这一面。

## 系统提示

- 图表指南补第 3 条硬规则：每个 `<text>` 必须自带 `fill`（不要只写在 `<g>` 上、更不依赖主题默认值）；浅色芯片禁止白字/浅字，正文对比度 ≥4.5:1，文字 opacity ≥0.85。

## 升级建议

- 升级后无需改配置；若通过 vibe 安装，DSH 会重启 host 半以加载新的路由策略。

---

⭐ 如果这个插件帮你把图看清了，欢迎给 [dsh-md-studio](https://github.com/BioAIEvolu/dsh-md-studio) 点个 Star。
