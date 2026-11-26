## What's New

### Chat-side math formula rendering
- Inline math `$...$` and block math `$$...$$` now render as KaTeX in chat messages
- Supports `\(...\)`, `\[...\]`, and `\begin{align}` environments
- Anti-misjudge heuristics ported from dsh-TUI: prices ($5), shell vars ($HOME), ALL-CAPS, pure numbers are NOT rendered as math
- Graceful degradation: KaTeX parse failures show raw TeX source instead of red error markup
- Source/formula toggle button on each math card
- Theme-aware styling (dark/light mode)

### Bug fixes
- v1.3.8 npm publish was interrupted, republished as v1.3.9
- Tree-shaking guard: math functions attached to globalThis so esbuild keeps them in the bundle

All 24+ regression tests passing.

---

If this release helps you, please consider starring the repo: https://github.com/BioAIEvolu/dsh-md-studio
