import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { findChromium } from './browser-path.mjs';
const root = resolve(import.meta.dirname, '..');
const executablePath = await findChromium();
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1060, height: 980 }, acceptDownloads: true });
const errors = [], network = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', route => { network.push(route.request().url()); return route.abort(); });
await page.setContent('<html lang="zh-CN"><head></head><body style="margin:0"><main id="preview"></main></body></html>');
await page.addScriptTag({path: resolve(root, 'test/react-runtime.js')});
await page.evaluate(() => {
  window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } };
});
await page.addScriptTag({path: resolve(root, 'lib/client.js')});
const registration = await page.evaluate(() => {
  const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('Undeclared module '+spec); });
  window.__effects = [];
  window.__slot = null;
  const ctx = { effect(fn) { const d = fn(); if (typeof d === 'function') window.__effects.push(d); return d; }, slots: {
    inject(name, fn) { if (name !== 'sidebar.right.tab.document') throw new Error('Wrong slot '+name); const d = fn(); window.__effects.push(d); return d; },
    register(options, component) { window.__slot = {options,component}; return () => { window.__slot = null; }; }
  }};
  mod.apply(ctx);
  window.__root = window.__testCreateRoot(document.querySelector('#preview'));
  window.__render = (text, eof = true) => window.__root.render(window.__testReact.createElement(window.__slot.component, {
    content: {kind:'text', text, pages:[], eof}, resourceAddress:'file:demo', useResource: () => ({value:{absolutePath:'D:/demo.md'}})
  }));
  return { id: window.__registration.id, options: window.__slot.options, status: window.__dshMdStudio };
});
assert.equal(registration.id, 'dsh-md-studio');
assert.equal(registration.options.key, '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown');
const sample = `# 原生右侧 Markdown 预览验证\n\n| 项目 | 状态 |\n|---|---|\n| 离线图表 | 是 |\n\n- [x] 已完成\n- [ ] 待完成\n\n脚注示例[^one]\n\n[^one]: 说明正文\n\n质能关系 $E=mc^2$。\n\n$$\ne^{i\\pi}+1=0\n$$\n\n\`\`\`js\nconst answer = 42;\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n A[打开文件] --> B[右侧预览] --> C[本地渲染]\n\`\`\`\n\n\`\`\`mermaid\nsequenceDiagram\n 用户->>DSH: 打开 Markdown\n DSH-->>用户: 显示图表\n\`\`\`\n\n\`\`\`mermaid\ngantt\n title 验证计划\n dateFormat YYYY-MM-DD\n section 验证\n 渲染 :done, a1, 2026-10-08, 1d\n\`\`\`\n\n\`\`\`mermaid\npie title 能力\n "文档" : 60\n "图表" : 40\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n W2[Codex / Claude Code / KimiCode / OpenCode (ACP)] --> W1[DSH Native]\n\`\`\`\n`;
await page.evaluate(text => window.__render(text), sample);
await page.waitForSelector('.mds-document[data-state="ready"]', {timeout:60000});
// Perf regression: content.eof is not a render input (the render only reads
// content.text), so flipping it on identical text must not rebuild the document
// or re-lay out its Mermaid diagrams.
await page.evaluate(text => window.__render(text, false), sample);
await page.waitForTimeout(300);
const rendersBeforeEofFlip = await page.evaluate(() => window.__dshMdStudio.documents);
await page.evaluate(text => window.__render(text, true), sample);
await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => window.__dshMdStudio.documents), rendersBeforeEofFlip, 'eof flip must not rebuild the document');
assert.equal(await page.locator('.mds-diagram[data-state="ok"] svg').count(), 5);
assert.ok((await page.locator('.mds-diagram').first().locator('svg').textContent()).includes('打开文件'), 'flowchart SVG must retain visible node labels');
assert.equal(await page.locator('.mds-badge', { hasText: '已自动修复' }).count(), 1, 'parenthesised node label must be auto-repaired');
// Mermaid renders long labels as positioned tspans; concatenated text may drop
// inter-word spaces, so compare whitespace-insensitively.
assert.ok((await page.locator('.mds-diagram[data-state="ok"] svg').last().textContent()).replace(/\s+/g, '').includes('OpenCode(ACP)'), 'repaired label must keep its text');
assert.equal(await page.locator('.mds-document table').count(), 1);
assert.equal(await page.locator('.mds-document input[type="checkbox"]').count(), 2);
assert.equal(await page.locator('.mds-document .footnotes').count(), 1);
assert.equal(await page.locator('.mds-document .katex').count(), 2);
assert.ok(await page.locator('.mds-document .hljs-keyword').count());
const first = page.locator('.mds-diagram').first();
await first.getByRole('button', {name:'源码',exact:true}).click();
assert.equal(await first.locator('pre').isVisible(), true);
await first.getByRole('button', {name:'图形',exact:true}).click();
assert.equal(await first.locator('svg').isVisible(), true);
await first.getByRole('button', {name:'全屏',exact:true}).click();
assert.equal(await page.locator('dialog').isVisible(), true);
await page.locator('dialog').getByRole('button', {name:'关闭',exact:true}).click();
const downloadPromise = page.waitForEvent('download');
await first.getByRole('button', {name:'下载 SVG',exact:true}).click();
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), 'diagram.svg');
await mkdir(resolve(root, 'test/artifacts'), {recursive:true});
await download.saveAs(resolve(root, 'test/artifacts/diagram.svg'));
await page.screenshot({path:resolve(root,'test/artifacts/native-preview-light.png'),fullPage:true});
await page.evaluate(() => {
  document.body.style.background = '#17191d';
  document.body.style.setProperty('--dsw-alias-label-primary', '#e6edf3');
  document.body.style.setProperty('--dsw-alias-bg-layer-2', '#24282f');
  document.body.setAttribute('data-ds-dark-theme','');
});
await page.waitForFunction(() => window.__dshMdStudio.diagrams >= 10);
await page.screenshot({path:resolve(root,'test/artifacts/native-preview-dark.png'),fullPage:true});
await page.getByRole('button', {name:'查看源码',exact:true}).click();
assert.ok((await page.locator('.mds-raw-document').textContent()).includes('flowchart LR'));
await page.getByRole('button', {name:'阅读文档',exact:true}).click();
await page.waitForSelector('.mds-document[data-state="ready"]');
// Regression: invalid diagrams retain source and an error, while other blocks still render.
await page.evaluate(text => window.__render(text), sample + '\n```mermaid\nnot-a-valid-diagram\n```\n<script>window.__injected=true</script><img src="x" onerror="window.__injected=true">');
await page.waitForSelector('.mds-document[data-state="partial"]');
assert.equal(await page.locator('.mds-diagram[data-state="error"]').count(), 1);
assert.equal(await page.locator('.mds-diagram[data-state="ok"]').count(), 5);
assert.equal(await page.evaluate(() => !!window.__injected), false);
// Regression: rapid file changes never display a stale diagram result.
await page.evaluate(() => { window.__render('# Replacement\n\nOnly this new file.'); });
await page.waitForSelector('.mds-document[data-state="ready"]');
assert.equal(await page.locator('.mds-diagram').count(), 0);
assert.ok((await page.locator('.mds-document').textContent()).includes('Replacement'));
// Render the actual file the user opens in the right sidebar, not only the synthetic fixture.
const userDemo = await readFile(resolve(root, '../dsh-md-studio-demo.md'), 'utf8');
await page.evaluate(text => window.__render(text), userDemo);
await page.waitForSelector('.mds-document[data-state="ready"]', { timeout: 60000 });
assert.equal(await page.locator('.mds-diagram[data-state="ok"] svg').count(), 4, 'actual demo must render all four diagrams');
assert.ok((await page.locator('.mds-diagram').first().locator('svg').textContent()).includes('打开 Markdown 文件'));
await page.screenshot({ path: resolve(root, 'test/artifacts/user-demo-dark.png'), fullPage: true });
// TODO(v1.3.1): add mds-diagram widget test — the fence + hydration pipeline works
// (verified via build + manual test) but the test harness needs a proper React
// re-render sequencing fix for the assertion to be reliable.

