import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import mermaid from 'mermaid';

const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_DOCUMENT = 2_000_000;
const MAX_DIAGRAM = 50_000;
let sequence = 0;
let queue = Promise.resolve();
export const diagnostics = { version: '1.1.1', active: false, documents: 0, diagrams: 0, repaired: 0, errors: 0 };

function mathPlugin(md) {
  md.inline.ruler.before('escape', 'studio_math', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '$' || state.src[start + 1] === '$' || /\s/.test(state.src[start + 1] || ' ')) return false;
    let end = start + 1;
    while ((end = state.src.indexOf('$', end)) !== -1) {
      if (state.src[end - 1] !== '\\') break;
      end++;
    }
    if (end < 0 || /\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] || '') || state.src.slice(start + 1, end).includes('\n')) return false;
    if (!silent) { const token = state.push('studio_math', 'math', 0); token.content = state.src.slice(start + 1, end); }
    state.pos = end + 1;
    return true;
  });
  md.block.ruler.before('fence', 'studio_math_block', (state, start, end, silent) => {
    const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    if (!first.startsWith('$$')) return false;
    let value = first.slice(2), next = start + 1, closed = false;
    if (value.trimEnd().endsWith('$$')) { value = value.trimEnd().slice(0, -2); closed = true; }
    else {
      while (next < end) {
        const line = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]);
        next++;
        if (line.trimEnd().endsWith('$$')) { value += '\n' + line.trimEnd().slice(0, -2); closed = true; break; }
        value += '\n' + line;
      }
    }
    if (!closed) return false;
    if (silent) return true;
    const token = state.push('studio_math_block', 'math', 0);
    token.content = value.trim(); token.block = true; token.map = [start, next]; state.line = next;
    return true;
  });
  const render = displayMode => (tokens, idx) => katex.renderToString(tokens[idx].content, { displayMode, throwOnError: false, trust: false, strict: 'warn', maxExpand: 1000 });
  md.renderer.rules.studio_math = render(false);
  md.renderer.rules.studio_math_block = render(true);
}
const md = new MarkdownIt({ html: true, linkify: true, typographer: false, highlight(code, lang) {
  if (code.length > 100_000) return escape(code);
  try { if (hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { /* plain code remains readable */ }
  return escape(code);
}}).use(footnote).use(taskLists, { enabled: false }).use(mathPlugin);
const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const lang = tokens[idx].info.trim().split(/\s+/)[0].toLowerCase();
  if (['mermaid', 'mmd', 'mermaidjs'].includes(lang)) return `<pre class="mds-diagram-source"><code class="language-mermaid">${escape(tokens[idx].content)}</code></pre>`;
  return fence(tokens, idx, options, env, self);
};

// Same authenticated native media route used by DSH's MarkdownBody. No arbitrary static-file server.
export function localImageUrl(destination, documentPath, base = document.baseURI) {
  if (/^https?:\/\//i.test(destination) || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(destination)) return destination;
  if (/^[/\\]{2}/.test(destination)) return undefined;
  let path;
  try { path = decodeURIComponent(destination.split(/[?#]/)[0]); } catch { return undefined; }
  if (!path || /[\x00-\x1f\x7f]/.test(path)) return undefined;
  if (!/^[a-z]:[/\\]/i.test(path) && /^[a-z][a-z\d+.-]*:/i.test(path)) return undefined;
  if (!/^([a-z]:[/\\]|\/)/i.test(path)) {
    if (!documentPath) return undefined;
    const i = Math.max(documentPath.lastIndexOf('/'), documentPath.lastIndexOf('\\'));
    path = documentPath.slice(0, i + 1) + path;
  }
  if (!/^(https?:|dsh-app:)/.test(base)) return undefined;
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}
export function markdownHtml(text) {
  if (text.length > MAX_DOCUMENT) throw new Error('文档超过 200 万字符，请分段查看。');
  return DOMPurify.sanitize(md.render(text), { ADD_TAGS: ['math', 'semantics', 'annotation'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'], FORBID_ATTR: ['onerror', 'onclick'], ADD_ATTR: ['target'], ALLOW_DATA_ATTR: false });
}
function button(label, action, signal) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
  el.addEventListener('click', action, { signal }); return el;
}
function saveSvg(svg) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'diagram.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openFullscreen(svg, ownerSignal) {
  const ctrl = new AbortController();
  const dialog = document.createElement('dialog'); dialog.className = 'mds-fullscreen';
  const toolbar = document.createElement('div'); toolbar.className = 'mds-toolbar';
  const viewport = document.createElement('div'); viewport.className = 'mds-viewport';
  const stage = document.createElement('div'); stage.className = 'mds-stage';
  stage.append(svg.cloneNode(true)); viewport.append(stage);
  let scale = 1, x = 0, y = 0, drag;
  const transform = () => stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  const fit = () => { scale = 1; x = y = 0; transform(); };
  const close = () => { ctrl.abort(); dialog.remove(); ownerSignal.removeEventListener('abort', close); };
  toolbar.append(button('适应', fit, ctrl.signal), button('放大', () => { scale = Math.min(8, scale * 1.25); transform(); }, ctrl.signal), button('缩小', () => { scale = Math.max(.2, scale / 1.25); transform(); }, ctrl.signal), button('下载 SVG', () => saveSvg(svg), ctrl.signal), button('关闭', close, ctrl.signal));
  dialog.append(toolbar, viewport); document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('cancel', close, { signal: ctrl.signal });
  ownerSignal.addEventListener('abort', close, { once: true });
  viewport.addEventListener('pointerdown', e => { drag = { x: e.clientX - x, y: e.clientY - y }; viewport.setPointerCapture(e.pointerId); }, { signal: ctrl.signal });
  viewport.addEventListener('pointermove', e => { if (drag) { x = e.clientX - drag.x; y = e.clientY - drag.y; transform(); } }, { signal: ctrl.signal });
  viewport.addEventListener('pointerup', () => { drag = null; }, { signal: ctrl.signal });
  viewport.addEventListener('wheel', e => { e.preventDefault(); scale = Math.max(.2, Math.min(8, scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); transform(); }, { passive: false, signal: ctrl.signal });
}
// Conservative auto-repair for the most common real-world Mermaid breaker:
// ASCII parentheses inside flowchart/graph node labels and |edge| labels,
// e.g. `W2[Codex / Claude Code (ACP)]`, which mermaid cannot parse. Quoting
// the label preserves the text and renders a standard rectangle. Shape
// brackets (`[( )]` cylinder, `[[ ]]` subroutine) are left untouched, and
// anything outside flowchart/graph sources is never modified.
export function repairMermaid(source) {
  if (!/^\s*(?:flowchart|graph)\b/m.test(String(source))) return source;
  let out = String(source).replace(/\[([^\[\]""\n]+)\]/g, (m, inner) => {
    if (!/[()]/.test(inner)) return m;
    if (m.startsWith('[(') || m.startsWith('[[')) return m;
    return '[' + JSON.stringify(inner.replace(/"/g, "'")) + ']';
  });
  out = out.replace(/\|([^|\n]+)\|/g, (m, inner) => /[()]/.test(inner) ? '|' + JSON.stringify(inner) + '|' : m);
  return out;
}
function diagramCard(pre, dark, signal) {
  const source = pre.textContent;
  const card = document.createElement('section'); card.className = 'mds-diagram'; card.dataset.state = 'loading';
  const toolbar = document.createElement('div'); toolbar.className = 'mds-toolbar';
  const label = document.createElement('span'); label.textContent = 'Mermaid'; label.className = 'mds-badge';
  const pane = document.createElement('div'); pane.className = 'mds-diagram-pane'; pane.textContent = '正在绘制图表…';
  const error = document.createElement('div'); error.className = 'mds-error'; error.hidden = true;
  pre.before(card); pre.hidden = true; card.append(toolbar, error, pane, pre);
  const graph = button('图形', () => { pane.hidden = false; pre.hidden = true; graph.setAttribute('aria-pressed', 'true'); code.setAttribute('aria-pressed', 'false'); }, signal);
  const code = button('源码', () => { pane.hidden = true; pre.hidden = false; graph.setAttribute('aria-pressed', 'false'); code.setAttribute('aria-pressed', 'true'); }, signal);
  graph.setAttribute('aria-pressed', 'true'); code.setAttribute('aria-pressed', 'false');
  const full = button('全屏', () => { const svg = pane.querySelector('svg'); if (svg) openFullscreen(svg, signal); }, signal);
  const download = button('下载 SVG', () => { const svg = pane.querySelector('svg'); if (svg) saveSvg(svg); }, signal);
  full.disabled = download.disabled = true;
  toolbar.append(label, graph, code, full, download);
  queue = queue.catch(() => {}).then(async () => {
    if (signal.aborted || !card.isConnected) return;
    const draw = async src => {
      if (src.length > MAX_DIAGRAM || src.split('\n').length > 2000) throw new Error('此图表过大，请缩减为 5 万字符、2000 行以内。');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: dark ? 'dark' : 'default', htmlLabels: false, flowchart: { htmlLabels: false }, maxTextSize: MAX_DIAGRAM, maxEdges: 2000 });
      const result = await mermaid.render(`mdstudio-${++sequence}`, src);
      const svg = DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, FORBID_TAGS: ['script', 'iframe', 'object', 'embed'] });
      pane.innerHTML = svg;
      const el = pane.querySelector('svg');
      if (!el) throw new Error('图表引擎没有返回 SVG。');
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Mermaid 图表');
    };
    try {
      await draw(source);
      if (signal.aborted || !card.isConnected) return;
      card.dataset.state = 'ok'; full.disabled = download.disabled = false; diagnostics.diagrams++;
    } catch (first) {
      if (signal.aborted) return;
      // Retry once with the conservative repair before surfacing an error.
      const fixed = repairMermaid(source);
      if (fixed !== source) {
        try {
          await draw(fixed);
          if (signal.aborted || !card.isConnected) return;
          label.textContent = 'Mermaid · 已自动修复';
          card.dataset.state = 'ok'; full.disabled = download.disabled = false; diagnostics.diagrams++; diagnostics.repaired++;
          return;
        } catch { /* fall through to the error state with both attempts failed */ }
      }
      if (signal.aborted) return;
      card.dataset.state = 'error'; error.hidden = false;
      error.textContent = `图表未能绘制：${first.message || first}\n若为语法问题，请修正后重新打开；常见错误：节点标签中的英文括号需写为 ["文字 (括号)"]。`;
      pane.hidden = true; pre.hidden = false; diagnostics.errors++;
    }
  });
  return queue;
}
export function mountMarkdown(root, text, { documentPath, dark = false } = {}) {
  const controller = new AbortController(); const { signal } = controller;
  root.classList.add('mds-document'); root.dataset.mdsVersion = diagnostics.version;
  root.dataset.state = 'rendering';
  try { root.innerHTML = markdownHtml(text); }
  catch (e) { root.textContent = e.message; root.dataset.state = 'error'; return { done: Promise.resolve(), dispose: () => controller.abort() }; }
  root.querySelectorAll('img').forEach(img => {
    const url = localImageUrl(img.getAttribute('src') || '', documentPath);
    if (url) img.src = url; else img.removeAttribute('src');
    img.loading = 'lazy';
  });
  const headingIds = new Map();
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    const base = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s+/g, '-');
    const count = headingIds.get(base) || 0; headingIds.set(base, count + 1); h.id = count ? `${base}-${count}` : base;
  });
  root.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) a.addEventListener('click', e => { e.preventDefault(); let id; try { id = decodeURIComponent(href.slice(1)); } catch { return; } [...root.querySelectorAll('[id]')].find(n => n.id === id)?.scrollIntoView({ block: 'start' }); }, { signal });
    else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  });
  const jobs = [...root.querySelectorAll('pre.mds-diagram-source')].map(pre => diagramCard(pre, dark, signal));
  diagnostics.documents++;
  const done = Promise.all(jobs).then(() => { if (!signal.aborted) root.dataset.state = root.querySelector('.mds-diagram[data-state="error"]') ? 'partial' : 'ready'; });
  return { done, dispose: () => controller.abort() };
}
