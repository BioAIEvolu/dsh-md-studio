## What's New

### Mermaid double-quote auto-repair (fixes #12)
- Node labels containing bare ASCII double quotes — e.g. `C[TcpFailed 只留"关联在+拒连/超时"]` — previously failed to render with a parse error (`got 'STR'`)
- Such labels are now auto-repaired: the label is wrapped in quotes with inner double quotes converted to single quotes, so the diagram renders without any manual edit
- Already-quoted labels (including full-width quotes) are left untouched on both node and `|edge|` paths
- The parse-error hint now also mentions the double-quote rewrite

### Bug fixes
- Edge labels containing quotes and parentheses are no longer re-wrapped into an escaped `"\"…\""` nest that still failed to parse

### Internal
- CI: the browser test generates its React runtime on demand from devDependencies instead of relying on an uncommitted local file, restoring green CI on main

All 24+ regression tests passing (real Chromium).

---

If this release helps you, please consider starring the repo: https://github.com/BioAIEvolu/dsh-md-studio
