import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
await mkdir(join(root, 'lib'), { recursive: true });
const styles = {
  name: 'inline-css-and-fonts',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, async args => {
      let css = await readFile(args.path, 'utf8');
      const refs = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, '')))];
      for (const ref of refs) {
        if (/^(data:|https?:)/.test(ref)) continue;
        const bytes = await readFile(resolve(dirname(args.path), ref));
        const mime = ref.endsWith('.woff2') ? 'font/woff2' : ref.endsWith('.woff') ? 'font/woff' : 'font/ttf';
        css = css.split(ref).join(`data:${mime};base64,${bytes.toString('base64')}`);
      }
      return { contents: `export default ${JSON.stringify(css)};`, loader: 'js' };
    });
  }
};
await build({
  absWorkingDir: root, entryPoints: ['src/client.js'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120', minify: true,
  external: ['react'], plugins: [styles], legalComments: 'external',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-md-studio",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: ';return module.exports;}});' },
});
await writeFile(join(root, 'lib/index.js'), 'export const name="dsh-md-studio";\nexport const inject=[];\nexport function apply() {}\n');
// Test the exact shipped bundle. The browser test supplies only DSH\'s React external.
await build({ absWorkingDir: root, stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; window.__testReact=React; window.__testCreateRoot=createRoot;", resolveDir: root }, outfile: 'test/react-runtime.js', bundle: true, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
const libraries = ['mermaid','markdown-it','markdown-it-footnote','markdown-it-task-lists','dompurify','highlight.js','katex'];
let notices = '# Third-party notices\n\nThe implementation uses the following bundled libraries. Full bundled code notices are in lib/client.js.LEGAL.txt.\n\nDesign inspiration: https://github.com/MrmoLabs/dsh-mermaid and https://github.com/nirvanaslash/dsh-artifact-preview (MIT). The 1.1 native preview integration is a new implementation.\n';
for (const pkg of libraries) {
  let dir = dirname(require.resolve(pkg));
  while (true) {
    try { const meta = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')); if (meta.name === pkg) break; } catch {}
    const up = dirname(dir); if (up === dir) throw new Error(`Could not find manifest for ${pkg}`); dir = up;
  }
  const meta = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  const names = (await readdir(dir)).filter(x => /^(license|copying)(\.|$)/i.test(x));
  notices += `\n## ${pkg} ${meta.version} (${meta.license})\n\n`;
  for (const n of names) notices += `\n${await readFile(join(dir, n), 'utf8')}\n`;
}
await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), notices);
console.log('Built self-contained native preview bundle with local fonts and Mermaid.');
