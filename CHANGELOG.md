# Changelog

本项目所有显著变更都记录在此文件中。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循语义化版本。

## [1.1.1] - 2026-10-09

### 新增

- **Mermaid 语法自动修复**：首次渲染失败时，对 flowchart/graph 源做一次保守修复重试——为含英文括号的节点标签与边标签自动加引号（如 `W2[Codex / Claude Code (ACP)]`），成功后徽章显示"已自动修复"；图形/圆柱等特殊形状括号不受影响。真实世界文档（如含 `(ACP)`、`(IM/Web)` 的架构图）无需改动原文即可渲染。
- 渲染失败提示补充常见错误说明；错误信息移到卡片工具栏下方，长源码时更易发现。

### 修复

- 测试脚本跨平台浏览器探测（Windows/macOS/Linux 系统浏览器与 Playwright 缓存），CI 可用。

## [1.1.0] - 2026-10-09

### 重写

- **接入方式重构**：不再创建独立预览面板或接管对话产物卡片，改为直接接管 DSH **原生右侧文件预览**的 Markdown 渲染器（`sidebar.right.tab.document` 插槽，官方 key，`priority: -100`）。文件读取、权限校验、分页累积、刷新、标签页生命周期全部保留 DSH 原生行为。
- **完全离线**：Mermaid 11.17、markdown-it、DOMPurify、highlight.js、KaTeX 与公式字体全部随包内置，渲染过程零网络请求。

### 新增

- KaTeX 行内 `$...$` 与块级 `$$...$$` 数学公式。
- 脚注（markdown-it-footnote）、任务列表、GFM 表格、标题锚点与文内跳转。
- Mermaid 图表卡片：图形/源码切换、全屏（缩放/拖拽）、下载 SVG、语法错误保留源码并给出原因。
- 代码高亮（highlight.js common 语言集）。
- 深浅主题跟随 DSH 主题自动重绘图表。
- 相对路径图片按文档目录解析，经 DSH 原生鉴权文件接口（`api/file`）读取。
- 文档级“查看源码”切换。

### 安全

- HTML 经 DOMPurify 净化：禁执行 `<script>`/`<iframe>` 等标签与事件属性；Mermaid 输出单独净化；`securityLevel: 'strict'`。
- 本地图片仅接受绝对路径或文档同目录相对路径，拒绝协议相对与控制字符。

### 修复（相对 1.0.0）

- 修复流程图节点文字被 SVG 净化误删的问题（`htmlLabels: false`）。
- 修复深色主题下表格文字对比度不足。
- 修复快速连续打开文件时的陈旧渲染竞态（渲染中止 + 卸载清理）。

### 测试

- 新增真实浏览器自动化测试（`node test/browser.mjs`）：加载与发布一致的 bundle，验证 14 项能力，断言零外部网络请求、零页面异常。
- 新增截图脚本（`node test/screenshots.mjs`）。

### 兼容性

- 适配 DSH `0.2.0-rc.2` 客户端插槽 API；`engines.dsh` 声明 `>=0.2.0-rc.2 <0.3.0-0`。旧版 0.1.x 未验证。

## [1.0.0] - 2026-10-08

首个内部版本：独立分屏预览面板 + 对话内 Mermaid 增强 + 产物卡片行（整合 dsh-mermaid 与 dsh-artifact-preview 思路）。已被 1.1.0 的原生接入方案取代，不再维护。
