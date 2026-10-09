// Generate documentation screenshots and the GitHub social card from the
// exact shipped bundle. Fully offline (network aborted) like test/browser.mjs.
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { findChromium } from './browser-path.mjs';

const root = resolve(import.meta.dirname, '..');
const images = resolve(root, 'docs/images');
await mkdir(images, { recursive: true });
const executablePath = await findChromium();

async function bootWithCapture(page) {
  await page.route('**/*', route => route.abort());
  await page.setContent('<html lang="zh-CN"><head></head><body style="margin:0"></body></html>');
  await page.addScriptTag({ path: resolve(root, 'test/react-runtime.js') });
  await page.evaluate(() => { window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } }; });
  await page.addScriptTag({ path: resolve(root, 'lib/client.js') });
  return page.evaluate(() => {
    const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('undeclared ' + spec); });
    const ctx = {
      effect(fn) { return fn(); },
      slots: {
        inject(_n, fn) { fn(); },
        register(options, component) { window.__capturedComponent = component; return () => {}; },
      },
    };
    mod.apply(ctx);
    if (!window.__capturedComponent) throw new Error('component not captured');
    window.__root = window.__testCreateRoot(document.body.appendChild(document.createElement('main')));
    window.__render = text => window.__root.render(window.__testReact.createElement(window.__capturedComponent, {
      content: { kind: 'text', text, pages: [], eof: true },
      resourceAddress: 'file:demo',
      useResource: () => ({ value: { absolutePath: 'D:/demo.md' } }),
    }));
  });
}

function setDark(page) {
  return page.evaluate(() => {
    document.body.style.background = '#17191d';
    document.body.style.setProperty('--dsw-alias-label-primary', '#e6edf3');
    document.body.style.setProperty('--dsw-alias-bg-layer-2', '#24282f');
    document.body.setAttribute('data-ds-dark-theme', '');
  });
}
function setLight(page) {
  return page.evaluate(() => {
    document.body.style.background = '#ffffff';
    document.body.style.removeProperty('--dsw-alias-label-primary');
    document.body.style.removeProperty('--dsw-alias-bg-layer-2');
    document.body.removeAttribute('data-ds-dark-theme');
  });
}

const demo = await readFile(resolve(root, '../dsh-md-studio-demo.md'), 'utf8');
const browser = await chromium.launch({ executablePath, headless: true });

// ---- full-page demo, light + dark ----
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
await bootWithCapture(page);
await page.evaluate(text => window.__render(text), demo);
await page.waitForSelector('.mds-document[data-state="ready"]', { timeout: 60000 });
assert.equal(await page.locator('.mds-diagram[data-state="ok"] svg').count(), 4);
await page.screenshot({ path: resolve(images, 'demo-light.png'), fullPage: true });
await setDark(page);
await page.waitForFunction(() => window.__dshMdStudio.diagrams >= 8);
assert.equal(await page.locator('.mds-diagram[data-state="ok"] svg').count(), 4);
await page.screenshot({ path: resolve(images, 'demo-dark.png'), fullPage: true });

