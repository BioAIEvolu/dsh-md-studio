## What's Changed

### README badges now match the declared kernel range

v1.3.11 narrowed `engines.dsh` to `>=0.2.2-rc.5 <0.3.0-0`, but the README badges (zh + en) still showed `0.2.0-rc.2` — and badges are the first compatibility claim anyone sees on GitHub and on the npm page.

- Both README badges now read `0.2.2-rc.5`
- Everything now agrees: `package.json`, `COMPATIBILITY.md`, `market-index.json`, README text and badges

### Skill update shipped in the package

- The bundled `dsh-plugin-release-checklist` skill gained a mandatory pre-release step 0: **DSH kernel version reconciliation** — the declared `engines.dsh` minimum must equal the kernel that was actually validated, and every carrier (package.json / market index / README / compatibility doc / badges / contract tests) must say the same thing.

All browser regression checks pass on DSH 0.2.2-rc.5 (24 checks, 0 page errors, 0 external requests).

---

If this release helps you, please consider starring the repo: https://github.com/BioAIEvolu/dsh-md-studio
