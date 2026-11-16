import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findChromium } from './browser-path.mjs';

const root = resolve(import.meta.dirname, '..');
const executablePath = await findChromium();
const browser = await chromium.launch({ executablePath, headless: true });

async function renderDocument(path, outputLight, outputDark) {
  const page = await browser.newPage({ viewport: { width: 1060, height: 3000 } });
  await page.setContent('<html lang="zh-CN"><head></head><body style="margin:0"><main id="preview"></main></body></html>');
  await page.addScriptTag({path: resolve(root, 'test/react-runtime.js')});
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load: reg => { window.__registration = reg; } };
  });
  await page.addScriptTag({path: resolve(root, 'lib/client.js')});
  await page.evaluate(() => {
    const mod = window.__registration.factory(spec => { if (spec === 'react') return window.__testReact; throw new Error('Undeclared module '+spec); });
    window.__effects = [];
    window.__slot = null;
    const ctx = { 
      effect(fn) { const d = fn(); if (typeof d === 'function') window.__effects.push(d); return d; }, 
      slots: {
        inject(name, fn) { if (name !== 'sidebar.right.tab.document') throw new Error('Wrong slot '+name); const d = fn(); window.__effects.push(d); return d; },
        register(options, component) { window.__slot = {options,component}; return () => { window.__slot = null; }; }
      }
    };
    mod.apply(ctx);
    window.__root = window.__testCreateRoot(document.querySelector('#preview'));
    window.__render = (text) => window.__root.render(window.__testReact.createElement(window.__slot.component, {
      content: {kind:'text', text, pages:[], eof: true}, 
      resourceAddress:'file:test', 
      useResource: () => ({value:{absolutePath:'D:/test.md'}})
    }));
  });
  
  const text = await readFile(path, 'utf8');
  await page.evaluate(text => window.__render(text), text);
  await page.waitForSelector('.mds-document[data-state="ready"], .mds-document[data-state="partial"]', {timeout:60000});
  await page.waitForTimeout(2000);
  
  // Light mode screenshot
  await page.screenshot({ path: outputLight, fullPage: true });
  
  // Switch to dark mode
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outputDark, fullPage: true });
  
  await page.close();
}

await renderDocument(
  'D:/Project/DSH/test-diagram-rendering.md',
  'D:/Project/DSH/research/workbuddy-diagram-20261116/test-render-light.png',
  'D:/Project/DSH/research/workbuddy-diagram-20261116/test-render-dark.png'
);

console.log('Screenshots saved');
await browser.close();
