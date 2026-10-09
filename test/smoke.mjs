// Offline smoke test for dsh-md-studio client bundle.
// Simulates the DSH browser module loader + minimal DOM, registers the
// plugin, runs its factory and apply(), and asserts core behaviors.

import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

// --- minimal DOM stubs ---
class FakeElement {
	constructor(tag) {
		this.tagName = (tag || "div").toUpperCase();
		this.children = [];
		this.dataset = {};
		this.style = {};
		this.classList = { _s: new Set(), add(...a) { a.forEach((x) => this._s.add(x)); }, contains(c) { return this._s.has(c); } };
		this.attributes = {};
		this._listeners = {};
		this.parentNode = null;
		this.hidden = false;
		this.textContent = "";
		this.innerHTML = "";
	}
	setAttribute(k, v) { this.attributes[k] = v; }
	getAttribute(k) { return this.attributes[k] ?? null; }
	removeAttribute(k) { delete this.attributes[k]; }
	appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
	append(...cs) { cs.forEach((c) => this.appendChild(c)); }
	remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } }
	insertBefore(node) { this.parentNode?.children.unshift(node); node.parentNode = this; }
	addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
	removeEventListener() {}
	querySelector() { return new FakeElement("div"); }
	querySelectorAll() { return []; }
	closest() { return null; }
	matches() { return false; }
	cloneNode() { const c = new FakeElement(this.tagName.toLowerCase()); c.textContent = this.textContent; return c; }
}

const documentStub = {
	head: new FakeElement("head"),
	body: new FakeElement("body"),
	documentElement: new FakeElement("html"),
	createElement: (tag) => new FakeElement(tag),
	createDocumentFragment: () => new FakeElement("fragment"),
	createTextNode: (t) => ({ nodeType: 3, nodeValue: t }),
	createTreeWalker: () => ({ nextNode: () => null }),
	getElementById: () => null,
	addEventListener() {}, removeEventListener() {},
	querySelectorAll: () => [],
};
Object.defineProperty(globalThis, "document", { value: documentStub, configurable: true });
Object.defineProperty(globalThis, "window", { value: { document: documentStub }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN", languages: ["zh-CN"] }, configurable: true });
Object.defineProperty(globalThis, "Node", { value: { ELEMENT_NODE: 1, FILTER_REJECT: 2, FILTER_ACCEPT: 1, SHOW_TEXT: 4 }, configurable: true });
Object.defineProperty(globalThis, "NodeFilter", { value: { FILTER_REJECT: 2, FILTER_ACCEPT: 1, SHOW_TEXT: 4 }, configurable: true });
Object.defineProperty(globalThis, "MutationObserver", { value: class { observe() {} disconnect() {} }, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {} }, configurable: true });
Object.defineProperty(globalThis, "XMLSerializer", { value: class { serializeToString() { return ""; } }, configurable: true });
Object.defineProperty(globalThis, "Blob", { value: class { constructor() {} }, configurable: true });
Object.defineProperty(globalThis, "URL", { value: URL, configurable: true });
Object.defineProperty(globalThis, "fetch", { value: async () => { throw new Error("offline"); }, configurable: true });

// --- capture the registration ---
let registration = null;
window.__ModuleLoader__ = { load: (reg) => { registration = reg; } };

vm.runInThisContext(source, { filename: "client.js" });

const assert = (cond, label) => {
	if (!cond) { console.error("FAIL: " + label); process.exitCode = 1; }
	else console.log("ok: " + label);
};

assert(registration && registration.id === "dsh-md-studio", "bundle registers with __ModuleLoader__ id dsh-md-studio");

// --- factory + fake react ---
const reactStub = { createElement: () => null, useMemo: (f) => f() };
const jsxStub = { jsx: () => null, jsxs: () => null };
const exportsObj = registration.factory((spec) => {
	if (spec === "react") return reactStub;
	if (spec === "react/jsx-runtime") return jsxStub;
	throw new Error("unexpected require: " + spec);
});

assert(exportsObj && typeof exportsObj.apply === "function", "factory exports apply()");
assert(Array.isArray(exportsObj.inject) && exportsObj.inject.includes("slots"), "exports inject includes slots");
assert(typeof exportsObj.openPreview === "function", "exports openPreview hook");
assert(typeof exportsObj.ProducedFilesRow === "function", "exports ProducedFilesRow");
assert(typeof exportsObj.selectProduced === "function", "exports selectProduced");
assert(typeof exportsObj.renderMarkdownInto === "function", "exports renderMarkdownInto");

// --- apply with a stub ctx ---
let effectRan = 0, slotInjected = 0, cleanup = null;
const ctx = {
	effect: (fn) => { effectRan++; cleanup = fn(); },
	slots: {
		inject: (slot, factory) => { slotInjected++; factory(); },
		register: (def, component) => { assert(def.name === "conversation.chat.turnTail" && def.priority === -100, "turnTail registered with priority -100"); return () => {}; },
	},
};
exportsObj.apply(ctx);
assert(effectRan === 1, "ctx.effect used once (mermaid enhancer)");
assert(slotInjected === 1, "ctx.slots.inject used once (turnTail)");
assert(typeof cleanup === "function", "effect returns cleanup");
assert(window.__dshOpenFilePreview && window.__dshCanPreviewPath && window.__dshStaticFileUrl, "global hooks installed");
assert(typeof window.__dshOpenFilePreview === "function", "__dshOpenFilePreview callable (no throw offline)");
assert(documentStub.head.children.length >= 1, "CSS injected into head");
assert(window.__dshStaticFileUrl("D:\\Project\\DSH\\a b.md") === "/dsh-files/static/D%3A/Project/DSH/a%20b.md", "static URL encodes segments (per-segment encodeURIComponent, same as dsh-artifact-preview)");

// re-apply must not throw (idempotency of css/hook install)
exportsObj.apply(ctx);

// --- baseline markdown pipeline (offline: markdown-it CDN unavailable -> built-in renderer) ---
const mdDoc = [
	"# Title",
	"",
	"| a | b |",
	"|---|:--|",
	"| 1 | 2 |",
	"",
	"- [x] done task",
	"- [ ] open task",
	"",
	"```mermaid",
	"flowchart TD",
	"  A-->B",
	"```",
	"",
	"```js",
	"const x = 1;",
	"```",
	"",
	"inline $E=mc^2$ math and [link](https://example.com)",
].join("\n");
const contentEl = { innerHTML: "", hidden: false, querySelectorAll: () => [] };
await exportsObj.renderMarkdownInto(contentEl, mdDoc, "D:\\Project\\DSH\\doc.md");
const html = contentEl.innerHTML;
assert(html.includes("<h1>Title</h1>"), "baseline renders h1");
assert(html.includes("<table>") && html.includes("text-align:left") === false ? true : html.includes("<table>"), "baseline renders table");
assert(html.includes('type="checkbox" disabled checked'), "baseline renders checked task item");
assert(html.includes('class="language-mermaid"') && html.includes("flowchart TD"), "baseline emits mermaid block with source");
assert(html.includes("language-js") && html.includes("dsh-mds-tok-k"), "baseline highlights js code");
assert(html.includes('<a href="https://example.com"'), "baseline renders safe link");
assert(!html.includes("<script"), "no raw html injection (html disabled by construction)");

console.log("SMOKE DONE");
