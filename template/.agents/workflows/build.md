---
description: 将最新的原始笔记和章节编译成网页可读的 manifest + markdown，并同步到 dist 目录，供 open_memoirs.pyw 浏览。
---

# 数据构建 (Build Workflow)

当调用 `/build` 命令时，执行以下步骤将所有 memoir 文件打包为前端可读格式。

## 执行步骤：

// turbo
1. **运行 API 编译脚本**，将 `raw_notes`、`chapters`、`timeline.yaml` 整合为 `memoirs.manifest.json`，并发布章节 markdown 到 `public/chapters/`：
   ```
   python .agents/skills/biographer-skill/tools/build_memoir_api.py
   ```
   输出位置：`memoirs/webapp/public/memoirs.manifest.json`

// turbo
2. **同步到 dist 目录**（供 `open_memoirs.pyw` 读取，无需完整重新构建前端）：
   ```
   copy memoirs\webapp\public\memoirs.manifest.json memoirs\webapp\dist\memoirs.manifest.json
   xcopy /E /I /Y memoirs\webapp\public\chapters memoirs\webapp\dist\chapters
   xcopy /E /I /Y memoirs\webapp\public\assets memoirs\webapp\dist\assets
   ```
   > 注：若 `dist/` 目录不存在，需先执行步骤 3。

3. **（可选）完整前端重建**，仅在修改了 webapp 代码（`.tsx`/`.css`）后才需要：
   ```
   cd memoirs/webapp && npm run build
   ```

## 完成后

- 打开 `open_memoirs.pyw`（或在已打开的窗口中按 `F5`）即可看到最新内容。
- 知识图谱节点来源于 raw notes 的 `people:`（人物）和 `places:`（顶级地点）两个字段。
