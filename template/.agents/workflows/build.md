---
description: 将最新的原始笔记和章节编译成网页可读的 manifest（单一派生文件），供 open_memoirs.pyw 浏览。
---

# 数据构建 (Build Workflow)

当调用 `/build` 命令时，执行以下步骤将所有 memoir 文件编译为前端可读格式。

## 执行步骤：

// turbo
1. **先执行流程守卫**：运行下列命令。如果返回非零，立即停止后续操作并把阻断原因告知用户。
   ```
   python .agents/skills/biographer-skill/tools/workflow_guard.py --action build
   ```
   - 仅当用户明确要求强制跳过时，才允许追加 `--force`，并告知会写入 `memoirs/.workflow_guard.log` 审计记录。

// turbo
2. **运行编译脚本**：读取 `periods/`，把章节正文嵌入 manifest，并把图片引用重写为 `/media/<period>/<file>` 路由：
   ```
   python .agents/skills/biographer-skill/tools/build_memoir_api.py
   ```
   输出位置：`memoirs/.cache/memoirs.manifest.json`（唯一派生文件，可随时删除重建）。
   - 个人数据只保留在 `memoirs/periods/`；构建不会再向 `webapp/public` 或 `dist` 复制任何数据。
   - 输入文件有 YAML 错误时构建会直接失败并列出文件，不会静默丢弃数据。

3. **（可选）完整前端重建**，仅在修改了 webapp 代码（`.tsx`/`.css`/`vite.config.ts`）后才需要：
   ```
   cd memoirs/webapp && npm run build
   ```
   - vite 只重建 app shell（`dist/` 中的静态资源）；数据仍由步骤 2 写入 `.cache`。
   - 前端开发模式（`npm run dev`）会通过内置插件直接读取 `.cache` 与 `periods/`，同样零拷贝。

## 完成后

- 打开 `open_memoirs.pyw`（或在已打开的窗口中按 `F5`）即可看到最新内容。
- `open_memoirs.pyw` 启动时会做 mtime 过期检查，数据有变化会自动重建 manifest。
- 知识图谱节点来源于 raw notes 的 `people:`（人物）和 `places:`（地点，支持 `父地点·子地点` FQN）两个字段。
