---
description: 提交记忆残片并抓取核心信息提取至回忆录时间线。支持图片/截图以及口述。
---

# 记忆入库流程 (Fragment Recall Workflow)

当调用此 `/recall` 命令时，你必须进入一个非常严格的资料入库解析流程。
请不要进行口语化的安慰，你需要完全按照 **[.agents/skills/biographer-skill/prompts/parsing.md](.agents/skills/biographer-skill/prompts/parsing.md)** 里的指令行事。

## 执行步骤：
1. 阅读用户附在指令后的内容或图片。
2. 依据 `parsing.md` 分解成 `Context`、`Conflict` 和 `Reflection` 三部分。
3. 判定它属于哪一段人生的目录（例如 `US_PhD`, `Undergrad` 等，不存在则自动推断英文标识名）。
4. **调用系统工具执行**对应的 Python 命令：
```bash
# 请将参数替换为你提取出的内容
python .agents/skills/biographer-skill/tools/timeline_manager.py \
    --action append \
    --period "[智能推断名]" \
    --file-slug "[下划线命名的事件标识]" \
    --date "[时间]" \
    --event "[简短事件名]" \
    --people "[人物1,人物2]" \
    --places "[父地点,父地点·子地点]" \
    --summary "[短记]" \
    --context "[...]" --conflict "[...]" --reflection "[...]" \
    --raw-input "[把用户的这句牢骚或图片的详细描述记录在这]"
```

