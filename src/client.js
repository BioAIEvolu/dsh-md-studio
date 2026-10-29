import React, { useEffect, useRef, useState } from 'react';
import { mountMarkdown, diagnostics, watchMermaid } from './renderer.js';
import css from './style.css';
import katexCss from 'katex/dist/katex.min.css';
import highlightCss from 'highlight.js/styles/github-dark.css';

export const name = 'dsh-md-studio';
export const inject = ['slots'];
const MARKDOWN_KEY = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown';

function darkMode() { return document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.dataset.theme === 'dark'; }

export function MarkdownBody({ content, resourceAddress, useResource }) {
  const resource = useResource(resourceAddress);
  const absolutePath = resource.value?.absolutePath;
  const root = useRef(null);
  const [dark, setDark] = useState(darkMode);
  const [source, setSource] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(darkMode()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!root.current || source || content.kind !== 'text') return;
    // P0 perf: the render only reads content.text, so content.eof must not be a
    // dependency — flipping eof at the end of a paginated read used to force one
    // more complete document render (and a full Mermaid re-render). Scheduling
    // through requestAnimationFrame also coalesces bursts of text updates (page
    // appends, auto-refresh reloads) into a single render per frame instead of
    // one full rebuild per store notification.
    root.current.dataset.state = 'rendering';
    let view = null;
    const frame = requestAnimationFrame(() => {
      if (!root.current || source) return;
      view = mountMarkdown(root.current, content.text, { documentPath: absolutePath, dark });
    });
    return () => {
      cancelAnimationFrame(frame);
      view?.dispose();
    };
  }, [content.kind, content.text, absolutePath, dark, source]);
  if (content.kind !== 'text') return React.createElement('p', null, '正在读取文档…');
  return React.createElement('section', { className: 'mds-native', 'data-md-studio': '1.3.0' },
    React.createElement('div', { className: 'mds-document-tools' },
      React.createElement('span', null, 'Markdown Studio'),
      React.createElement('button', { type: 'button', onClick: () => setSource(!source), 'aria-pressed': source }, source ? '阅读文档' : '查看源码')),
    source ? React.createElement('pre', { className: 'mds-raw-document' }, content.text)
      : React.createElement('div', { ref: root, 'data-document-markdown': true, 'data-mds-root': true }));
}

export function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.plugin = name; tag.textContent = `${css}\n${katexCss}\n${highlightCss}`;
    document.head.append(tag);
    diagnostics.active = true;
    // A read-only diagnostic snapshot, no paths or document content.
    const previous = Object.getOwnPropertyDescriptor(window, '__dshMdStudio');
    Object.defineProperty(window, '__dshMdStudio', { configurable: true, get: () => Object.freeze({ ...diagnostics }) });
    return () => {
      tag.remove(); diagnostics.active = false;
      if (previous) Object.defineProperty(window, '__dshMdStudio', previous);
      else delete window.__dshMdStudio;
    };
  }, 'Markdown Studio: local styles and lifetime');
  // v1.2: render Mermaid blocks inside the conversation stream. The watcher
  // skips regions already rendered by us (document preview) or by dsh-mermaid,
  // and re-renders everything on theme flips.
  ctx.effect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    const watcher = watchMermaid(document.body, { getDark: darkMode });
    const themeObserver = new MutationObserver(() => watcher.rebuildAll());
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    return () => { themeObserver.disconnect(); watcher.dispose(); };
  }, 'Markdown Studio: chat mermaid renderer');
  // This is DSH's native document body, not a second side panel or a turnTail override.
  ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: MARKDOWN_KEY, priority: -100,
  }, MarkdownBody));
}
