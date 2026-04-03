---
description: 将指定阶段的记忆碎片融合，使用第一人称书写流畅的散文体回忆录章节。
---

# 撰写传记章节 (Memoir Build Workflow)

当调用此 `/memoir-build`（或 `/memoir build`）命令时，系统将停止记日记，转而进行“著书”。系统采用 **编年体静态书结构 (Chronological Static-Site Structure)**。

## 执行步骤：
1. **明确构建范围**：如果用户输入 `/memoir-build US_PhD`，代表要对该全卷进行排版渲染。如果用户输入了如 `/memoir-build US_PhD [某事件短记]`，则只渲染那一篇。
2. **编年体时间轴拉取**：调用工具（如 `view_file` 或 `grep_search`）提取目标阶段的 `timeline.yaml`。严格按照记录的时间线，依次准备阅读后续的 `raw_notes/*.md` 切片。
3. **单篇 (Commit) 渲染挂载**：调取 **[.agents/skills/biographer-skill/prompts/synthesis.md](.agents/skills/biographer-skill/prompts/synthesis.md)** 作为行文大纲，对时间线上的独立事件进行“纪实白描”渲染。
   - **核心约束**：大章节是生命历程（Period），每一轮归档的碎片就是一篇小章节（Commit）。不要把多个不同时间的无关事件硬揉成一长篇。
4. **生成落盘 (Chronological Naming)**：
   每次渲染完毕后，使用 `write_to_file` 直接在 `memoirs/periods/[阶段]/chapters/` 中落盘物理文件。
   文件名必须严格遵循：`YYYY-MM-DD_[简短英文事件名].md`，以此实现目录的文件字典排序。
5. **分卷续写防截断**：如果你发现该阶段下记录了几十片 raw_notes，严禁试图一次输出完成。可以先写完前三个小章节，随后主动向用户发起询问：“已完成某年某月章节，是否继续顺着时间轴生成下一章？”