// --- v1.2: conversation-side (chat) Mermaid rendering ---
// Simulate the official chat DOM: plain pre>code without a language class,
// placed OUTSIDE the document-preview root, like chat messages are.
await page.evaluate(() => {
  window.__chat = document.createElement('div');
  window.__chat.id = 'chat-simulator';
  document.body.appendChild(window.__chat);
});
await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<pre><code>flowchart LR\n    X[聊天图表] --> Y[渲染成功]\n</code></pre>';
  window.__chat.appendChild(wrap);
});
await page.waitForSelector('#chat-simulator .mds-diagram[data-state="ok"] svg', { timeout: 60000 });
assert.ok((await page.locator('#chat-simulator svg').textContent()).replace(/\s+/g, '').includes('聊天图表'), 'chat diagram must render with its labels');
// No double-rendering: the document-preview root must keep exactly its own 4 cards.
assert.equal(await page.locator('[data-mds-root] .mds-diagram').count(), 4, 'document preview must not be re-carded by the chat watcher');
// Streaming: text settles after rapid updates -> exactly one card with the final content.
await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<pre><code>flowchart TD</code></pre>';
  window.__chat.appendChild(wrap);
  const code = wrap.querySelector('code');
  code.textContent = 'flowchart TD\n A[第一] --> B';
  setTimeout(() => { code.textContent = 'flowchart TD\n A[第一] --> B[第二] --> C[流式完成]'; }, 120);
  setTimeout(() => { code.textContent = 'flowchart TD\n A[第一] --> B[第二] --> C[流式完成]\n C --> D[稳定输出]'; }, 240);
});
await page.waitForFunction(() => {
  const cards = document.querySelectorAll('#chat-simulator .mds-diagram');
  return cards.length === 2 && [...cards].every(c => c.dataset.state === 'ok');
}, { timeout: 60000 });
assert.ok((await page.locator('#chat-simulator svg').last().textContent()).replace(/\s+/g, '').includes('稳定输出'), 'streamed chat diagram must show final content');
assert.equal(await page.locator('#chat-simulator .mds-diagram').count(), 2, 'streaming must produce exactly one card per block');
// v1.3.2 regression: a bare SVG block (NO fence language) must render as a widget card.
await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<pre><code>' +
    '&lt;svg viewBox="0 0 300 80" width="100%" font-family="system-ui,sans-serif"&gt;\n' +
    '  &lt;title&gt;架构总览&lt;/title&gt;\n' +
    '  &lt;rect x="10" y="20" rx="8" width="120" height="40" fill="#3B82F6"/&gt;\n' +
    '  &lt;text x="70" y="46" text-anchor="middle" fill="#fff" font-size="13"&gt;前端&lt;/text&gt;\n' +
    '  &lt;rect x="170" y="20" rx="8" width="120" height="40" fill="#8B5CF6"/&gt;\n' +
    '  &lt;text x="230" y="46" text-anchor="middle" fill="#fff" font-size="13"&gt;后端&lt;/text&gt;\n' +
    '&lt;/svg&gt;' +
    '</code></pre>';
  window.__chat.appendChild(wrap);
});
await page.waitForSelector('#chat-simulator .mds-widget .mds-widget-body svg', { timeout: 60000 });
assert.ok(await page.locator('#chat-simulator .mds-widget-title:has-text("架构总览")').count(), 'bare SVG block must become a widget card with its <title>');
assert.equal(await page.locator('#chat-simulator .mds-widget script, #chat-simulator .mds-widget foreignObject').count(), 0, 'widget card must stay sanitized');
// Non-diagram code blocks must remain untouched by the watcher.
await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<pre><code>const x = 1;\nconsole.log(x);</code></pre>';
  window.__chat.appendChild(wrap);
});
await page.waitForTimeout(1200);
assert.equal(await page.locator('#chat-simulator .mds-widget').count(), 1, 'plain code must not become a widget');
assert.equal(await page.locator('#chat-simulator pre:not([hidden])').filter({ hasText: 'const x = 1' }).count(), 1, 'plain code block stays visible');
// Theme flip: chat cards re-render and stay ok (light -> back to dark).
await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
await page.waitForFunction(() => window.__dshMdStudio.diagrams >= 16);
assert.equal(await page.locator('#chat-simulator .mds-diagram[data-state="ok"] svg').count(), 2);
await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
await page.waitForFunction(() => window.__dshMdStudio.diagrams >= 18);
// v1.3.2: document-side widget — explicit mds-diagram fence AND bare-svg fence both hydrate.
await page.evaluate(text => window.__render(text), [
  '## 组件图',
  '',
  '```mds-diagram 分层架构',
  '<svg viewBox="0 0 320 90" width="100%" font-family="system-ui,sans-serif">',
  '  <title>分层架构</title>',
  '  <rect x="10" y="22" rx="8" width="130" height="44" fill="#3B82F6"/>',
  '  <text x="75" y="50" text-anchor="middle" fill="#fff" font-size="14">表现层</text>',
  '  <rect x="180" y="22" rx="8" width="130" height="44" fill="#8B5CF6"/>',
  '  <text x="245" y="50" text-anchor="middle" fill="#fff" font-size="14">数据层</text>',
  '</svg>',
  '```',
  '',
  '```',
  '<svg viewBox="0 0 200 60" width="100%"><title>裸围栏</title><rect x="10" y="10" rx="8" width="180" height="40" fill="#10B981"/><text x="100" y="36" text-anchor="middle" fill="#fff" font-size="13">无语言</text><text x="100" y="54" text-anchor="middle" font-size="12">无填充兜底</text></svg>',
  '```',
].join('\n'));
await page.waitForSelector('[data-mds-root] .mds-widget .mds-widget-body svg', { timeout: 60000 });
assert.equal(await page.locator('[data-mds-root] .mds-widget').count(), 2, 'explicit and bare-svg fences both hydrate into widget cards');
assert.ok(await page.locator('[data-mds-root] .mds-widget-title:has-text("分层架构")').count(), 'explicit fence keeps its title');
assert.ok(await page.locator('[data-mds-root] .mds-widget-title:has-text("裸围栏")').count(), 'bare fence takes title from svg <title>');
assert.equal(await page.locator('[data-mds-root] .mds-widget script, [data-mds-root] .mds-widget foreignObject').count(), 0, 'document widgets stay sanitized');
// Dark-mode fallback: a <text> without fill follows var(--dsw-alias-label-primary).
// (The page is in dark state here — the theme-flip section set the token on body.)
const noFill = page.locator('[data-mds-root] .mds-widget-body text', { hasText: '无填充兜底' });
assert.equal(await noFill.count(), 1, 'no-fill text present');
const tokenFill = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary').trim());
const currentFill = await noFill.evaluate(t => getComputedStyle(t).fill);
assert.ok(tokenFill && currentFill.includes(tokenFill.replace('#', '') === '' ? tokenFill : tokenFill) || /rgb\(230,\s*237,\s*243\)/.test(currentFill), 'fill follows body theme token, got ' + currentFill + ' vs token ' + tokenFill);
await page.evaluate(() => { document.body.style.removeProperty('--dsw-alias-label-primary'); });
const lightFill = await noFill.evaluate(t => getComputedStyle(t).fill);
assert.ok(/rgb\(31,\s*41,\s*55\)/.test(lightFill), 'falls back to #1F2937 without token, got ' + lightFill);
const nearestWins = await noFill.evaluate(t => {
  const card = t.closest('.mds-widget');
  card.style.setProperty('--dsw-alias-label-primary', 'rgb(229, 231, 235)');
  const fill = getComputedStyle(t).fill;
  card.style.removeProperty('--dsw-alias-label-primary');
  return fill;
});
assert.ok(/rgb\(229,\s*231,\s*235\)/.test(nearestWins), 'nearest token wins, got ' + nearestWins);
// Unmount the chat simulator: cards must be garbage collected.
const chatCardsBefore = await page.locator('.mds-diagram').count();
await page.evaluate(() => window.__chat.remove());
await page.waitForFunction(() => !document.getElementById('chat-simulator'));
assert.ok((await page.locator('.mds-diagram').count()) < chatCardsBefore, 'chat cards must be disposed with their container');
const status = await page.evaluate(() => ({...window.__dshMdStudio}));
await page.evaluate(() => { window.__root.unmount(); window.__effects.reverse().forEach(d=>d?.()); });
assert.equal(await page.locator('style[data-plugin="dsh-md-studio"]').count(), 0);
assert.equal(errors.length, 0, JSON.stringify(errors));
assert.equal(network.length, 0, 'Renderer should make zero network requests: '+JSON.stringify(network));
const result = {passed:true,browser:await browser.version(),nativeSlot:registration.options.key,svgDiagrams:5,externalRequests:network.length,pageErrors:errors.length,checks:['GFM table','task lists','footnotes','inline and block KaTeX','syntax highlight','four Mermaid types','mermaid syntax auto-repair','source toggle','fullscreen','SVG download','dark theme rerender','invalid diagram isolation','HTML sanitization','file switching','plugin disposal','chat mermaid rendering','chat streaming stability','chat no-double-render','chat bare-svg widget','plain code untouched','chat theme rebuild','doc mds-diagram widget','doc bare-svg widget','chat disposal'],status};
await writeFile(resolve(root,'test/artifacts/result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
