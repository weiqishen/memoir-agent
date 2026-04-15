---
description: 结束倾听。将积攒在草稿区的所有素材做一次性的提取与归档。
---

# 封卷归档引擎 (Commit Workspace)

当用户输入 `/commit`，并说出“就酱”、“这就是全部了”、“归档吧”类结语时，意味着倾听者模式彻底结束，现在开始验收那本塞满碎片的草稿本！

## 执行步骤：
1. **先执行流程守卫**：运行下列命令。如果返回非零，立即停止后续操作并把阻断原因告知用户。
   ```bash
   python .agents/skills/biographer-skill/tools/workflow_guard.py --action commit
   ```
   - 仅当用户明确要求强制跳过时，才允许追加 `--force`，并告知会写入 `memoirs/.workflow_guard.log` 审计记录。
2. **调取全量线索**：调用 `view_file`，完整取出 `memoirs/.draft_buffer.md` 里的所有用户前期吐苦水连载的数据。
3. **三段式提炼结案**：遵循 **[.agents/skills/biographer-skill/prompts/parsing.md](.agents/skills/biographer-skill/prompts/parsing.md)** 里的指令。把草稿本里这团可能毫无章法、情绪混乱的长文本进行“背景、冲突、感悟”的正规三段式榨取。并根据全文的连词和事件推断出正确的阶段期 (`--period`)。
4. **执行系统落地**：组装并执行 `python .agents/skills/biographer-skill/tools/timeline_manager.py` 命令将这件完整的事情进行终极物理落盘。
5. **焚毁草稿本**：一旦确认 Python CLI 返回提取并新增成功的确认消息（且没报错）。你要马上用文件删除工具或指令，将 `memoirs/.draft_buffer.md` 这个烂摊子彻底清空或删除！以绝后患，保持环境卫生。
6. **告知用户**：“这件跨越多轮对话的事已经严丝合缝地封库完毕。草稿已焚毁。”
