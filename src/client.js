import React, { useEffect, useRef, useState } from 'react';
import { mountMarkdown, diagnostics } from './renderer.js';
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
    const view = mountMarkdown(root.current, content.text, { documentPath: absolutePath, dark });
    return () => { view.dispose(); root.current?.replaceChildren(); };
  }, [content.kind, content.text, content.eof, absolutePath, dark, source]);
  if (content.kind !== 'text') return React.createElement('p', null, '正在读取文档…');
  return React.createElement('section', { className: 'mds-native', 'data-md-studio': '1.1.1' },
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
  // This is DSH's native document body, not a second side panel or a turnTail override.
  ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: MARKDOWN_KEY, priority: -100,
  }, MarkdownBody));
}
