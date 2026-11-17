---
name: dsh-plugin-release-checklist
description: DSH 插件发布前和发布后的完整检查清单。发布前检查版本常量一致性、BOM、构建产物、回归测试；发布后检查 npm 索引、包内容、GitHub Release、GUI 刷新。当发布 dsh-md-studio 或任何 DSH 插件到 npm/GitHub 时使用。
metadata:
  vendor: dsh-md-studio
  version: "1.0"
---

# DSH 插件发布检查清单

## 一、发布前检查（Pre-Release）

### 1. 版本常量三方一致（最高优先级）

升版本号时，**必须同步修改三处**：

| 文件 | 字段 | 示例 |
|------|------|------|
| `package.json` | `version` | `"1.3.7"` |
| `src/client.js` | `data-md-studio` | `'1.3.7'` |
| `src/renderer.js` | `diagnostics.version` | `'1.3.7'` |

**检查命令**：
```powershell
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
"package.json: $($pkg.version)"
(Get-Content src/client.js -Raw) -match "data-md-studio': '([\d.]+)'" | ForEach-Object { "client.js: $($Matches[1])" }
(Get-Content src/renderer.js -Raw) -match "version: '([\d.]+)'" | ForEach-Object { "renderer.js: $($Matches[1])" }
```

**常见错误**：只改 `package.json` 忘了改源码常量 → npm 包内版本显示旧号 → 用户困惑。

### 2. package.json BOM 检查

`package.json` 首字节必须是 `7b`（`{`），**不能**是 `ef bb bf`（UTF-8 BOM）。

DSH harness 用 `JSON.parse` 读 manifest，BOM 会导致 `SyntaxError: Unexpected token '<BOM>'` 并回滚安装。

**检查命令**：
```powershell
$bytes = [System.IO.File]::ReadAllBytes('package.json')[0..2]
$hex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ' '
if ($hex -eq 'ef bb bf') { "❌ 有 BOM，必须修复" } else { "✅ 无 BOM" }
```

**修复方法**（PowerShell 写 JSON 会引入 BOM，必须无 BOM 写入）：
```powershell
[System.IO.File]::WriteAllText('package.json', $jsonContent, [System.Text.UTF8Encoding]::new($false))
```

### 3. 构建产物验证

```bash
npm run build
```

**验证 lib/client.js 包含关键函数**（防止 tree-shaking 误删）：
```powershell
$client = Get-Content lib/client.js -Raw
@('widgetCardFromCode','isSvgSource','localFilePath','sessionFileAddressFor') | ForEach-Object {
  "$_: $(if ($client -match $_) { '✅' } else { '❌ 缺失' })"
}
```

### 4. 回归测试

```bash
npm test
```

必须 **24 项全通过**，0 pageErrors，0 externalRequests。

### 5. npm pack 预演

```bash
npm pack --pack-destination /tmp/check
tar -xzf /tmp/check/dsh-md-studio-*.tgz -C /tmp/check
```

**解压后检查**：
- `package/package.json` 版本号正确
- `package/lib/client.js` 中 `data-md-studio` 与 package.json 一致
- `package/package.json` 无 BOM

## 二、发布执行

### GitHub 同步

```bash
git add -A
git commit -m "release: vX.X.X — <description>"
git push origin main
git tag -a vX.X.X -m "vX.X.X: <description>"
git push origin vX.X.X
```

### GitHub Release

```bash
gh release create vX.X.X ./artifacts/dsh-md-studio-X.X.X.tgz \
  --title "vX.X.X — <description>" \
  --notes-file release-notes-vX.X.X.md
```

**Release notes 必须包含**：
- What's New（用户视角的功能描述）
- Bug Fixes
- 末尾加 Star 引导："If this release helps you, please consider starring the repo"

### npm 发布

```bash
npm publish --access public
```

**注意**：
- npm 不允许同版本覆盖（immutable）
- unpublish 被 2FA 策略阻止（Granular access tokens 无法 unpublish）
- **升版本号是唯一选择**

## 三、发布后检查（Post-Release）

### 1. npm 索引更新验证

npm 发布后有 30-60 秒索引延迟，必须等待：

```powershell
# 等待并轮询
Start-Sleep -Seconds 45
npm view dsh-md-studio dist-tags.latest
# 必须显示新版本号
```

### 2. npm 包内容最终验证

```powershell
$tmpDir = "$env:TEMP\dsh-verify"
npm pack dsh-md-studio@X.X.X --pack-destination $tmpDir
tar -xzf "$tmpDir\*.tgz" -C $tmpDir
# 检查版本常量一致性
```

### 3. GitHub Release 验证

```bash
gh release view vX.X.X --json assets,url --jq '{url: .url, assets: [.assets[].name]}'
```

- 确认 assets 包含 `.tgz` 文件
- 确认 url 可访问

### 4. GUI 加载验证（link 模式）

如果插件通过 `link:` 模式安装到 DSH profile：

**必须提醒用户刷新页面**（F5）或重启 DSH 应用。link 包不会自动热重载。

验证方法：在 DSH 中打开 `window.__dshMdStudio.version`，确认显示新版本号。

## 四、常见问题速查

| 症状 | 根因 | 修复 |
|------|------|------|
| npm 包内版本显示旧号 | 源码版本常量未同步 | 升补丁版本号重新发布 |
| DSH 安装回滚，报 JSON 错误 | package.json 有 BOM | 无 BOM 重写，升版本号重新发布 |
| npm publish 403 | 2FA 策略 | 无法 unpublish，只能升版本号 |
| GUI 中功能未生效 | link 包未重载 | 刷新页面或重启 DSH |
| PowerShell 写 JSON 后 npm 报错 | PowerShell 引入 BOM | 用 `[System.IO.File]::WriteAllText` 无 BOM 写入 |

## 五、版本升级标准流程

```bash
# 1. 同步三处版本号
#    - package.json
#    - src/client.js 的 data-md-studio
#    - src/renderer.js 的 diagnostics.version

# 2. 构建 + 测试
npm run build
npm test

# 3. 预发布验证
npm pack --pack-destination /tmp/check
# 解压验证版本常量一致

# 4. 提交 + 推送 + 打 tag
git add -A
git commit -m "release: vX.X.X"
git push origin main
git tag -a vX.X.X -m "vX.X.X"
git push origin vX.X.X

# 5. 创建 GitHub Release
gh release create vX.X.X ./artifacts/*.tgz --notes-file release-notes.md

# 6. 发布 npm
npm publish --access public

# 7. 等待索引更新（45-60秒）
Start-Sleep -Seconds 60
npm view <pkg> dist-tags.latest  # 确认指向新版本

# 8. 最终验证
npm pack <pkg>@X.X.X --pack-destination /tmp/verify
# 解压检查版本常量
```
