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
export const diagnostics = { version: '1.3.0', active: false, documents: 0, diagrams: 0, repaired: 0, widgets: 0, errors: 0 };

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
  const info = tokens[idx].info.trim();
  const lang = info.split(/\s+/)[0].toLowerCase();
  if (['mermaid', 'mmd', 'mermaidjs'].includes(lang)) return `<pre class="mds-diagram-source"><code class="language-mermaid">${escape(tokens[idx].content)}</code></pre>`;
  if (['mds-diagram', 'mds-widget', 'mds-svg'].includes(lang)) return widgetHtml(tokens[idx].content, info.slice(lang.length).trim());
  return fence(tokens, idx, options, env, self);
};

/** Fence-time placeholder: escaped SVG text survives the document sanitize pass;
 *  enhanceContent() later swaps it for the sanitized, themed widget card. */
export function widgetHtml(svgSource, title) {
  const source = String(svgSource || '');
  if (!/<svg[\s>]/i.test(source)) return `<pre class="mds-diagram-source"><code class="language-mermaid">${escape(source)}</code></pre>`;
  const autoTitle = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/[<>&]/g, '').trim().slice(0, 80);
  return `<div class="mds-widget" data-mds-widget="1"><div class="mds-widget-title">${escape(title || autoTitle || '图表')}</div><pre class="mds-widget-src">${escape(source)}</pre></div>`;
}

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
// -----------------------------------------------------------------------
// 彩色图表主题：亮/暗两套基于 mermaid 'base' + themeVariables 的现代配色，
// 蓝紫主色 + 多彩辅色（pie / gantt / gitGraph 各自成套），替代默认灰紫。
// -----------------------------------------------------------------------

