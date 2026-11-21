// 渲染验证：把会话 session-3822c978 中用户提供的裸 <svg> 架构图
// （DSH-AIOS 五平面与双环执行闭环, 1120x800, turn24 重发版 = research/svg-block-30.txt）
// 注入模拟聊天 DOM，用 dsh-md-studio 1.3.9 (lib/client.js) 渲染并截图验证。
// 只读 + 产出截图与 JSON 结果，不修改 src/ 任何文件。
// 注入方式参照 test/browser.mjs 的 chat-simulator 注入法。
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findChromium } from './browser-path.mjs';

const pluginRoot = resolve(import.meta.dirname, '..');
const researchDir = resolve(pluginRoot, '../research');
const svgSourceFile = resolve(researchDir, 'svg-block-30.txt');

const raw = await readFile(svgSourceFile, 'utf8');
const svg = raw.replace(/^```mds-diagram[^\n]*\n/, '').replace(/\n```\s*$/, '');

function countTags(s) {
  const c = tag => (s.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
  return { rect: c('rect'), text: c('text'), line: c('line'), path: c('path'), circle: c('circle'), ellipse: c('ellipse') };
}
const sourceCounts = countTags(svg);

const executablePath = await findChromium();
const browser = await chromium.launch({ executablePath, headless: true });
// 视口/聊天窗取 1160px：让 1120px 宽 SVG 完整可见，截图含全部面板与图例
const page = await browser.newPage({ viewport: { width: 1240, height: 1400 }, acceptDownloads: true });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
await page.route('**/*', route => route.abort());
await page.setContent('<html lang="zh-CN"><head><base href="http://127.0.0.1:3080/"></head><body style="margin:0;background:#ffffff"><main id="preview"></main></body></html>');
await page.addScriptTag({ path: resolve(pluginRoot, 'test/react-runtime.js') });
await page.evaluate(() => {
  window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } };
});
await page.addScriptTag({ path: resolve(pluginRoot, 'lib/client.js') });
await page.evaluate(() => {
  const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('Undeclared module ' + spec); });
  window.__effects = [];
  window.__chat = document.createElement('div');
  window.__chat.id = 'chat-simulator';
  window.__chat.style.width = '1160px';
  window.__chat.style.margin = '16px auto';
  document.body.appendChild(window.__chat);
  const ctx = {
    get() { return undefined; },
    effect(fn) { const d = fn(); if (typeof d === 'function') window.__effects.push(d); return d; },
    slots: {
      inject(name, fn) { const d = fn(); window.__effects.push(d); return d; },
      register() { return () => {}; },
    },
  };
  mod.apply(ctx);
});

// 注入：裸 <svg> 代码块，<pre><code> 包裹 + HTML 转义
const escaped = svg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
await page.evaluate(html => {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<pre><code>' + html + '</code></pre>';
  window.__chat.appendChild(wrap);
}, escaped);

const card = page.locator('#chat-simulator .mds-widget').first();
const result = { pluginVersion: '1.3.9', svgSource: 'research/svg-block-30.txt (turn24 重发版)', sourceCounts };

