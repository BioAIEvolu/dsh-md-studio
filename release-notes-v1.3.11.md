## What's Changed

### DSH kernel compatibility claim made truthful

The plugin's `engines.dsh` lower bound was `>=0.2.0-rc.2 <0.3.0-0` — but the kernel it is actually built and tested against is `0.2.2-rc.5`. That range claimed support for `0.2.0-rc.2`, `0.2.2-rc.3` and `0.2.2-rc.4`, none of which were ever verified.

- `engines.dsh` is now `>=0.2.2-rc.5 <0.3.0-0` — the declared minimum equals the verified baseline
- README (zh/en), `COMPATIBILITY.md`, `market-index.json` and its generator script all carry the same range
- `COMPATIBILITY.md` support matrix now lists only `0.2.2-rc.5` as ✅ Verified; older kernels are marked as not advertised instead of falsely supported

### Internal

- Version constants in `src/client.js` / `src/renderer.js` bumped to `1.3.11`

All browser regression checks pass on DSH 0.2.2-rc.5 (24 checks, 0 page errors, 0 external requests).

---

If this release helps you, please consider starring the repo: https://github.com/BioAIEvolu/dsh-md-studio
