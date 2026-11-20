# dsh-md-studio v1.3.11 — DSH 0.2.2-rc.5 Compatibility Verification

**Date**: 2026-11-20  
**Plugin Version**: 1.3.11  
**DSH Kernel**: 0.2.2-rc.5（实测安装版本，`dsh --version`）  
**Declared Support**: `>=0.2.2-rc.5 <0.3.0-0`

## Version Range Policy

本插件只声明**实际验证过的内核下限**：`0.2.2-rc.5`。

- ✅ 声明最低版本 = 实测验证版本，两者一致
- ❌ 不再声称支持 `0.2.0-rc.2` / `0.2.2-rc.3` / `0.2.2-rc.4` —— 这些版本从未验证，此前的下限声明夸大了兼容范围
- 更低的内核版本属于「未验证」，不承诺可用；如在这些版本上遇到问题，欢迎提 issue

## Version Range Validation

✅ **DSH 0.2.2-rc.5 is the declared and verified baseline**

- Minimum: 0.2.2-rc.5
- Verified: 0.2.2-rc.5
- Maximum: < 0.3.0-0

## Test Suite Results

**Environment**: DSH 0.2.2-rc.5, desktop profile, Windows

All test scenarios passed:

### Rendering Tests
- ✅ Mermaid diagram rendering (40 diagrams)
- ✅ SVG widget creation (5 widgets)
- ✅ Document preview (9 documents)
- ✅ Syntax auto-repair (4 repaired)
- ✅ HTML sanitization
- ✅ Invalid diagram isolation

### Chat Integration Tests
- ✅ Chat mermaid rendering
- ✅ Chat streaming stability
- ✅ Chat no-double-render
- ✅ Chat bare-svg widget
- ✅ Plain code untouched
- ✅ Chat theme rebuild
- ✅ Chat disposal

### UI Features
- ✅ Source toggle
- ✅ Fullscreen mode
- ✅ SVG download
- ✅ Dark theme rerender
- ✅ File switching
- ✅ Plugin disposal

### Documentation Rendering
- ✅ Doc mds-diagram widget
- ✅ Doc bare-svg widget

## Real GUI Validation (session-3822c978)

**Test Date**: 2026-11-19  
**DSH Version**: 0.2.2-rc.5

### SVG Architecture Diagrams
- ✅ DSH-AIOS dual-loop architecture (1120×800)
- ✅ Complete rendering with title, legend, controls
- ✅ Height auto-adapt without truncation
- ✅ Light/dark theme support

### Math Formula Rendering
- ✅ Inline formulas: $E=mc^2$, $a^2+b^2=c^2$
- ✅ Block formulas: quadratic formula, matrices, Maxwell equations
- ✅ Special delimiters: `\(...\)` and `\[...\]`
- ✅ False-positive prevention: $5, $10, $HOME not rendered as formulas

### Mermaid Diagrams
- ✅ Flowcharts, sequence diagrams
- ✅ Syntax auto-repair
- ✅ Widget controls (fit width, fullscreen, download)

## Breaking Changes Check

**No breaking changes detected** between DSH 0.2.2-rc.3 (development reference) and 0.2.2-rc.5 (verified baseline):

- Plugin activation mechanism: ✅ Compatible
- Client injection lifecycle: ✅ Compatible
- File preview slot: ✅ Compatible
- Chat message DOM structure: ✅ Compatible
- Theme variables: ✅ Compatible
- HMR (Hot Module Reload): ✅ Compatible

## Plugin Manager Status

```json
{
  "entryId": "include:md-studio",
  "moduleName": "dsh-md-studio",
  "enabled": true,
  "fiberPhase": "active"
}
```

## Conclusion

✅ **dsh-md-studio v1.3.11 is fully compatible with DSH 0.2.2-rc.5**

All features work as expected:
- File preview rendering
- Chat-side rendering
- Mermaid diagrams
- Hand-drawn SVG (mds-diagram)
- KaTeX math formulas
- GFM tables, syntax highlighting

No code changes required for rc.5 support.

## Upgrade Path

Users on DSH 0.2.2-rc.5 can safely install or upgrade to dsh-md-studio v1.3.11:

```bash
# Install
npm install -g dsh-md-studio@1.3.11

# Or via DSH plugin manager
dsh plugin add dsh-md-studio
```

After installation, **restart DSH completely** (not just refresh) to activate the plugin.

## Version Support Matrix

| DSH Version | dsh-md-studio 1.3.11 | Notes |
|-------------|----------------------|-------|
| 0.2.0-rc.2  | ❌ Not advertised | Never verified — previous lower bound claimed unverified support |
| 0.2.0-rc.3  | ❌ Not advertised | Never verified |
| 0.2.1       | ❌ Not advertised | Never verified |
| 0.2.2-rc.3  | ❌ Not advertised | Development reference only, not a verified baseline |
| 0.2.2-rc.4  | ❌ Not advertised | Never verified |
| 0.2.2-rc.5  | ✅ Verified | Declared minimum, tested 2026-11-19 |
| 0.3.0+      | ❌ Not supported | Breaking changes expected |

---

**Next Review**: When DSH 0.3.0 is released, re-validate compatibility and update engines declaration if needed.
