---
name: biographer-engine
description: Use when receiving memory fragments, photos, or text from ANY period of the user's life (Childhood, Undergrad, PhD, Postdoc, etc.), or when asked to compile those into memoir chapters, or when the user corrects previous entries.
---

# 个人回忆录引擎 (Auto-Biographer)

## Overview

这是一个完全自动化且抗错乱的回忆录归档代理。基于**规则调度**与**真实的 Python I/O 写入**，安全持久化记忆碎片并合并生成长篇传记章节。

---

## Intent Routing (意图调度规则)

无论用户是通过原生指令 (`/recall`, `/listen` 等) 或自然对话，务必对输入意图进行识别，并**严格约束在大纲范围内**：

### 1. 记忆碎片入库 (接收碎碎念/照片)
触发条件：用户抛出未经整理的回忆片段、截图。
👉 **ACTION**: 严格执行 `.agents/skills/biographer-skill/prompts/parsing.md`。执行结构化提取，并调用 Python 引擎进行落盘 (`timeline.yaml` 与 `raw_notes/`)。

### 2. 连续倾诉模式 (缓存流接续)
触发条件：处于 `/listen` 模式下，或用户明示正在连载 ("还没讲完"、"接着说")。
👉 **ACTION**: 跃过解析引擎。调用 `write_to_file` 将内容安静地追加至 `memoirs/.draft_buffer.md` 草稿本（相对于工作区根目录）。仅做简短互动，不执行正式落盘。

### 3. 合成正式长文 (章节合并)
触发条件：用户明确要求合并成书（"写成一章"、"生成这阶段的传记" 或 `/memoir-build`）。
👉 **ACTION**: 严格执行 `.agents/skills/biographer-skill/prompts/synthesis.md`。将指定生命周期的所有原始数据融合成极简白描的高信息密度长文。

### 4. 历史无痕纠偏 (修正错误)
触发条件：用户纠正先前的记录（"我没有那么做"、"这句话不对"）。
👉 **ACTION**: 严格执行 `.agents/skills/biographer-skill/prompts/correction_handler.md`。停止系统解释，直接剥离并无痕覆写对应文本（Zero-trace Override）。

---

## 🚫 全局 Red Flags (系统红线)

若触碰以下红线，**立刻停止并回滚重做**：
1. ❌ **自作主张打码**：杜绝对人名、机构等实体隐私做抹除处理，保留原生态。
2. ❌ **过度捏造推演**：杜绝为追求剧情效果生造用户未陈述过的事实细节。
3. ❌ **脱离物理 I/O**：拒绝"口头附和"。所有的归档与更正必须生成实际的本地文件改动。
4. ❌ **裸骨子地点名**：禁止在 `--places` 中写 `二楼候车厅` 这类不带父前缀的子地点名；必须写完整限定名（见 parsing.md）。

---

## 目录结构 (Directory Structure)

```
memoirs/
├── periods/          ← 所有生命周期原始数据（动态扩展）
│   ├── Undergrad/
│   │   ├── timeline.yaml
│   │   ├── raw_notes/
│   │   └── chapters/
│   └── US_PhD/ ...
├── webapp/           ← 前端展示应用（不动）
└── entities.yaml     ← 人物/地点别名与层级注册表（随项目增长）
```

`timeline_manager.py` 会自动在 `periods/` 下创建对应的生命周期目录，无需手动操作。
推断出英文简写 (如 `Childhood`, `US_PhD`, `FirstJob`) 作为 `--period` 参数即可。

## 时间字段速查

`timeline.yaml` 的 `date` 字段可以保留材料真实支持的粒度：`YYYY-MM-DD`、`YYYY-MM`、`YYYY`、`YYYY-Q3`、`YYYY年第三季度`、`约YYYY年`。不要为了排序而编造具体日。编译器会在 `memoirs.manifest.json` 中补充规范化 `time` 元数据，并把无法解析或歧义的时间写入 `memoirs/.time_resolution_report.json`。

粗粒度时间的章节文件名应包含稳定事件 slug 或 timeline `id`，例如 `2024-Q3-first_semester.md`，避免 `2024` 这类年份级时间误匹配其他 `2024-*` 章节。

## 事件唯一标识符

新入库笔记的唯一标识符来自 `--file-slug`。`timeline_manager.py` 会写入 `id: "<file-slug>"`，编译器和前端会优先使用 `period|id` 作为事件引用。`event` 标题只是展示文案，后续可以修改，不应作为身份键。同一 period 下不得复用同一个 `file-slug`。

旧笔记可使用迁移脚本补齐 `id`：

```bash
python .agents/skills/biographer-skill/tools/migrate_timeline_ids.py --dry-run
python .agents/skills/biographer-skill/tools/migrate_timeline_ids.py --write
```

脚本会从 `related_files` 的 raw note 文件名生成 `id`，并把 `old_ref -> new_ref` 写入 `memoirs/.timeline_id_migration_report.json`。

## 地点标签粒度

地点标签支持“城市/地区 -> 场所 -> 子地点”层级。多个子地点可以同时作为事件地点存在，比如一篇笔记可同时涉及商场停车场和商场餐厅。子地点必须写成 `父地点·子地点` FQN，不能写裸名。更大区域归属不应把场所塌缩掉，例如 `橡树购物中心 parent: 甘村` 仍保留 `橡树购物中心` 作为事件地点，同时可通过父级关系归入 `甘村`。

## memoirs/entities.yaml 格式速查

```yaml
people:
  老王:
    display: 老王
    aliases: [王博士, Wang, Lao Wang]     # 同一人物的不同语言、简称、外号

places:
  虹桥火车站:
    display: 虹桥火车站
    aliases: [虹桥站, 上海虹桥, Hongqiao Railway Station]  # 同一地点的不同语言、简称
  虹桥火车站·二楼候车厅:          # FQN：父地点·子地点
    display: 二楼候车厅           # App 中显示的短名
    parent: 虹桥火车站            # 包含关系（非等价）
    aliases: [候车厅, waiting hall]
```

实体解析器会做大小写、全角半角、常见分隔符和空白归一化；父地点 alias 会自动与子地点 alias 组合。
例如 `UF／Commuter Lot`、`University of Florida - commuter lot` 可解析到 `佛罗里达大学·通勤停车场`。
若裸子地点 alias 同时命中多个地点（如多个 `library`），编译器会写入 `memoirs/.entity_resolution_report.json`，不会静默归入任意一个地点。
