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
  window.__render = text => window.__root.render(window.__testReact.createElement(window.__slot.component, {
    content: {kind:'text', text, pages:[], eof:true}, resourceAddress:'file:demo', useResource: () => ({value:{absolutePath:'D:/demo.md'}})
  }));
  return { id: window.__registration.id, options: window.__slot.options, status: window.__dshMdStudio };
});
assert.equal(registration.id, 'dsh-md-studio');
assert.equal(registration.options.key, '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown');
const sample = `# 原生右侧 Markdown 预览验证\n\n| 项目 | 状态 |\n|---|---|\n| 离线图表 | 是 |\n\n- [x] 已完成\n- [ ] 待完成\n\n脚注示例[^one]\n\n[^one]: 说明正文\n\n质能关系 $E=mc^2$。\n\n$$\ne^{i\\pi}+1=0\n$$\n\n\`\`\`js\nconst answer = 42;\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n A[打开文件] --> B[右侧预览] --> C[本地渲染]\n\`\`\`\n\n\`\`\`mermaid\nsequenceDiagram\n 用户->>DSH: 打开 Markdown\n DSH-->>用户: 显示图表\n\`\`\`\n\n\`\`\`mermaid\ngantt\n title 验证计划\n dateFormat YYYY-MM-DD\n section 验证\n 渲染 :done, a1, 2026-10-08, 1d\n\`\`\`\n\n\`\`\`mermaid\npie title 能力\n "文档" : 60\n "图表" : 40\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n W2[Codex / Claude Code / KimiCode / OpenCode (ACP)] --> W1[DSH Native]\n\`\`\`\n`;
await page.evaluate(text => window.__render(text), sample);
await page.waitForSelector('.mds-document[data-state="ready"]', {timeout:60000});
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
const status = await page.evaluate(() => ({...window.__dshMdStudio}));
await page.evaluate(() => { window.__root.unmount(); window.__effects.reverse().forEach(d=>d?.()); });
assert.equal(await page.locator('style[data-plugin="dsh-md-studio"]').count(), 0);
assert.equal(errors.length, 0, JSON.stringify(errors));
assert.equal(network.length, 0, 'Renderer should make zero network requests: '+JSON.stringify(network));
const result = {passed:true,browser:await browser.version(),nativeSlot:registration.options.key,svgDiagrams:5,externalRequests:network.length,pageErrors:errors.length,checks:['GFM table','task lists','footnotes','inline and block KaTeX','syntax highlight','four Mermaid types','mermaid syntax auto-repair','source toggle','fullscreen','SVG download','dark theme rerender','invalid diagram isolation','HTML sanitization','file switching','plugin disposal'],status};
await writeFile(resolve(root,'test/artifacts/result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
