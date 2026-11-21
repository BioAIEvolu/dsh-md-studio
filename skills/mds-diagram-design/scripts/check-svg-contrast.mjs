#!/usr/bin/env node
// mds-diagram 配对比度检查器（零依赖）。
//
// 用法：
//   node check-svg-contrast.mjs diagram.svg     # 检查文件
//   node check-svg-contrast.mjs -               # 从 stdin 读
//   node check-svg-contrast.mjs --self-test     # 内置用例自检（CI 用）
//
// 规则（与 SKILL.md 的「文字对比度」一致）：
//   1. 压在色块上的 <text> 必须有可解析的 fill（自身属性 / 内联 style / 祖先 <g>）。
//   2. 文字色与该色块底的 WCAG 对比度 ≥ 4.5:1（含 opacity 衰减后）。
//   3. 画布级文字（下方没有色块）允许用 var(--dsw-alias-…) 主题变量，此时跳过对比度计算。
// 退出码：0 通过；1 有 error（warning 不影响退出码）。
import { readFileSync } from 'node:fs';

const TARGET = 4.5;
const PALETTE_FLOOR = 6; // 标准调色板实测 6.3–6.6:1；低于它多半是自创的浅色。

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i;

function parseColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (HEX_RE.test(raw)) {
    const h = raw.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 };
  }
  const m = RGB_RE.exec(raw);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a: Math.min(1, Math.max(0, alpha)) };
}
const channel = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const blend = (back, front, alpha) => ({
  r: back.r + (front.r - back.r) * alpha,
  g: back.g + (front.g - back.g) * alpha,
  b: back.b + (front.b - back.b) * alpha,
});
const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function parseAttrs(raw) {
  const map = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw))) map[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
  return map;
}
function fillOf(attrs) {
  if (attrs.fill) return attrs.fill.trim();
  const style = attrs.style || '';
  const m = /(?:^|;)\s*fill\s*:\s*([^;}]+)/i.exec(style);
  return m ? m[1].trim() : null;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// 逐标签扫描：维护 <g>/<svg> 的 fill 继承栈，收集形状和文字。
function scan(source) {
  const shapes = [];
  const texts = [];
  const stack = [];
  const tagRe = /<\s*(\/)?\s*([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;
  let m;
  while ((m = tagRe.exec(source))) {
    const closing = !!m[1];
    const name = m[2].toLowerCase();
    const selfClosing = !!m[4];
    if (closing) {
      if (name === 'g' || name === 'svg') stack.pop();
      continue;
    }
    const attrs = parseAttrs(m[3] || '');
    const inherited = stack.length ? stack[stack.length - 1] : null;
    const ownFill = fillOf(attrs);
    if (name === 'g' || name === 'svg') {
      if (!selfClosing) stack.push(ownFill || inherited);
      continue;
    }
    if (name === 'rect') {
      const x = num(attrs.x) ?? 0, y = num(attrs.y) ?? 0, w = num(attrs.width), h = num(attrs.height);
      if (w && h) shapes.push({ x, y, w, h, fill: ownFill || inherited, index: m.index });
    } else if (name === 'circle') {
      const cx = num(attrs.cx) ?? 0, cy = num(attrs.cy) ?? 0, r = num(attrs.r);
      if (r) shapes.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: ownFill || inherited, index: m.index });
    } else if (name === 'ellipse') {
      const cx = num(attrs.cx) ?? 0, cy = num(attrs.cy) ?? 0, rx = num(attrs.rx), ry = num(attrs.ry);
      if (rx && ry) shapes.push({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, fill: ownFill || inherited, index: m.index });
    } else if (name === 'text') {
      let label = '';
      if (!selfClosing) {
        const close = source.indexOf('</text>', tagRe.lastIndex);
        if (close !== -1) label = source.slice(tagRe.lastIndex, close).replace(/<[^>]+>/g, '').trim();
      }
      texts.push({
        label: label || '(未命名文字)',
        x: num(attrs.x) ?? 0,
        y: num(attrs.y) ?? 0,
        size: num(attrs['font-size']) ?? 12,
        fill: ownFill || inherited,
        opacity: num(attrs.opacity) ?? 1,
        fillOpacity: num(attrs['fill-opacity']) ?? 1,
        index: m.index,
      });
    }
  }
  return { shapes, texts };
}