// ---- before / after comparison ----
const snippet = '```mermaid\nflowchart LR\n    A[打开 Markdown 文件] --> B[DSH 右侧预览]\n    B --> C[Markdown Studio]\n    C --> D[图表与正文]\n```';
const cmp = await browser.newPage({ viewport: { width: 1180, height: 620 } });
await bootWithCapture(cmp);
await cmp.setContent(`<html lang="zh-CN"><body style="margin:0;background:#17191d;font-family:system-ui;color:#e6edf3;padding:18px 26px">
<div style="font-size:20px;font-weight:700;margin-bottom:14px">同一个 Mermaid 代码块，在 DSH 右侧文件预览中</div>
<div style="color:#8b949e;font-size:13px;margin-bottom:6px">官方预览 · 显示为代码块</div>
<pre style="background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:14px;font:13px/1.6 Consolas,monospace;color:#8b949e;margin:0 0 18px">${snippet.replace(/</g,'&lt;')}</pre>
<div style="color:#8b949e;font-size:13px;margin-bottom:6px">Markdown Studio · 就地渲染为图表</div>
<div id="after"></div>
</body></html>`);
await cmp.addScriptTag({ path: resolve(root, 'test/react-runtime.js') });
await cmp.evaluate(() => { window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } }; });
await cmp.addScriptTag({ path: resolve(root, 'lib/client.js') });
const cmpText = `## 速览\n\n${snippet}`;
await cmp.evaluate(text => {
  const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('x'); });
  mod.apply({ effect(fn) { return fn(); }, slots: { inject(_n, fn) { fn(); }, register(o, c) { window.__cc = c; return () => {}; } } });
  window.__r2 = window.__testCreateRoot(document.querySelector('#after'));
  window.__r2.render(window.__testReact.createElement(window.__cc, {
    content: { kind: 'text', text, pages: [], eof: true },
    resourceAddress: 'file:demo', useResource: () => ({ value: { absolutePath: 'D:/demo.md' } }),
  }));
}, cmpText);
await cmp.evaluate(() => {
  document.body.style.background = '#17191d';
  document.body.style.setProperty('--dsw-alias-label-primary', '#e6edf3');
  document.body.style.setProperty('--dsw-alias-bg-layer-2', '#24282f');
  document.body.setAttribute('data-ds-dark-theme', '');
});
await cmp.waitForSelector('.mds-diagram[data-state="ok"] svg', { timeout: 60000 });
// drop the "速览" heading from the crop
await cmp.evaluate(() => { const h = document.querySelector('#after h2'); if (h) h.remove(); });
await cmp.screenshot({ path: resolve(images, 'before-after.png'), fullPage: true });

// ---- GitHub social card 1280x640 ----
const card = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await card.setContent(`<html><body style="margin:0">
<div style="width:1280px;height:640px;box-sizing:border-box;background:linear-gradient(135deg,#0d1117 0%,#10203a 60%,#123160 100%);color:#fff;font-family:system-ui;display:flex;align-items:center;gap:48px;padding:0 72px">
  <div style="flex:1.2">
    <div style="font-size:56px;font-weight:800;letter-spacing:-1px">Markdown Studio</div>
    <div style="font-size:26px;color:#79c0ff;margin-top:10px">DeepSeek Harness 原生右侧预览插件</div>
    <div style="font-size:20px;color:#8b949e;margin-top:18px;line-height:1.6">Mermaid 图表 · KaTeX 公式 · 代码高亮 · 表格脚注<br>渲染引擎随包内置，离线可用</div>
  </div>
  <div id="mini" style="flex:1;background:#0d1117;border:1px solid #30363d;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.5)"></div>
</div></body></html>`);
await card.addScriptTag({ path: resolve(root, 'test/react-runtime.js') });
await card.evaluate(() => { window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } }; });
await card.addScriptTag({ path: resolve(root, 'lib/client.js') });
await card.evaluate(text => {
  const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('x'); });
  mod.apply({ effect(fn) { return fn(); }, slots: { inject(_n, fn) { fn(); }, register(o, c) { window.__c3 = c; return () => {}; } } });
  window.__r3 = window.__testCreateRoot(document.querySelector('#mini'));
  window.__r3.render(window.__testReact.createElement(window.__c3, {
    content: { kind: 'text', text, pages: [], eof: true },
    resourceAddress: 'file:demo', useResource: () => ({ value: { absolutePath: 'D:/demo.md' } }),
  }));
}, snippet);
await card.evaluate(() => {
  document.body.style.setProperty('--dsw-alias-label-primary', '#e6edf3');
  document.body.style.setProperty('--dsw-alias-bg-layer-2', '#161b22');
  document.body.setAttribute('data-ds-dark-theme', '');
  const tools = document.querySelector('#mini .mds-document-tools'); if (tools) tools.remove();
});
await card.waitForSelector('.mds-diagram[data-state="ok"] svg', { timeout: 60000 });
await card.screenshot({ path: resolve(images, 'social-card.png') });

const files = ['demo-light.png', 'demo-dark.png', 'before-after.png', 'social-card.png'];
console.log(JSON.stringify({ ok: true, files }));
await browser.close();
