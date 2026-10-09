// Locate a Chromium executable for the browser tests, across platforms.
// Order: MDS_BROWSER_PATH override (file or directory) → system browsers →
// Playwright cache (populated by `npx playwright install chromium` in CI).
import { access, readdir, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const SYSTEM_PATHS = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
};

const PLAYWRIGHT_CACHES = () => [
  join(homedir(), '.cache/ms-playwright'),
  join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
  join(homedir(), 'Library/Caches/ms-playwright'),
];

async function isFile(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function scanPlaywrightCache(cacheDir) {
  let entries;
  try { entries = await readdir(cacheDir); } catch { return undefined; }
  const dirs = entries.filter(e => e.startsWith('chromium')).sort().reverse();
  for (const dir of dirs) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = join(cacheDir, dir, rel);
      if (await isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Resolve a Chromium executable path, or throw with an actionable message. */
export async function findChromium() {
  const override = process.env.MDS_BROWSER_PATH;
  if (override && await exists(override)) {
    if (await isFile(override)) return override;
    const found = await scanPlaywrightCache(override);
    if (found) return found;
  }
  for (const candidate of SYSTEM_PATHS[platform()] || []) {
    if (await isFile(candidate)) return candidate;
  }
  for (const cache of PLAYWRIGHT_CACHES()) {
    const found = await scanPlaywrightCache(cache);
    if (found) return found;
  }
  throw new Error('未找到可用的 Chromium。请安装 Edge/Chrome，运行 `npx playwright@1.64.0 install chromium`，或设置 MDS_BROWSER_PATH 指向浏览器可执行文件。');
}
