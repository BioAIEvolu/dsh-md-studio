---
name: mds-diagram-design
description: 绘制高质量 SVG 示意图（架构图、流程图、分层图、对比图）。当需要在 DSH 对话或 Markdown 文档中输出 mds-diagram 图表、手写 SVG 图形、或要求"画个架构图/流程图/示意图"时使用——保证配色协调、布局合理、关系明确、深浅主题都可读。
metadata:
  vendor: dsh-md-studio
  version: "1.0"
---

# mds-diagram 绘图规范

输出形式：```` ```mds-diagram <可选标题> ```` 围栏，内容为**一个完整的手写 SVG**。对话中也可直接输出裸 `<svg>` 代码块，渲染器同样识别。简单流程图继续用 mermaid 围栏。

## 一、设计系统（色板）

节点用**浅色底 + 深色字**的软芯片（chip）配色——主题无关，深浅模式下可读性一致：

| 语义 | 底色 fill | 文字 fill | 强调/描边 |
|---|---|---|---|
| 主流程/核心 | `#B5D4F4` | `#0C447C` | `#85B7EB` |
| 警示/人工 | `#FAC775` | `#633806` | `#EF9F27` |
| 成功/通过 | `#9FE1CB` | `#085041` | `#5DCAA5` |
| 辅助/外部 | `#CECBF6` | `#3C3489` | `#AFA9EC` |
| 中性容器 | `var(--dsw-alias-bg-layer-2,#F6F8FA)` | `var(--dsw-alias-label-primary,#1F2937)` | `var(--dsw-alias-border-l1,#D0D7DE)` |

规则：
- 一个图**最多 4 种语义色**，超过时先合并语义而不是加颜色。
- 用了 ≥3 种颜色时，**必须有图例**（色块 12×12 rx=3 + 12px 文字，置于图顶部）。
- 实心节点上的主标题用白字 `#FFFFFF` 加粗；副标题用 `#FFFFFF` opacity `0.8`。

## 二、画布级文字（深色模式的关键）

直接画在透明底上的文字（图例、分组标签、注解），**必须**用主题变量，禁止硬编码深灰：

```xml
<text style="fill:var(--dsw-alias-label-primary,#1F2937)" font-size="12">图例</text>
```

这样文字会随 DSH 深浅主题自动翻转。硬编码 `#1F2937` 在深色模式下会不可见。

## 三、字体阶

| 层级 | 字号 | 字重 |
|---|---|---|
| 节点主标题 / 图标题 | 14–15 | 700 |
| 节点副标题 / 正文 | 13 | 400 |
| 图例 / 标签 / 注解 | 12 | 400 |

字体族：`system-ui, sans-serif`（根元素统一设置，子元素继承）。每张图在 `<svg>` 内放一个 `<title>` 描述用途（渲染为卡片标题）。

## 四、布局

- 根元素：`<svg viewBox="0 0 W H" width="100%" font-family="system-ui,sans-serif">`，不设背景色，不留多余的空白边。
- 画布边距 ≥24px；同类节点**等宽等高**、按网格对齐；节点间距 16–24px；层间距 ≥32px。
- 节点最小内边距 12px：文字到 rect 边缘 ≥12px；圆角 `rx=8`（小芯片）或 `rx=10`（大容器）。
- 一张图的节点数控制在 5–12 个；更多就拆成分组容器或拆成多张图。
- 长文本折行用多个 `<text>` 行（行高 = 字号 × 1.4），不要超出节点。

## 五、关系表达（关系明确）

- 箭头：`<defs>` 里定义一次 `<marker>`（id 加随机后缀防冲突），所有指向性连线共用。
- 线型语义：**实线 = 同步/强依赖，虚线（stroke-dasharray="6 4"）= 异步/可选，粗线 = 数据流，细线 = 控制流**。
- 每条语义不明显的连线加 12px 线上标签；纯结构连线可省。
- 分组/分层容器：themed 底色 + 1px 描边 + 左上角 12px 分组标签，组内成员缩进 ≥16px。
- 顺序步骤用编号圆徽：圆直径 24，底色用该节点语义色，白色居中数字。

## 六、输出前自查清单

1. viewBox 与实际内容贴合，没有大片空白？
2. 画布级文字全部用 `var(--dsw-alias-label-primary,…)`？
3. 节点主标题在底色上对比足够（深色字浅底 / 白字深底）？
4. ≥3 种颜色时有图例？
5. 连线都有箭头或明确语义？虚线/实线用法一致？
6. 同类节点对齐、等宽？文字都没有溢出？
7. `<title>` 已写？marker id 无冲突？
8. 单图节点 ≤12，超出已拆分？

**示例骨架**：

```xml
<svg viewBox="0 0 640 200" width="100%" font-family="system-ui,sans-serif">
  <title>请求处理流程</title>
  <defs>
    <marker id="arr-a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 Z" fill="#85B7EB"/>
    </marker>
  </defs>
  <!-- 图例 -->
  <rect x="24" y="16" width="12" height="12" rx="3" fill="#B5D4F4"/>
  <text x="42" y="26" font-size="12" style="fill:var(--dsw-alias-label-primary,#1F2937)">核心流程</text>
  <!-- 节点 -->
  <rect x="24" y="60" width="150" height="56" rx="8" fill="#B5D4F4"/>
  <text x="99" y="84" font-size="14" font-weight="700" text-anchor="middle" fill="#0C447C">接入层</text>
  <text x="99" y="102" font-size="12" text-anchor="middle" fill="#0C447C" opacity="0.75">校验与路由</text>
  <!-- 连线 -->
  <line x1="174" y1="88" x2="226" y2="88" stroke="#85B7EB" stroke-width="2" marker-end="url(#arr-a1)"/>
</svg>
```