const VIVID = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#6366F1', '#F97316', '#14B8A6', '#A855F7'];
const THEME_LIGHT = {
  background: 'transparent',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  fontSize: '14px',
  textColor: '#1F2937', titleColor: '#111827', classText: '#1F2937',
  primaryColor: '#3B82F6', primaryTextColor: '#FFFFFF', primaryBorderColor: '#1D4ED8',
  secondaryColor: '#8B5CF6', secondaryTextColor: '#FFFFFF', secondaryBorderColor: '#7C3AED',
  tertiaryColor: '#F59E0B', tertiaryTextColor: '#FFFFFF', tertiaryBorderColor: '#D97706',
  mainBkg: '#3B82F6', nodeBorder: '#1D4ED8', nodeTextColor: '#FFFFFF',
  lineColor: '#94A3B8',
  clusterBkg: 'rgba(59,130,246,.07)', clusterBorder: 'rgba(59,130,246,.35)',
  edgeLabelBackground: '#F3F4F6',
  labelBoxBkgColor: '#EFF6FF', labelBoxBorderColor: '#3B82F6', labelTextColor: '#1D4ED8',
  noteBkgColor: '#FFFBEB', noteTextColor: '#92400E', noteBorderColor: '#FCD34D',
  actorBkg: '#3B82F6', actorBorder: '#1D4ED8', actorTextColor: '#FFFFFF', actorLineColor: '#94A3B8',
  signalColor: '#374151', signalTextColor: '#374151', loopTextColor: '#374151',
  activationBkgColor: '#DBEAFE', activationBorderColor: '#3B82F6',
  taskBkgColor: '#3B82F6', taskBorderColor: '#1D4ED8', taskTextColor: '#FFFFFF', taskTextDarkColor: '#FFFFFF', taskTextLightColor: '#FFFFFF', taskTextOutsideColor: '#374151',
  activeTaskBkgColor: '#8B5CF6', activeTaskBorderColor: '#7C3AED',
  doneTaskBkgColor: '#D1FAE5', doneTaskBorderColor: '#10B981', doneTaskTextColor: '#065F46',
  critBkgColor: '#FEE2E2', critBorderColor: '#EF4444', critTextColor: '#991B1B',
  sectionBkgColor: 'rgba(59,130,246,.06)', sectionBkgColor2: 'rgba(59,130,246,.12)', altSectionBkgColor: '#FFFFFF',
  todayLineColor: '#EF4444',
  pie1: VIVID[0], pie2: VIVID[1], pie3: VIVID[2], pie4: VIVID[3], pie5: VIVID[4], pie6: VIVID[5], pie7: VIVID[6], pie8: VIVID[7], pie9: VIVID[8], pie10: VIVID[9], pie11: VIVID[10], pie12: VIVID[11],
  pieTitleTextColor: '#111827', pieSectionTextColor: '#FFFFFF', pieLegendTextColor: '#374151', pieStrokeColor: '#FFFFFF', pieOuterStrokeColor: '#E5E7EB',
  git0: VIVID[0], git1: VIVID[1], git2: VIVID[2], git3: VIVID[3], git4: VIVID[4], git5: VIVID[5], git6: VIVID[6], git7: VIVID[7],
  cScale0: VIVID[0], cScale1: VIVID[1], cScale2: VIVID[2], cScale3: VIVID[3], cScale4: VIVID[4], cScale5: VIVID[5], cScale6: VIVID[6], cScale7: VIVID[7], cScale8: VIVID[8], cScale9: VIVID[9], cScale10: VIVID[10], cScale11: VIVID[11],
};
const THEME_DARK = {
  background: 'transparent',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  fontSize: '14px',
  textColor: '#E5E7EB', titleColor: '#F9FAFB', classText: '#E5E7EB',
  primaryColor: '#2563EB', primaryTextColor: '#FFFFFF', primaryBorderColor: '#60A5FA',
  secondaryColor: '#7C3AED', secondaryTextColor: '#FFFFFF', secondaryBorderColor: '#A78BFA',
  tertiaryColor: '#D97706', tertiaryTextColor: '#FFFFFF', tertiaryBorderColor: '#FBBF24',
  mainBkg: '#2563EB', nodeBorder: '#60A5FA', nodeTextColor: '#FFFFFF',
  lineColor: '#64748B',
  clusterBkg: 'rgba(148,163,184,.08)', clusterBorder: 'rgba(148,163,184,.30)',
  edgeLabelBackground: '#111827',
  labelBoxBkgColor: '#1E3A8A', labelBoxBorderColor: '#60A5FA', labelTextColor: '#DBEAFE',
  noteBkgColor: '#78350F', noteTextColor: '#FDE68A', noteBorderColor: '#B45309',
  actorBkg: '#2563EB', actorBorder: '#60A5FA', actorTextColor: '#FFFFFF', actorLineColor: '#475569',
  signalColor: '#CBD5E1', signalTextColor: '#CBD5E1', loopTextColor: '#CBD5E1',
  activationBkgColor: '#1E40AF', activationBorderColor: '#60A5FA',
  taskBkgColor: '#2563EB', taskBorderColor: '#60A5FA', taskTextColor: '#FFFFFF', taskTextDarkColor: '#FFFFFF', taskTextLightColor: '#FFFFFF', taskTextOutsideColor: '#CBD5E1',
  activeTaskBkgColor: '#7C3AED', activeTaskBorderColor: '#A78BFA',
  doneTaskBkgColor: '#064E3B', doneTaskBorderColor: '#34D399', doneTaskTextColor: '#A7F3D0',
  critBkgColor: '#7F1D1D', critBorderColor: '#F87171', critTextColor: '#FECACA',
  sectionBkgColor: 'rgba(37,99,235,.10)', sectionBkgColor2: 'rgba(37,99,235,.04)', altSectionBkgColor: 'transparent',
  todayLineColor: '#F87171',
  pie1: VIVID[0], pie2: VIVID[1], pie3: VIVID[2], pie4: VIVID[3], pie5: VIVID[4], pie6: VIVID[5], pie7: VIVID[6], pie8: VIVID[7], pie9: VIVID[8], pie10: VIVID[9], pie11: VIVID[10], pie12: VIVID[11],
  pieTitleTextColor: '#F9FAFB', pieSectionTextColor: '#FFFFFF', pieLegendTextColor: '#CBD5E1', pieStrokeColor: '#111827', pieOuterStrokeColor: '#374151',
  git0: VIVID[0], git1: VIVID[1], git2: VIVID[2], git3: VIVID[3], git4: VIVID[4], git5: VIVID[5], git6: VIVID[6], git7: VIVID[7],
  cScale0: VIVID[0], cScale1: VIVID[1], cScale2: VIVID[2], cScale3: VIVID[3], cScale4: VIVID[4], cScale5: VIVID[5], cScale6: VIVID[6], cScale7: VIVID[7], cScale8: VIVID[8], cScale9: VIVID[9], cScale10: VIVID[10], cScale11: VIVID[11],
};
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
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'base', themeVariables: dark ? THEME_DARK : THEME_LIGHT, htmlLabels: false, flowchart: { htmlLabels: false, curve: 'basis', nodeSpacing: 45, rankSpacing: 55 }, maxTextSize: MAX_DIAGRAM, maxEdges: 2000 });
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
  // Hydrate mds-diagram widget placeholders: swap escaped SVG source for the
  // sanitized, themed widget body. SVG <style> survives via the svg profile.
  root.querySelectorAll('pre.mds-widget-src').forEach(pre => {
    const holder = pre.closest('.mds-widget');
    if (!holder) return;
    const title = holder.querySelector('.mds-widget-title')?.textContent || '';
    const clean = DOMPurify.sanitize(pre.textContent, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject'] });
    if (!/<svg[\s>]/i.test(clean)) return;
    const body = document.createElement('div'); body.className = 'mds-widget-body'; body.innerHTML = clean;
    const svg = body.querySelector('svg');
    if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto'; }
    pre.replaceWith(body);
    if (title) diagnostics.widgets++;
  });
  diagnostics.documents++;
  const done = Promise.all(jobs).then(() => { if (!signal.aborted) root.dataset.state = root.querySelector('.mds-diagram[data-state="error"]') ? 'partial' : 'ready'; });
  return { done, dispose: () => controller.abort() };
}

