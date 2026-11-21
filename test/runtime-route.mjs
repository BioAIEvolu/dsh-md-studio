// 运行时资源路由的安全回归：同源放行、跨站 403、无 Sec-Fetch-Site 的 CLI 放行、
// 目录穿越与非法方法拒绝。直接调用导出的 handler，不需要起 DSH。
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRuntimeHandler } from '../src/host.js';

const dir = await mkdtemp(join(tmpdir(), 'mds-route-'));
await writeFile(join(dir, 'mermaid.mjs'), 'export const version = "11";\n');

const handler = createRuntimeHandler(dir);
const makeRes = () => ({
  status: 0,
  headers: {},
  body: undefined,
  writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers || {}); },
  end(body) { this.body = body; },
});

async function call(path, headers = {}, method = 'GET') {
  const res = makeRes();
  await handler({ method, url: `/dsh-md-studio/runtime/${path}`, headers }, res);
  return res;
}
const sameOrigin = { 'sec-fetch-site': 'same-origin' };
const checks = [];

// 1. 同源加载正常返回，并带上安全头
const ok = await call('mermaid.mjs', sameOrigin);
assert.equal(ok.status, 200);
assert.equal(ok.headers['content-type'], 'text/javascript; charset=utf-8');
assert.equal(ok.headers['x-content-type-options'], 'nosniff');
assert.equal(ok.headers['cross-origin-resource-policy'], 'same-origin');
assert.match(String(ok.body), /export const version/);
checks.push('same-origin asset 200 + nosniff + CORP');

// 2. 跨站网页请求必须被拒绝（维护者在市场条目里点名的那个探测面）
const cross = await call('mermaid.mjs', { 'sec-fetch-site': 'cross-site' });
assert.equal(cross.status, 403);
assert.equal(cross.body, undefined);
assert.equal(cross.headers['cache-control'], 'no-store');
checks.push('cross-site 403');

// 3. 非浏览器客户端（无 Sec-Fetch-Site，如 curl/离线自检）仍可用
assert.equal((await call('mermaid.mjs', {})).status, 200);
checks.push('no Sec-Fetch-Site allowed');

// 4. HEAD 只回头部
const head = await call('mermaid.mjs', sameOrigin, 'HEAD');
assert.equal(head.status, 200);
assert.equal(head.body, undefined);
checks.push('HEAD has no body');

// 5. 目录穿越（编码与原文两种）都拒绝
for (const path of ['%2e%2e%2fpackage.json', '%2e%2e/%2e%2e/package.json']) {
  const res = await call(path, sameOrigin);
  assert.equal(res.status, 404, path);
}
checks.push('path traversal 404');

// 6. 不存在的资源、非 GET/HEAD 方法
assert.equal((await call('nope.js', sameOrigin)).status, 404);
checks.push('missing asset 404');
const post = await call('mermaid.mjs', sameOrigin, 'POST');
assert.equal(post.status, 405);
assert.equal(post.headers.allow, 'GET, HEAD');
checks.push('POST 405');

await rm(dir, { recursive: true, force: true });
console.log(JSON.stringify({ passed: true, checks }, null, 2));