function check(source) {
  const { shapes, texts } = scan(source);
  const errors = [];
  const warnings = [];
  for (const text of texts) {
    const backdrop = [...shapes]
      .filter((s) => s.index < text.index && text.x >= s.x - 2 && text.x <= s.x + s.w + 2 && text.y - text.size * 0.35 >= s.y - 2 && text.y - text.size * 0.35 <= s.y + s.h + 2)
      .pop();
    const shapeFill = backdrop ? parseColor(backdrop.fill) : null;
    const themeFill = /\bvar\(\s*--dsw-/.test(text.fill || '');
    if (!backdrop || !shapeFill) {
      if (!text.fill) {
        errors.push(`「${text.label}」没有 fill：画布级文字必须写 var(--dsw-alias-label-primary,…)，否则深色主题下会消失`);
      } else if (!themeFill) {
        const parsed = parseColor(text.fill);
        if (!parsed) warnings.push(`「${text.label}」的 fill「${text.fill}」无法解析，跳过对比度计算`);
      }
      continue;
    }
    if (!text.fill) {
      errors.push(`「${text.label}」压在 ${hex(shapeFill)} 色块上却没有 fill —— 会落到渲染器兜底（1.3:1 白底白字的典型来源）`);
      continue;
    }
    if (themeFill) {
      warnings.push(`「${text.label}」压在色块上却用了主题变量 fill，深浅主题下对比度不可控；色块内请用固定深色`);
      continue;
    }
    const fg = parseColor(text.fill);
    if (!fg) { warnings.push(`「${text.label}」的 fill「${text.fill}」无法解析`); continue; }
    const alpha = Math.min(1, Math.max(0, text.opacity * text.fillOpacity * fg.a));
    const shown = blend(shapeFill, fg, alpha);
    const ratio = contrast(shown, shapeFill);
    if (ratio < TARGET) {
      errors.push(`「${text.label}」${hex(fg)}${alpha < 1 ? ` @${Math.round(alpha * 100)}%` : ''} 压在 ${hex(shapeFill)} 上只有 ${ratio.toFixed(2)}:1（< ${TARGET}）`);
    } else if (ratio < PALETTE_FLOOR) {
      warnings.push(`「${text.label}」${hex(fg)} 压在 ${hex(shapeFill)} 上是 ${ratio.toFixed(2)}:1（达到 AA，但低于调色板基准 6:1）`);
    }
  }
  return { errors, warnings, shapes: shapes.length, texts: texts.length };
}

const FIXTURES = {
  '白色字压浅色芯片（坏例子）': '<svg viewBox="0 0 200 60"><rect x="10" y="10" width="180" height="40" fill="#B5D4F4"/><text x="100" y="36" text-anchor="middle" fill="#FFFFFF">白字浅底</text></svg>',
  '色块上缺 fill（坏例子）': '<svg viewBox="0 0 200 60"><rect x="10" y="10" width="180" height="40" fill="#B5D4F4"/><text x="100" y="36" text-anchor="middle">没写字色</text></svg>',
  '不透明度把深字压到 3.4:1（坏例子）': '<svg viewBox="0 0 200 60"><rect x="10" y="10" width="180" height="40" fill="#B5D4F4"/><text x="100" y="36" text-anchor="middle" fill="#0C447C" opacity="0.7">太淡</text></svg>',
  '标准调色板四色（好例子）': [
    '<svg viewBox="0 0 420 140">',
    '<rect x="10" y="10" width="180" height="40" fill="#B5D4F4"/><text x="100" y="36" text-anchor="middle" fill="#0C447C">核心</text>',
    '<rect x="210" y="10" width="180" height="40" fill="#FAC775"/><text x="300" y="36" text-anchor="middle" fill="#633806">人工门</text>',
    '<rect x="10" y="70" width="180" height="40" fill="#9FE1CB"/><text x="100" y="96" text-anchor="middle" fill="#085041">成功</text>',
    '<rect x="210" y="70" width="180" height="40" fill="#CECBF6"/><text x="300" y="96" text-anchor="middle" fill="#3C3489">外部</text>',
    '</svg>',
  ].join(''),
  '画布级文字用主题变量（好例子）': '<svg viewBox="0 0 200 60"><text x="10" y="36" style="fill:var(--dsw-alias-label-primary,#1F2937)">图例</text></svg>',
};
const EXPECT_FAIL = new Set(['白色字压浅色芯片（坏例子）', '色块上缺 fill（坏例子）', '不透明度把深字压到 3.4:1（坏例子）']);

function report(name, result) {
  const bad = result.errors.length > 0;
  console.log(`${bad ? '✗' : '✓'} ${name} — ${result.texts} 处文字 / ${result.shapes} 个色块`);
  for (const line of result.errors) console.log('   error: ' + line);
  for (const line of result.warnings) console.log('   warn : ' + line);
  return bad;
}

function selfTest() {
  let failed = 0;
  for (const [name, source] of Object.entries(FIXTURES)) {
    const bad = report(name, check(source));
    const expectBad = EXPECT_FAIL.has(name);
    if (bad !== expectBad) {
      failed++;
      console.log(`   ^ 期望${expectBad ? '报错' : '通过'}，实际相反`);
    }
  }
  console.log(failed ? `\n自检失败：${failed} 个用例行为不符合预期` : '\n自检通过：坏例子全部报错，好例子全部通过');
  return failed;
}

const arg = process.argv[2];
if (!arg) {
  console.log('用法：node check-svg-contrast.mjs <file.svg | -> | --self-test>');
  process.exit(2);
}
if (arg === '--self-test') process.exit(selfTest() ? 1 : 0);
const source = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
const result = check(source);
const bad = report(arg, result);
console.log(bad ? `\n发现 ${result.errors.length} 个对比度问题，请先修好再交付。` : '\n对比度检查通过。');
process.exit(bad ? 1 : 0);
