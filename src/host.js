// dsh-md-studio host half.
//
// 1. Serves an optional vendored mermaid runtime from ./runtime (offline mode).
// 2. Registers a system-prompt section teaching the model the mds-diagram
//    fence and the theme-variable text rule (the full drawing spec ships as
//    the mds-diagram-design skill, installed below).
// 3. Installs the bundled drawing-spec skill into the user skills root
//    (~/.agents/skills/mds-diagram-design) so any model can load it on demand;
//    refresh on version change, and uninstall only if the content is still
//    ours (never delete user edits).

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, normalize, sep, dirname } from "node:path";
import { homedir } from "node:os";

const name = "dsh-md-studio";
const inject = ["webServer", "systemPrompt"];

const RUNTIME_ROUTE = "/dsh-md-studio/runtime";
const runtimeDir = fileURLToPath(new URL("./runtime", import.meta.url));
const SKILL_NAME = "mds-diagram-design";
const skillSrcDir = fileURLToPath(new URL("../skills/mds-diagram-design", import.meta.url));
const skillDstDir = join(homedir(), ".agents", "skills", SKILL_NAME);

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

需要画架构图/流程图/示意图时，优先用 \`\`\`mds-diagram <可选标题> 围栏输出手写 SVG（简单流程继续用 mermaid 围栏）。完整绘图规范（色板/布局/关系表达/自查清单）请用 skill 工具加载 **mds-diagram-design** skill 后遵循。

必须遵守的三条硬规则：
1. 画布级文字（图例、分组标签）用主题变量：style="fill:var(--dsw-alias-label-primary,#1F2937)"——禁止硬编码深灰，深色模式下会不可见。
2. 节点用浅色底+深色字（蓝 #B5D4F4/#0C447C，橙 #FAC775/#633806，绿 #9FE1CB/#085041，紫 #CECBF6/#3C3489），全图最多 4 种语义色，≥3 种时必须有图例。
3. 根元素 <svg viewBox="0 0 W H" width="100%" font-family="system-ui,sans-serif">，内放 <title>（作为卡片标题），箭头 marker id 加随机后缀防冲突。`;

async function installSkill() {
  const srcFile = join(skillSrcDir, "SKILL.md");
  const dstFile = join(skillDstDir, "SKILL.md");
  let src;
  try { src = await readFile(srcFile); } catch { return () => {}; } // skill not bundled — noop
  let dst;
  try { dst = await readFile(dstFile); } catch { /* not installed yet */ }
  if (dst && dst.equals(src)) return () => {}; // already current
  await mkdir(dirname(dstFile), { recursive: true });
  await writeFile(dstFile, src);
  return async () => {
    // Uninstall only if the file is still exactly what we installed.
    try {
      const cur = await readFile(dstFile);
      if (cur.equals(src)) await rm(skillDstDir, { recursive: true, force: true });
    } catch { /* already gone */ }
  };
}

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
  let uninstall = () => {};
  let disposed = false;
  ctx.effect(() => {
    installSkill().then((fn) => { if (disposed) fn(); else uninstall = fn; }).catch(() => {});
    return () => { disposed = true; uninstall(); };
  }, "dsh-md-studio: skill install");
}

export { apply, inject, name };