// -----------------------------------------------------------------------
// 对话内 Mermaid 渲染：MutationObserver 监听聊天流，把官方 CodeBlock 里的
// mermaid 围栏就地转成图表卡片。与右侧文档预览共用 diagramCard / repair /
// 队列，因此自动修复、主题适配行为一致。排除区（自身渲染产物、dsh-mermaid
// 的产物）避免同一块被渲染两次。
// -----------------------------------------------------------------------

const MERMAID_TYPES = new Set([
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'journey', 'timeline',
  'mindmap', 'gitGraph', 'quadrantChart', 'requirementDiagram', 'c4Context',
  'c4Container', 'c4Component', 'c4Dynamic', 'c4Deployment', 'block',
  'packet', 'architecture-beta', 'sankey-beta', 'xychart-beta', 'zenuml',
]);
const MERMAID_LANG_RE = /^language-(?:mermaid|mermaidjs|mmd)$/i;
function diagramTypeOf(source) {
  const m = /^\s*([A-Za-z][\w-]*)/.exec(source || '');
  return m ? m[1] : '';
}
function isMermaidCodeBlock(code) {
  const pre = code?.closest?.('pre');
  if (!pre) return false;
  const classes = Array.from(code.classList || []);
  if (classes.some((n) => MERMAID_LANG_RE.test(n))) return true;
  if (classes.some((n) => /^language-/i.test(n))) return false;
  return MERMAID_TYPES.has(diagramTypeOf((code.textContent || '').trim()));
}

const chatEntries = new Map(); // code element -> { wrapper?, pre?, timer?, text? }
const CHAT_STABLE_MS = 400;
let chatSignal = null;

