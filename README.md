# memoir-agent

> **一套由 Claude Code 驱动的个人回忆录归档系统。**
> 将你的碎片化叙述提炼为结构化回忆录，并通过内置桌面应用浏览你的人生地图。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **Claude Code 技能** | AI Agent 自动提取事件、人物、地点，写入结构化 raw note |
| **知识图谱** | 自动构建 人物 ↔ 事件 ↔ 地点 关系网络 |
| **层级地点视图** | FQN（完整限定名）地点树，支持 `父地点·子地点` 嵌套 |
| **桌面查看器** | 基于 pywebview 的无边框窗口，支持亮色/暗色主题 |
| **斜杠命令工作流** | `/recall` `/listen` `/commit` `/memoir-build` 全套命令 |

---

## 先决条件

| 依赖 | 版本 | 说明 |
|------|------|------|
| [Node.js](https://nodejs.org) | ≥ 16 | 运行 memoir CLI |
| [Python](https://python.org) | ≥ 3.8 | 运行编译器和桌面查看器 |
| [Claude Code](https://claude.ai/code) | 最新 | 提供 AI 记忆提取能力 |

---

## 安装

### 方式一：从 GitHub 安装（推荐）

```bash
npm install -g github:weiqishen/memoir-agent
```

> 安装时自动执行 `pip install pyyaml pywebview`。

### 方式二：从 npm 安装（可选，发布版）

```bash
npm install -g memoir-agent
```

### 手动安装 Python 依赖（如果自动安装失败）

```bash
pip install pyyaml pywebview
```

---

## 快速开始

```bash
# 1. 在任意目录初始化
mkdir my-memoirs && cd my-memoirs
memoir init

# 2. 编辑 entities.yaml，注册你的人物和地点
#    （格式见文件内的注释）

# 3. 打开 Claude Code，使用 /recall 归档第一条记忆
#    Claude 会自动调用工具写入 raw note 和 timeline

# 4. 编译数据
memoir build

# 5. 打开桌面查看器
memoir open
```

---

## CLI 命令

```
memoir init [dir]   初始化项目（当前目录或指定目录）
memoir build        编译 raw_notes → memoirs.json
memoir open         启动 pywebview 桌面查看器
memoir update       从 GitHub 默认分支更新 + 同步工具文件
memoir sync         仅同步工具文件（不升级 npm 包）
memoir --version    查看版本
memoir --help       查看帮助
```

---

## Claude Code 斜杠命令

在 Claude Code 中，以下命令由内置工作流驱动：

| 命令 | 用途 |
|------|------|
| `/recall` | 提交一段记忆碎片，AI 提取并归档 |
| `/listen` | 开启连续倾听模式，先草稿后批量提交 |
| `/commit` | 结束倾听，将草稿区内容一次性归档 |
| `/memoir-build` | 合成指定阶段的回忆录章节（散文体） |
| `/memoir-correct` | 纠正历史错误的笔记或章节（无痕覆盖） |
| `/build` | 编译 memoirs.json 并同步到查看器 |

---

## 项目结构

```
my-memoirs/
├── .agents/
│   ├── skills/biographer-skill/      # Claude Code 技能（AI 提取引擎）
│   │   ├── SKILL.md
│   │   ├── prompts/                  # parsing / synthesis / correction 提示词
│   │   └── tools/                   # build_memoir_api.py, timeline_manager.py
│   └── workflows/                   # 斜杠命令定义
├── memoirs/
│   ├── periods/                      # 【个人数据】各人生阶段
│   │   └── [阶段名]/
│   │       ├── timeline.yaml         # 结构化时间线
│   │       ├── raw_notes/            # 原始记忆片段（Markdown）
│   │       └── chapters/            # 合成章节（散文体）
│   └── webapp/
│       ├── src/                      # React 前端源码
│       └── dist/                     # 预编译静态文件（查看器直接使用）
├── entities.yaml                     # 【个人数据】人物 & 地点注册表
├── open_memoirs.pyw                  # 桌面查看器启动脚本
└── .gitignore                        # 已排除 periods/ 和 entities.yaml
```

> **重要**：`memoirs/periods/` 和 `entities.yaml` 包含个人数据，
> 已在 `.gitignore` 中排除，**请勿提交到公开仓库**。

---

## entities.yaml 配置

```yaml
people:
  "老王":
    display: "老王"

places:
  "虹桥火车站":
    display: "虹桥火车站"
  "虹桥火车站·二楼候车厅":
    display: "二楼候车厅"
    parent: "虹桥火车站"
```

**FQN 规则（地点限定名）**：
- 顶级地点直接写：`虹桥火车站`
- 子地点必须带父前缀：`虹桥火车站·二楼候车厅`（用中点 `·` 分隔）
- 禁止写裸名：`二楼候车厅`（不同地点都可能有此名，会产生歧义）

---

## 更新

```bash
# 从 GitHub 默认分支拉取最新代码并同步技能/工作流/预编译 UI
memoir update

# 仅同步工具文件（适用于已手动 npm install 新版本的情况）
memoir sync
```

`memoir update` 固定从 `github:weiqishen/memoir-agent` 更新，不再查询 npm registry 版本。

`update` / `sync` 会覆盖以下目录：
- `.agents/` （技能 + 工作流）
- `memoirs/webapp/src/`（前端源码）
- `memoirs/webapp/dist/`（预编译文件，**跳过** `memoirs.json`）

**绝不覆盖**：`entities.yaml` · `memoirs/periods/` · `.gitignore`

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + framer-motion |
| 桌面容器 | pywebview（无边框窗口，系统 Webview 渲染）|
| 数据编译 | Python 3 + PyYAML |
| AI 引擎 | Claude Code（技能 + 工作流）|
| Markdown 渲染 | react-markdown |
| 知识图谱 | react-force-graph-2d |

---

## License

MIT
