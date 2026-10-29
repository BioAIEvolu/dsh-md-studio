// dsh-md-studio host half (source of truth; build script copies to lib/index.js).
//
// 1. Serves an optional vendored mermaid runtime from ./runtime (offline mode).
// 2. Registers a system-prompt section teaching the model how to emit
//    ```mds-diagram blocks — model-authored SVG widgets rendered by the
//    browser half into themed cards (the WorkBuddy "show_widget" pattern).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, normalize, sep } from "node:path";

const name = "dsh-md-studio";
const inject = ["webServer", "systemPrompt"];

const RUNTIME_ROUTE = "/dsh-md-studio/runtime";
const runtimeDir = fileURLToPath(new URL("./runtime", import.meta.url));

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const GUIDELINE = `## 图表组件（mds-diagram）

当需要输出高质量示意图、流程图、架构分层图或对比图时，优先使用 \`\`\`mds-diagram 围栏（而非 mermaid），内容为一个完整的手写 SVG。渲染环境会自动套用主题卡片并净化内容。

设计规范（深浅主题通吃）：
- 根元素：<svg viewBox="0 0 W H" width="100%" font-family="system-ui,sans-serif">，不设背景色
- 节点填充主色 #3B82F6（白字），强调/辅助 #8B5CF6，成功 #10B981，警告 #F59E0B，危险 #EF4444
- 连接线 #94A3B8，文字 fill 白色（在实色节点上）或 #1F2937（在浅底上）
- 圆角 rect rx=8~10，节点内边距 ≥12px，字号 13~15px
- 分组/分层容器用半透明底色 rgba(59,130,246,.08) + 描边 rgba(59,130,246,.35)
- 编号用圆形 badge（circle + 白色居中数字）
- 箭头用 <marker> 定义，id 唯一
- 在 <svg> 内放 <title> 描述图表用途（作为卡片标题）
- 每个文本元素显式设 fill；不要依赖默认继承

仅在图表有明确结构化表达价值时使用；简单流程继续用 mermaid 围栏。`;

function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: RUNTIME_ROUTE,
        async handler(req, res) {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          const url = new URL(req.url ?? "/", "http://dsh.invalid");
          let rel;
          try {
            rel = decodeURIComponent(url.pathname.slice(RUNTIME_ROUTE.length));
          } catch {
            res.writeHead(400);
            res.end();
            return;
          }
          rel = rel.replace(/^\/+/, "");
          if (!rel || rel.includes("..") || rel.includes("\0") || rel.includes("\\") || /[:*?"<>|]/.test(rel)) {
            res.writeHead(404);
            res.end();
            return;
          }
          const root = normalize(runtimeDir);
          const target = normalize(join(root, rel));
          if (target !== root && !target.startsWith(root + sep)) {
            res.writeHead(404);
            res.end();
            return;
          }
          try {
            const body = await readFile(target);
            const dot = target.lastIndexOf(".");
            const ext = dot === -1 ? "" : target.slice(dot).toLowerCase();
            res.writeHead(200, {
              "content-type": MIME[ext] ?? "application/octet-stream",
              "cache-control": "public, max-age=86400",
            });
            res.end(req.method === "HEAD" ? undefined : body);
          } catch {
            res.writeHead(404);
            res.end();
          }
        },
      }),
    "dsh-md-studio: vendored runtime route",
  );
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: "mds-diagram-guidelines",
      order: 5200,
      text: GUIDELINE,
    }),
    "dsh-md-studio: diagram design guidelines",
  );
}

export { apply, inject, name };