function isInsideExcluded(el) {
  return !!el.closest?.('.mds-diagram, [data-mds-root], .dsh-mmd, .dsh-mds-mmd, .mds-widget');
}
function disposeChat(code) {
  const entry = chatEntries.get(code);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  // Put the original pre back before removing the wrapper, so React-owned
  // DOM stays where the framework placed it.
  if (entry.wrapper && entry.wrapper.isConnected) {
    const pre = entry.wrapper.querySelector(':scope > pre');
    if (pre) entry.wrapper.before(pre);
    entry.wrapper.remove();
  }
  chatEntries.delete(code);
}
/** Build a themed widget card for a model-authored SVG (chat side). */
function widgetCardFromCode(code, dark) {
  const pre = code.closest('pre');
  if (!pre) return null;
  const source = (code.textContent || '').trim();
  const clean = DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject'] });
  if (!/<svg[\s>]/i.test(clean)) return null;
  const title = (clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/[<>&]/g, '').trim().slice(0, 80);
  const card = document.createElement('section'); card.className = 'mds-widget'; card.dataset.state = 'ok';
  const bar = document.createElement('div'); bar.className = 'mds-widget-title'; bar.textContent = title || '图表';
  const body = document.createElement('div'); body.className = 'mds-widget-body'; body.innerHTML = clean;
  const svg = body.querySelector('svg');
  if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto'; }
  pre.before(card); pre.hidden = true; card.append(bar, body, pre);
  diagnostics.widgets++;
  return card;
}
export function watchMermaid(target, { getDark = () => false } = {}) {
  if (typeof document === 'undefined' || !target) return { dispose() {}, rebuildAll() {} };
  if (!chatSignal || chatSignal.signal.aborted) chatSignal = new AbortController();
  const schedule = (code) => {
    const entry = chatEntries.get(code) || {};
    if (entry.timer) clearTimeout(entry.timer);
    entry.text = (code.textContent || '').trim();
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (!code.isConnected || isInsideExcluded(code)) { disposeChat(code); return; }
      if (entry.wrapper) return;
      const pre = code.closest('pre');
      if (!pre) return;
      const source = (code.textContent || '').trim();
      if (source.startsWith('<svg')) { entry.wrapper = widgetCardFromCode(code, getDark()); if (entry.wrapper) return; }
      if (!isMermaidCodeBlock(code)) { disposeChat(code); return; }
      entry.wrapper = diagramCard(pre, getDark(), chatSignal.signal);
    }, CHAT_STABLE_MS);
    chatEntries.set(code, entry);
  };
  const observer = new MutationObserver((mutations) => {
    const seen = new Set();
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n.nodeType !== Node.ELEMENT_NODE) continue;
          if (n.matches?.('pre')) { const c = n.querySelector(':scope > code'); if (c) seen.add(c); }
          else if (n.matches?.('code')) seen.add(n);
          else if (n.querySelectorAll) n.querySelectorAll('pre > code').forEach((c) => seen.add(c));
        }
        for (const n of m.removedNodes) {
          if (n.nodeType !== Node.ELEMENT_NODE) continue;
          n.querySelectorAll?.('.mds-diagram').forEach((card) => {
            const pre = card.querySelector(':scope > pre');
            if (pre) { const c = pre.querySelector(':scope > code'); if (c) chatEntries.delete(c); }
          });
        }
      } else if (m.type === 'characterData') {
        const t = m.target.parentElement;
        const code = t && (t.matches?.('code') ? t : t.closest?.('code'));
        if (code) seen.add(code);
      }
    }
    // GC entries whose card left the DOM (message unmounted / list virtualization)
    for (const [code, entry] of chatEntries) {
      if (entry.wrapper && !entry.wrapper.isConnected) chatEntries.delete(code);
    }
    for (const code of seen) {
      if (!code.isConnected) continue;
      if (isInsideExcluded(code)) continue; // already rendered (by us or dsh-mermaid)
      const entry = chatEntries.get(code);
      if (entry && entry.wrapper) {
        if ((code.textContent || '').trim() === entry.text) continue;
        disposeChat(code); // stream rewrote the diagram: rebuild from scratch
      }
      if (isMermaidCodeBlock(code)) schedule(code);
    }
  });
  observer.observe(target, { childList: true, subtree: true, characterData: true });
  const rebuildAll = () => {
    for (const code of [...chatEntries.keys()]) {
      const entry = chatEntries.get(code);
      // Widget cards use explicit colors that work on both themes — skip.
      if (entry?.wrapper?.classList?.contains('mds-widget')) continue;
      if (!code.isConnected) { disposeChat(code); continue; }
      disposeChat(code);
      if (isMermaidCodeBlock(code)) schedule(code);
    }
  };
  return {
    dispose() {
      observer.disconnect();
      for (const code of [...chatEntries.keys()]) disposeChat(code);
      chatSignal = null;
    },
    rebuildAll,
  };
}
