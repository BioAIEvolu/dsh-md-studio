## What's New

### Bug Fix
- Fixed version constant sync: `data-md-studio` in `src/client.js` and `diagnostics.version` in `src/renderer.js` now correctly show 1.3.7 (npm 1.3.6 package showed stale 1.3.5)
- Root cause: version bump only updated `package.json`, build artifact inherited stale constants
- No functional changes — metadata fix only

Same code as v1.3.6 (all features intact).

---

If this release helps you, please consider starring the repo: https://github.com/BioAIEvolu/dsh-md-studio
