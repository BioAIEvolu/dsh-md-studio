// 生成 DSH 官方插件市场索引文件 (Format 1)
// ⚠️ 以下字段名以官方校验器源码为准（README 文档有误）：
//   - 顶层字段是 "format"（不是 formatVersion）
//   - publishTimestamp 是 Unix 秒数整数（不是 ISO 字符串）
//   - title/description/icon/category 是插件级字段（不在 metadata.display 下）
//   - localizedText 必须包含 "en" 键
const fs = require('fs');

const index = {
  format: 1,
  // ⚠️ 顶层 title 必填（localizedText，必须含 "en" 键）
  title: {
    en: "BioAIEvolu DSH Plugins",
    zh: "BioAIEvolu 的 DSH 插件合集"
  },
  description: {
    en: "BioAIEvolu's DSH plugin collection: Markdown rendering, diagrams, math formulas, and more.",
    zh: "BioAIEvolu 的 DSH 插件合集：Markdown 渲染、图表、数学公式等。"
  },
  metadata: {
    name: "BioAIEvolu DSH Plugins",
    // ⚠️ 插件引用的 category/label id 必须先在这里声明（含 title）
    categories: {
      docs: { title: { en: "Docs & Rendering", zh: "文档与渲染" } }
    },
    labels: {},
    sortKeys: {}
  },
  plugins: [
    {
      name: "dsh-md-studio",
      title: {
        en: "Markdown Studio",
        zh: "Markdown Studio"
      },
      description: {
        en: "Complete Markdown renderer for file preview and chat: Mermaid diagrams, SVG architecture (mds-diagram), KaTeX math formulas, GFM tables. Offline.",
        zh: "文档预览+对话消息双场景完整 Markdown 渲染：Mermaid 图表、SVG 架构图、KaTeX 公式、GFM 表格。离线可用。"
      },
      icon: "https://raw.githubusercontent.com/BioAIEvolu/dsh-md-studio/main/docs/images/icon.svg",
      homepage: "https://github.com/BioAIEvolu/dsh-md-studio#readme",
      repository: {
        type: "git",
        url: "https://github.com/BioAIEvolu/dsh-md-studio.git"
      },
      metadata: {
        category: "docs",
        keywords: ["markdown", "mermaid", "svg", "katex", "math", "diagram", "flowchart", "gfm", "offline"]
      },
      versions: [
        {
          version: "1.3.10",
          publishTimestamp: Math.floor(new Date("2026-11-20T00:00:00Z").getTime() / 1000),
          source: {
            type: "npm",
            registry: "https://registry.npmjs.org/"
          },
          engines: {
            dsh: ">=0.2.0-rc.2 <0.3.0-0"
          }
        }
      ]
    }
  ]
};

fs.writeFileSync('market-index.json', JSON.stringify(index, null, 2));

// 自检
const bytes = fs.readFileSync('market-index.json');
const hasBOM = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
console.log('BOM:', hasBOM ? '❌' : '✅ 无 BOM');
const parsed = JSON.parse(fs.readFileSync('market-index.json', 'utf8'));
console.log('format:', parsed.format);
console.log('plugins[0].name:', parsed.plugins[0].name);
console.log('title.en:', parsed.plugins[0].title.en);
console.log('category:', parsed.plugins[0].metadata.category);
console.log('version:', parsed.plugins[0].versions[0].version);
console.log('publishTimestamp:', parsed.plugins[0].versions[0].publishTimestamp, '(Unix seconds)');
console.log('File size:', bytes.length, 'bytes');
