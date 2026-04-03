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

## entities.yaml 格式速查

```yaml
people:
  老王:
    aliases: [王博士, Wang]     # 同一人物的不同称呼

places:
  虹桥火车站:
    aliases: [虹桥站, 上海虹桥]  # 同一地点的不同称呼
  虹桥火车站·二楼候车厅:          # FQN：父地点·子地点
    display: 二楼候车厅           # App 中显示的短名
    parent: 虹桥火车站            # 包含关系（非等价）
    aliases: []
```
