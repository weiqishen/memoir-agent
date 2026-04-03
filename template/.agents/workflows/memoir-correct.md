---
description: 历史纠偏命令。通过抓取旧数据节点，使用覆盖模式无缝修改过去写错的笔记或章节。
---

# 历史无痕无痛纠偏 (Memoir Correct Workflow)

当用户输入此 `/memoir-correct`（或 `/memoir correct`）命令时，意味着先前的记忆抓取或情绪描写存在谬误，你需要根据本命令触发纠偏流程。

1. **绝对禁止原样回答“抱歉，我打错字了，我已经更新（但不落地文件）”**。
2. 完全遵守 **[.agents/skills/biographer-skill/prompts/correction_handler.md](.agents/skills/biographer-skill/prompts/correction_handler.md)** 的指令行事。
3. 如果是段落描述谬误，必须调用工具读取原始文件的 markdown 源代码。
4. 在充分理解了报错点后，使用 `replace_file_content` 或 `multi_replace_file_content` 将这块腐肉**直接替换、覆盖掉**，不在文件中留下“我改过这篇日记”的补丁记录。
