# Visual Builder

中文 | [English](README_EN.md)

Visual Builder 是一个面向 Codex 的视觉风格入库总控技能。它将用户提供的设计图，或已有的 `visual_dna_system` 文档，转换为去品牌化、适配指定内容平台的插画风格候选包；三图校准通过并获人工批准后，直接注册到本地 `post-illustration-images` 用于生产配图。

它提取的是可复用的视觉语法，而不是对原图进行像素级复刻。源图中的品牌、主题、文案、专有名词和身份元素不会进入最终模板。

## 安装与强制依赖

使用 Codex 内置的 `skill-installer` 安装 Visual Builder：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/visual-builder \
  --path . \
  --name visual-builder
```

联系表渲染还要求系统 `PATH` 中存在 `rsvg-convert`（由 `librsvg` 提供）。macOS 使用 Homebrew 时可运行 `brew install librsvg`。预检会在创建候选之前验证该命令。

完整流程要求本地同时安装三个 skill：

| 位置 | Skill | 作用 |
| --- | --- | --- |
| 上游 | [`visual-dna-system`](https://github.com/BruceL017/visual-dna-skills) | 从设计图提取完整、去品牌化的 Visual DNA |
| 当前 | `visual-builder` | 编译、校准、验证并管理人工审批 |
| 下游 | [`post-illustration-images`](https://github.com/BruceL017/post-illustration-images) | 注册批准的样式并用于生产配图 |

安装上游提炼 skill：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/visual-dna-skills \
  --path skills/visual-dna-system \
  --name visual-dna-system
```

安装下游生产 skill：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/post-illustration-images \
  --path . \
  --name post-illustration-images
```

每次显式调用 `$visual-builder` 时，它会先检查三个 skill、下游验证/安装脚本和 `rsvg-convert`。任一依赖缺失时，流程会在创建候选之前停止；skill 缺失会列出官方安装来源并请求一次确认，运行时缺失会报告对应系统包。复检通过后在当前任务继续，不使用内置降级流程。

## 核心能力

- 支持设计图和 Visual DNA 两种输入模式。
- 检查颜色、字体、构图、形状、材质和插画语言等设计信号。
- 编译去品牌化的样式文档、结构化规范和文本提示词。
- 针对概念、流程和清单三种内容结构分别生成校准图。
- 执行尺寸、文件完整性、PNG 结构、评分和安全约束验证。
- 要求人工查看校准结果后，才允许批准和安装候选模板。

## 支持平台

| 平台 | 设计坐标系 | 比例 | 方向 |
| --- | ---: | ---: | --- |
| 微信公众号 | 1600 x 1200 | 4:3 | 横版 |
| 小红书 | 1080 x 1440 | 3:4 | 竖版 |
| 知乎 | 1600 x 900 | 16:9 | 横版 |
| 微博 | 1080 x 1440 | 3:4 | 竖版 |
| 今日头条 | 1600 x 900 | 16:9 | 横版 |

这些尺寸用于定义布局坐标。通过比例检查的校准图片会保留原生像素，不会被裁剪、填充、拉伸或强制缩放。今日头条图片的短边还必须不少于 900 像素。

## 工作流程

1. 检查三个本地 skill 和联系表运行时，必要时经确认安装缺失项并复检。
2. 明确输入模式、来源和目标平台。
3. 使用 `visual-dna-system` 提取或验证 Visual DNA，并通过设计信号与来源完整性检查。
4. 建议去品牌化的候选名称、用途和别名。
5. 编译样式文档、平台几何、提示词和候选元数据。
6. 独立生成概念、流程和清单三张校准图。
7. 执行机器 QA，选择最佳参考图并构建联系表。
8. 验证完整候选包，等待人工审核。
9. 人工明确批准后立即标记 `approved`、验证并注册到下游；成功后状态为 `installed`。

## 候选包结构

```text
${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>/
├── candidate.json
├── visual-dna.md
├── visual-dna.json
├── style.md
├── style.spec.json
├── provenance.json
├── prompts/
│   ├── concept.md
│   ├── process.md
│   └── checklist.md
├── calibration/
│   ├── concept.png
│   ├── process.png
│   ├── checklist.png
│   ├── style-reference.png
│   └── contact-sheet.png
└── qa.json
```

候选状态依次为 `draft`、`ready_for_review`、`approved` 和 `installed`；未通过硬性检查时使用 `blocked`。生成完成不等于审核完成，机器验证通过也不能替代人工批准。

人工批准同时授权下游验证和安装，不再进行第二次注册确认。安装失败时完整候选仍保留在固定候选库且状态保持 `approved`；安装成功后状态变为 `installed`。下游只保存样式 Markdown、spec、provenance、选定参考图和注册表/索引，不复制 Visual DNA、提示词、QA 或整套校准图。

## 使用方式

本 skill 仅在显式写出 `$visual-builder` 时调用。例如：

```text
使用 $visual-builder，把这张 1080 x 1440 的知识卡片构建为小红书插画风格。
移除原品牌和文案，保留纸张质感、编辑式层级和留白节奏；生成三张校准图后停下来，批准后直接注册到本地 post-illustration-images。
```

必填输入：

- `input_mode`：`image` 或 `visual-dna`
- `source`：图片路径，或包含 `visual_dna_system` 的 JSON/Markdown
- `target_platform`：`wechat`、`xhs`、`zhihu`、`weibo` 或 `toutiao`

新候选固定写入 `${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>`。跨任务续跑时，提供 `style_id`；旧候选也可通过绝对路径恢复。Visual Builder 不搜索其他目录，也不覆盖同名候选。

## 本地验证

运行测试：

```bash
node --test tests/*.test.mjs
```

检查三个本地 skill：

```bash
node scripts/check-companions.mjs --json
```

验证候选包：

```bash
node scripts/validate-candidate.mjs /absolute/path/to/candidate
```

人工审核后标记批准：

```bash
node scripts/mark-approved.mjs /absolute/path/to/candidate \
  --confirm-human-review \
  --confirmed-by "<reviewer>"
```

## 关键约束

- 不把源图交给图片生成后端。
- 不复制品牌、Logo、水印、角色、原文案或独特身份元素。
- 不把自然照片、纯 Logo 或缺乏设计系统的内容误判为可复用模板。
- 不从源图比例推断目标平台，目标平台必须由用户明确指定。
- 不在缺少三张校准图、机器 QA 或人工审核时安装模板。
- 不把校准参考图作为后续生成输入。

更完整的行为契约、编译规则和 QA 标准分别见 [candidate-contract.md](references/candidate-contract.md)、[compiler.md](references/compiler.md) 和 [qa.md](references/qa.md)。