// [1] 渲染为 .mds-widget 卡片（不是源码）
try {
  await page.waitForSelector('#chat-simulator .mds-widget .mds-widget-body svg', { timeout: 15000 });
  result.checks = {};
  result.checks.widgetCard = true;
} catch {
  result.checks = { widgetCard: false };
  result.pageErrors = pageErrors; result.consoleErrors = consoleErrors;
  await writeFile(resolve(researchDir, 'user-svg-render-result.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(1);
}
result.checks.sourcePreHidden = await card.locator('pre').first().isHidden().catch(() => 'n/a');

// [2] 标题栏
const title = card.locator('.mds-widget-title');
result.checks.titleBar = {
  present: (await title.count()) > 0,
  text: (await title.textContent().catch(() => '')).trim(),
  expected: 'DSH-AIOS 五平面与双环执行闭环',
};

// 元素完整性
const renderedCounts = await card.locator('svg').first().evaluate(s => {
  const c = t => s.querySelectorAll(t).length;
  return { rect: c('rect'), text: c('text'), line: c('line'), path: c('path'), circle: c('circle'), ellipse: c('ellipse') };
});
result.checks.renderedCounts = renderedCounts;
result.checks.countsMatch = JSON.stringify(renderedCounts) === JSON.stringify(sourceCounts);

// [4] 图例 4 项完整
const legendItems = ['运行/控制核心', '策略/人工门', '知识/交付', '渠道/外部'];
const svgText = ((await card.locator('svg').first().textContent()) || '').replace(/\s+/g, '');
result.checks.legend = {};
for (const item of legendItems) result.checks.legend[item] = svgText.includes(item);

// [5] 底部 4 行说明文字
const footnotes = [
  '实线：命令/执行与副作用；虚线：投影、记忆或候选反馈。',
  'Outerloop不是第二scheduler；Task/Run/ledger始终归DSHkernel。',
  '抽样评审仅限可逆、可验证、低风险；高权限和未知效果继续人工门控。',
  '规范设计/待验收：图表达目标契约，不表示已经实现或部署。',
];
result.checks.footnotes = {};
for (const f of footnotes) result.checks.footnotes[f] = svgText.includes(f.replace(/\s+/g, ''));

// [7] 控件按钮
result.checks.controls = {};
for (const name of ['适应宽度', '全屏', '下载 SVG']) {
  result.checks.controls[name] = (await card.getByRole('button', { name, exact: true }).count()) > 0;
}

// [3] 高度自适应（纵向无截断）；同时记录横向滚动情况
const box = await card.locator('.mds-widget-body').evaluate(el => ({
  clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
  clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
}));
result.checks.bodyBox = box;
result.checks.verticalAdaptive = box.scrollHeight <= box.clientHeight + 2;
result.checks.horizontalScroll = box.scrollWidth > box.clientWidth + 2;

// 消毒
result.checks.sanitized = (await card.locator('script, foreignObject').count()) === 0;

// 浅色截图
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(researchDir, 'user-svg-render-light.png'), fullPage: true });

// 深色模式
await page.evaluate(() => {
  document.body.style.background = '#17191d';
  document.body.style.setProperty('--dsw-alias-label-primary', '#e6edf3');
  document.body.style.setProperty('--dsw-alias-label-secondary', '#8b949e');
  document.body.style.setProperty('--dsw-alias-bg-base', '#0d1117');
  document.body.style.setProperty('--dsw-alias-bg-layer-2', '#24282f');
  document.body.style.setProperty('--dsw-alias-border-l1', '#30363d');
  document.body.setAttribute('data-ds-dark-theme', '');
});
await page.waitForTimeout(600);
// [6] 深色可读性：主题文字填充应为浅色
result.checks.darkMode = await page.evaluate(() => {
  const texts = [...document.querySelectorAll('#chat-simulator .mds-widget-body text')];
  const themed = texts.filter(t => (t.getAttribute('style') || '').includes('--dsw-alias-label-primary'));
  const fills = themed.map(t => getComputedStyle(t).fill);
  const lightFills = fills.filter(f => {
    const m = f.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b] = m[1].split(',').map(Number);
    return (r + g + b) / 3 > 150;
  });
  return { themedTextCount: themed.length, sampleFills: fills.slice(0, 5), lightFillCount: lightFills.length, total: fills.length };
});
await page.screenshot({ path: resolve(researchDir, 'user-svg-render-dark.png'), fullPage: true });

// [8] 控制台/页面报错
result.checks.pageErrors = pageErrors;
result.checks.consoleErrors = consoleErrors;

await mkdir(researchDir, { recursive: true });
await writeFile(resolve(researchDir, 'user-svg-render-result.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
await browser.close();
