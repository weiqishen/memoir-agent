# 单一数据源 · 图鲁棒性 · 一键升级 设计方案

> 目标版本：schema v2（包版本 0.2.0）
> 关联文档：`2026-06-21-fuzzy-time-support-design.md`
> 状态：待评审（决策点见 §11）

## 1. 背景与目标

本设计回应四项需求：

| # | 需求 | 验收方向 |
|---|------|----------|
| R1 | 真实项目中不存两份数据（文字/图片） | 工作项目内个人数据只存在于 `memoirs/periods/` 一处；派生数据仅一个可再造缓存 |
| R2 | 提升图结构鲁棒性 | 图数据可校验、可解释、不静默丢节点/边；前端防御性渲染 |
| R3 | 提升整体鲁棒性与交互性 | 写盘不再破坏数据；错误必须响亮；viewer 启动可靠；深链接/全文搜索/键盘操作 |
| R4 | 一键将旧项目升级到新版本 | `memoir update` 完成 安装→备份→迁移→同步→重建→报告，可 dry-run、可回滚 |

### 非目标（Non-goals）

- 不做 viewer 内编辑（编辑仍走 Claude Code 工作流）。
- 不做云同步/多人协作。
- 不删除 `periods/<period>/chapters/*.md`、`raw_notes/*.md` 源文件；它们仍是唯一源。
- 不引入前端构建期数据拷贝（vite `publicDir` 维持默认，仅承载 favicon/icon）。

---

## 2. 对上一轮提案的评审结论（修订）

上一轮给出的方向成立，评审后做以下修正：

| 原提案 | 修订 | 原因 |
|---|---|---|
| manifest 写到 `dist/memoirs.manifest.json` | 改写到 `memoirs/.cache/memoirs.manifest.json` | `vite build` 默认 `emptyOutDir` 会清空 dist；且 `.cache` 语义上明确为"可再造"，避免与源数据混淆 |
| 章节以文件形式继续发布到 public/dist | **章节正文嵌入 manifest**（`chapters[].content`） | 一次请求拿到全部内容，支撑 R3 全文搜索；`periods/chapters/` 仍是唯一源文件 |
| 图片复制到 public/assets → dist/assets | 统一路由 `/media/<period>/<file>`，由本地服务器映射到 `periods/<period>/assets/`，**零复制** | R1 核心；同时消灭 P0 隐私泄漏路径与 stale 资产累积 |
| `memoir export` 仅为可选 | export 保留，作为唯一允许物化副本的"分发打包"命令 | 明确"存储"与"分发"边界 |
| 重复 event id → 加后缀合并 | 改为 **build 硬失败**（`--force` 时保留首条并报告） | 后缀会改变引用，破坏"id 是稳定身份键"的既有契约 |
| 升级前自动备份 | **不做备份/回滚**（用户决策，选项 C）；安全网 = `--dry-run` 预演 + 迁移幂等 + 原子写 + 升级后 doctor 复查 | 用户明确选择不引入备份机制 |
| viewer 单实例复用 | 放弃单实例设计；动态端口 + 独立进程 | 复杂度与收益不成比例；双开两个窗口是可接受行为 |

### 2.1 评审中发现的新问题（纳入方案）

1. **`template-preparer` 隐私泄漏**：`sanitizeMemoirData` 未清理 `dist/assets/<period>/`，而当前 `memoir build` 会把私人图片同步进去。R1 落地后该目录不再有个人数据，但 Phase 0 需先加临时防线（见 §5）。
2. **`time_resolution_report.json` 未进 gitignore**：模板 gitignore 只忽略了 entity report；该报告含事件标题，属个人数据。Phase 0 修复。
3. **Lint 面**：`plans` 文档之外，本章节所有路径均以源码实际行为为准（已逐一核对 `cli.js` / `build_memoir_api.py` / `template-preparer.js`）。

---

## 3. 目标架构

### 3.1 数据流（After）

```
memoirs/periods/<period>/                      ← 唯一源数据（文本 + 图片）
├── timeline.yaml
├── raw_notes/*.md
├── chapters/*.md                              ← 合成源（引用 ../assets/<file>）
└── assets/*                                    ← 入库拷贝的原始图片

memoir build
  └─ build_memoir_api.py 读 periods/
       ├─ 重写章节内 ../assets/x.png → /media/<period>/x.png（仅内存改写，不改源文件）
       ├─ 章节正文嵌入 manifest
       └─ 写出唯一派生文件：
            memoirs/.cache/memoirs.manifest.json      （gitignored，可随时删除重建）
            memoirs/.entity_resolution_report.json    （人类报告，保持现状）
            memoirs/.time_resolution_report.json      （人类报告，保持现状）

memoir open
  └─ open_memoirs.pyw
       静态根 = memoirs/webapp/dist/               （app shell，vite 产物）
       路由：
         /memoirs.manifest.json   → memoirs/.cache/memoirs.manifest.json
         /media/<period>/<file>   → memoirs/periods/<period>/assets/<file>
       启动前：缓存缺失或过期（mtime 比较）→ 自动 rebuild；失败则显示错误退出

memoir export <dir>                              ← 唯一允许复制数据的路径
  └─ 复制 dist/ + manifest + media/ 为可移植静态包
```

### 3.2 删除项

- `cli.js`：`syncPublicAssetsToDist` / `syncPublicChaptersToDist` 调用段（cli.js:283-294）。
- `lib/build-asset-sync.js`（逻辑移入 export 命令）。
- `build_memoir_api.py`：`export_chapter_assets` 的复制行为（保留路径重写）、`publish_chapter_markdown`。
- 模板与用户项目中的 `memoirs/webapp/public/chapters/`、`public/assets/`、`public/memoirs.manifest.json`、`dist/chapters/`、`dist/assets/<period>/`。
- `.agents/workflows/build.md` 中的 xcopy 步骤。
- 死代码 `build_registry_maps` / `normalize_entity_key`（build_memoir_api.py:29-93）。

---

## 4. 数据契约

### 4.1 manifest v2

```json
{
  "schema_version": 2,
  "tool_version": "0.2.0",
  "generated_at": "2026-10-07T12:34:56+00:00",
  "memoirs": {
    "US_PhD": {
      "timeline": { "period": "US_PhD", "entries": [ /* 含 time 元数据，结构不变 */ ] },
      "chapters": [
        { "filename": "2024-Q3-first_semester.md", "content": "# ...改写后的 markdown..." }
      ]
    }
  },
  "graph": { "nodes": [], "links": [] },
  "people_index": {},
  "places_index": {},
  "places_meta": {},
  "issues": {
    "graph": {
      "duplicate_event_refs": [],
      "place_cycles": [],
      "missing_parents": [],
      "unknown_entities": [],
      "ambiguous_entities": [],
      "missing_raw_notes": []
    },
    "time": { "unresolved": [] },
    "entities": { "invalid_fields": [] }
  }
}
```

兼容策略：

- `chapters[]` 同时保留可选 `path`（v2 build 不再填）。前端 `loadChapterContent` 优先 `content`，缺失时回退 `fetch(path)` → 新旧项目都能看。
- 前端对 `schema_version` 缺失按 1 处理；v2 专属 UI（issues 徽标）仅在字段存在时显示。
- 图节点/边结构不变（新增 group=1 period hub 除外，旧前端 default 分支照常渲染）。

### 4.2 `.project.json`（新建，位于 `memoirs/.project.json`）

```json
{
  "project_schema": 2,
  "tool_version": "0.2.0",
  "last_upgraded_at": "2026-10-07T12:34:56+00:00"
}
```

schema 定义：

| schema | 特征 | 迁移入口 |
|---|---|---|
| 0 | timeline 条目无 `id` | 0→1：`migrate_timeline_ids.py --write` |
| 1 | 有 id/time；数据存在于 public/ + dist/ | 1→2：布局迁移（本设计） |
| 2 | 单源 + .cache manifest + /media 路由 | — |

无 `.project.json` 时由 doctor/upgrade 探测推断（存在 `public/memoirs.manifest.json` 或 `dist/chapters` → 1；存在无 id 的 timeline 条目 → 0）。

### 4.3 `/media` 路由契约

- URL：`/media/<period>/<filename>`，`filename` 为 `periods/<period>/assets/` 下的直接子文件（不允许子目录）。
- 服务器实现：`SimpleHTTPRequestHandler.translate_path` 覆写；URL-decode 后拒绝 `..`、`/`、`\`、绝对路径；`period` 必须是 `periods/` 下的真实目录名。
- build 侧：章节内 `![alt](../assets/x.png)` → `![alt](/media/<period>/x.png)`；已是 `/media/` 或外部 http(s) 的引用原样保留；引用绝对本地路径时拷贝到 `periods/<period>/assets/` 后改写（并入 issues 报告）。

### 4.4 图 issues 判定规则

| 规则 | 处理 |
|---|---|
| 同一 period 内重复 `id`（或手改 YAML 产生同 ref） | build 失败并列出冲突条目；`--force` 保留首条、报告其余 |
| place parent 成环 | 断开重复边（保留确定性的一条），写 `place_cycles` |
| parent 指向未注册地点 | 自动注册父占位（`{"aliases":[]}`），写 `missing_parents` |
| FQN `父·子` 无 `parent` 字段 | 推断 parent=父段；父不存在则登记；写 `missing_parents`（行为修复，不再静默丢层级） |
| 实体解析 ambiguous / unknown | 仍建节点与边，节点增加 `"unresolved": true`，写 issues；前端用虚线/浅色样式区分 |
| 事件无任何实体边 | 仍连到 period hub（group=1），`orphan` 只记入 issues 供 doctor 检查 |

---

## 5. 实施计划

### Phase 0 —— P0 修复（独立可发布）

| 文件 | 改动 |
|---|---|
| `build_memoir_api.py` | `parse_timeline` 不再吞 `YAMLError`：抛出带文件路径的错误，build 汇总所有坏文件后 exit 1；`entities.yaml` 同样包装 |
| `timeline_manager.py` | ① 入库标量用 `yaml_quote`（`json.dumps`，天然单行合法 YAML）拼接，替代裸 f-string（实施修订：不用 `safe_dump` 片段，保持既有双引号输出格式）；② 写入走 tmp+`os.replace`；③ 写前对"将写入的完整内容"重新解析并校验重复 id/字段，不通过则不落盘；④ `--event/--summary` 含引号/换行的回归测试 |
| `timeline_manager.py` | `correct` 支持 `--id`（优先）；`--date` 仅在唯一匹配时生效，多匹配时报错要求 `--id`；可改 `event`/`summary`/`date` |
| `template-preparer.js` | `sanitizeMemoirData` 增加按 periods 目录名清理 `dist/assets/<period>/`；`.gitignore` 增加 `.time_resolution_report.json` |
| `README.md` | 快速开始改为：`/recall` → `/memoir-build` → `memoir build`；补 guard 说明 |
| 图片同名覆盖 | `build_asset_filename`：目标存在且内容不同 → 追加 `sha1[:8]`；内容相同 → 跳过拷贝 |
| `build_memoir_api.py` | `_entity_values` 对字符串形式 people/places 宽容包装为单元素/逗号列表（记 `coerced_entity_fields`，不丢弃） |
| `scripts/run-python-tests.js` | 新增：根 `npm test` 的 Python 测试改用与 `cli.js` 一致的探测逻辑（含 Windows `where` 回退），修复 shim 环境下 npm test 直接失败 |

### Phase 1 —— 单一数据源（schema v2 运行时）

| 文件 | 改动 |
|---|---|
| `build_memoir_api.py` | 章节正文嵌入、`/media` 重写、只写 `.cache/memoirs.manifest.json`、`issues` 汇总、period hub 节点、FQN parent 推断、环/重复检测、删死代码 |
| `open_memoirs.pyw` | 动态端口（bind 0）、`/memoirs.manifest.json` 与 `/media/*` 路由、启动前 mtime 过期检查 + 自动 rebuild（失败弹错误页并退出）、路径穿越防护 |
| `cli.js` | `cmdBuild` 去掉复制段；`cmdOpen` 支持 `--no-build`；新增 `cmdExport`/`cmdDoctor` 骨架 |
| `vite.config.ts` | 新增 ~40 行 dev 插件：dev server 提供 `/memoirs.manifest.json` 与 `/media/*`（读 `../.cache` 与 `../periods`），带穿越防护 |
| `App.tsx` / `MemoryModal.tsx` / `types.ts` | `Chapter.content` 优先 + `path` 回退；`issues` 类型；搜索扩展（见 Phase 4 提前到本阶段实现基础版） |
| 模板/测试 | 删除 public chapters/assets/manifest；`prepare-template` 只写 `.cache` 骨架？否——模板不带 `.cache`，首启 rebuild；`npm-pack-contents`、`build-asset-sync`、`cli-build-guard`、`prepare-template` 测试同步更新 |

### Phase 2 —— 一键升级

| 组件 | 说明 |
|---|---|
| `migrations/`（包根，随 npm 发布） | `index.js` 注册表 + 每个迁移一个文件（Python 数据迁移 / JS 布局迁移），接口 `{ id, from, to, describe(), run(ctx), dryRun(ctx) }`，全部幂等 |
| `lib/upgrader.js` | 编排：探测项目根 → `syncTooling`（迁移依赖新工具）→ 执行迁移 → 重建 → 写 `.project.json` → 报告；任一步失败立即终止并 exit 1（迁移幂等，重跑安全） |
| `cli.js cmdUpdate` | 变为一键升级；`--dry-run`（只列迁移）、`--yes`（非交互）、`--tooling-only`（等价旧 sync）；`memoir upgrade` 为 `update` 的别名 |
| `cmdDoctor` | 检查：布局、YAML 可解析、重复 id、孤儿 raw note、缺章节、死链实体、place 环、图片碰撞、stale 派生目录；`--json` 输出；exit 0/2 |
| v1→v2 迁移清单 | ① 删 `public/chapters|assets|memoirs.manifest.json`；② 删 legacy `memoirs/webapp/*/memoirs.json`；③ 删 `dist/chapters` 与 `dist/assets/<period>`（仅删与 periods 同名子目录，保留 vite bundles）；④ 补 `id`（复用 migrate_timeline_ids，`--dry-run` 报告入升级报告）；⑤ 写入 `.project.json` |
| 测试 | fixture 旧项目 → `update --dry-run`（零副作用）→ `update --yes` → doctor 通过、manifest v2 等价；中断后重跑幂等 |

### Phase 3 —— 图鲁棒性（后端 + 前端）

| 层 | 改动 |
|---|---|
| 后端 | §4.4 规则全部实现 + issues 汇总；period hub（group=1，`event → period` 边 `type:"belongs_to"`） |
| `graphModel.ts` | 新增 `sanitizeGraph()`：过滤悬空边、去重边、兼容对象型端点、contains 遍历深度上限；新增 `belongsTo` 遍历支持 period hub 点击 |
| `GraphView.tsx` | ResizeObserver 自适应；节点大小按度数；图例可点击过滤 group；hover 高亮邻居；zoomToFit；点击 period hub → 切到该 period 时间线视图 |
| `PlacesView.tsx` | 保留 cycle 防线；"子地点"文案改 `t.childPlaces` |
| 测试 | cycle / dangling / duplicate / orphan / unresolved 五类 fixture 的解析与渲染断言 |

### Phase 4 —— 交互性

| 项 | 验收 |
|---|---|
| hash 深链接 | `#/event/<period>/<id>`、`#/place/<key>`、`#/year/<yyyy>`；load 时恢复；前进/后退可用；F5 保持现场 |
| 键盘 | Esc 关闭 modal（不再只关搜索）；Ctrl/Cmd+K 聚焦搜索；↑↓ 选择 + Enter 打开 |
| 全文搜索 | 覆盖 event/summary/people/places/chapters[].content；结果分组（事件/章节/人物/地点）；命中高亮 |
| 时间线 | 排序切换（authored ↔ `time.sort`）、period 折叠、年份跳转锚点 |
| 章节 | 图片 lightbox + 懒加载；长章节 TOC |
| 图 | 过滤/高亮/复位；period hub 导航 |
| i18n | 清理硬编码；新增 key（childPlaces、issues 徽标、lightbox 等） |

---

## 6. 依赖与兼容

- 前端兼容：v2 代码可读 v1 manifest（path 回退、schema_version 缺失）。反向不兼容（旧前端读 v2 会丢章节展示）——升级路径由 upgrade 保证 dist 同步更新。
- 工作流：`.agents/workflows/build.md`、`SKILL.md`、`README.md` 中的输出路径与步骤在 Phase 1 同步修改。
- Python 依赖不变：`pyyaml` + `pywebview`。迁移脚本仅用标准库 + pyyaml。
- npm 包 `files` 调整：移除 public manifest 条目；新增 `migrations/`、`lib/upgrader.js`；`prepack` 仅当存在 sourceRoot 时执行 prepare-template（否则警告跳过，见开放项 O3）。

## 7. 命令行为矩阵（After）

| 命令 | 行为 |
|---|---|
| `memoir init [dir]` | 不变；模板不再含 public 数据目录 |
| `memoir build [--force]` | guard + 编译 → 仅写 `.cache` manifest + 报告；YAML 错误 exit 1 |
| `memoir open [--no-build]` | 缓存过期/缺失自动 build → 动态端口 + 路由服务器 → webview |
| `memoir doctor [--json]` | 数据体检；不修改任何文件 |
| `memoir export <dir>` | 物化可移植静态包（复制是设计允许的唯一出口） |
| `memoir update [--dry-run] [--yes] [--tooling-only]` | 一键升级（安装→迁移→同步→重建→报告） |
| `memoir sync` | 保持现状：仅同步工具文件 |
| `memoir upgrade` | `update` 别名 |

## 8. 测试矩阵

| 层 | 新增测试 |
|---|---|
| Python | safe_dump 引号/换行回归；correct --id；build 对坏 YAML exit≠0；manifest v2 结构与 issues；FQN parent 推断；环检测；重复 id 硬失败/--force；/media 重写 |
| JS (CLI) | open 自动 build（集成）；upgrade dry-run 零副作用；upgrade 迁移后 doctor 通过；备份还原；export 内容不含 `.cache`/源文件 |
| Pack | 包含 migrations/；不含 public 数据目录与 `.cache`；不含 `__pycache__` |
| 前端 | timeModel（既有）；sanitizeGraph；路由解析；搜索索引；legacy manifest 回退渲染 |
| 安全 | `/media/../../entities.yaml` 等穿越用例全部 4xx/404 |

## 9. 风险

| 风险 | 缓解 |
|---|---|
| manifest 体积随章节增长 | 第一章先内嵌（个人量级预估 < 5MB）；doctor 在 > 10MB 时警告；后续可加可选分片 |
| `/media` 路由引入路径穿越 | 白名单字符 + 双解码防护 + 专门安全测试 |
| vite dev 插件与生产路由行为漂移 | 共用同一路由常量的 Node/TS 侧实现文档化；集成测试在 dev server 上跑 |
| 升级中断留下半态 | 迁移全部幂等、原子写；失败立即终止并打印已完成的步骤；doctor 可随时复查与续跑 |
| 用户直接 `npm run build`（vite）清 dist | 数据已不在 dist，仅 app shell 重建，无数据损失；doctor 提示需重新 `memoir build`（可选） |

## 10. 实施顺序与发布

1. Phase 0 单独提交并发布补丁版（修复数据破坏路径，风险最低，收益立刻）。
2. Phase 1+2 合并为 0.2.0（数据布局与升级框架互相依赖，一起发布才闭环）。
3. Phase 3 随 0.2.x 迭代；Phase 4 最后，按上表逐项验收。
4. 每个 Phase 的 CI 门槛：根 `npm test` 新增 `npm --prefix template/memoirs/webapp test`。

## 11. 决策点（已决策 + 待确认）

已决策（可推翻）：

- D1：manifest 放 `memoirs/.cache/`，不落 dist。
- D2：章节正文嵌入 manifest，源文件不动；前端兼容 legacy `path`。
- D3：图片零复制，`/media` 路由；`memoir export` 是唯一物化出口。
- D4：重复 event id 硬失败（`--force` 降级为报告）。
- D5（已确认）：升级不做备份/回滚；安全网 = `--dry-run` 预演 + 迁移幂等 + 原子写 + doctor 复查。
- D6：`update` 即一键升级；`sync` 保持工具同步。
- O1（已确认）：`memoir open` 采用 mtime 过期检查；无变化跳过重建，有变化自动重建。
- O2（已确认）：选项 C，不做备份/回滚命令。
- O3（已确认）：`prepack` 在 sourceRoot 缺失时跳过并警告，不阻塞发布。

无待确认项，设计冻结，可进入实施。

## 12. 实施记录（Phase 0–2，2026-10-07）

已落地：Phase 0 全部；Phase 1（单一数据源 + 图后端 issues / period hub / FQN 推断 / 重复引用硬失败）；Phase 2（doctor / upgrader / migrations / export / 一键 update）。

实施修订：

- `timeline_manager` 标量拼接采用 `yaml_quote`（`json.dumps`）而非 `safe_dump` 片段：保持既有双引号格式、天然单行，且写盘前对完整内容重新解析校验。
- `memoir update` 编排顺序调整为 **同步工具 → 迁移 → 重建**：补 id 迁移执行的是项目内刚同步的新脚本；全部迁移幂等，可安全重跑。
- schema 探测保守化：无 `.project.json` 且存在旧布局 ⇒ 记为 0，同时执行 001（幂等）+ 002；无旧布局 ⇒ 视为 2。
- doctor 输出使用 `[error]/[warn]/[info]` ASCII 前缀（避免 Windows cp936 管道编码问题）；退出码 0/2，`--json` 给机器读。
- viewer 服务器绑定 `127.0.0.1` 以避免 localhost 的 IPv6 解析不一致；媒体路由仅接受 `period/filename` 两段并做 `commonpath` 校验。
- 章节图片引用做 URL 编码（空格/中文文件名可安全经 `/media` 访问）。
- 前端 `graphModel` 新增 `belongs_to` 遍历；period hub 点击可列出该时期全部事件；图例增加"时期"色。
- 根 `npm test` 现包含：Node 测试 + Python 测试（解释器探测）+ 前端测试（node_modules 缺失时优雅跳过）。

未做（按 O2 决策）：升级备份/回滚。

## 13. 实施记录（Phase 3–4，2026-10-07）

**Phase 3（图鲁棒性前端）**

- `graphModel.ts`：新增 `sanitizeGraph()`（悬空边过滤、节点/边去重、对象型端点归一化）；contains 遍历增加迭代上限。
- `GraphView.tsx`：ResizeObserver 自适应画布；节点大小按度数；图例按钮过滤 group；hover 高亮邻居（其余半透明）；`onEngineStop` 自动 zoomToFit + "重置视图"按钮；点击 period hub 跳转时间线并滚动到该时期。
- 测试：sanitizeGraph（悬空/重复/对象端点）、contains 成环终止、belongs_to 遍历。

**Phase 4（交互性）**

- `routeModel.ts`：`#/event/<period>/<id>`、`#/place/<key>`、`#/year/<yyyy>` 解析/序列化；无 id 事件使用 `date~event` 回退并生成两种查找键；hashchange 驱动前进/后退，F5 恢复现场。
- 键盘：Esc 关 modal（否则关搜索）；Ctrl/Cmd+F 与 Ctrl/Cmd+K 聚焦搜索；搜索面板 ↑↓ 选择 + Enter 打开；选中项自动滚动可见。
- 搜索：覆盖 event/summary/章节正文（P1 基础）+ 人物/地点实体 chips（点击打开关联记忆）；结果内 `<mark>` 命中高亮。
- 时间线：归档顺序 ↔ 按 `time.sort` 排序切换；period 折叠；粘性年份导航条 + `#year-<yyyy>` 锚点。
- 章节：图片懒加载 + 灯箱（Esc/点击关闭）；自动提取 h1–h3 目录（≥4 条时显示），标题 id 与目录锚点共享同一 `headingId`。
- i18n：新增 childPlaces / matchedEntities / sortAuthored / sortByTime / toc / resetView；`PlacesView` 去除硬编码中文。
- 预编译 viewer 已用 `npm run build` 重新生成（旧 bundle 由 emptyOutDir 清理）。

**验证**：`npm test` = Node 12 + Python 65 + webapp 18 全通过；`tsc -b` 无错误。

## 14. 全面复核修复（2026-10-07 复审）

复核发现并修复：

- **打包缺文件（关键）**：`package.json` files 未包含 `lib/python-detector.js`，发布包中 updater/doctor 会 `MODULE_NOT_FOUND`。已补入并加 pack 断言。
- **doctor 崩溃**：`workflow_guard.load_yaml` 对坏 YAML 直接抛 `ScannerError`，导致 doctor 以 traceback 退出 1。已在 guard 层容错（返回空映射，由 build 负责响亮失败），并在 doctor 增加 `safe_check` 包装（任何检查崩溃都转为 error check，退出码仍为 2）。
- **升级降级风险**：项目 schema 高于工具支持时，原逻辑会"忽略迁移并重写为 2"。现 `upgradeProject` 在 dry-run/正式路径都直接拒绝，另加回归测试。
- **viewer 绑定不一致**：服务器实际绑定 `localhost`，而就绪探测/文档用 `127.0.0.1`；已统一为 `127.0.0.1`。
- **init 拷贝开发产物**：`memoir init` 会复制模板中的 `node_modules`/`__pycache__`（本地开发时数十秒~数百 MB）；已跳过（npm 发布版本就不含）。
- **用户 gitignore 缺项**：升级会写 `.timeline_id_migration_report.json`，模板 gitignore 未忽略；已补。
- **命令根目录探测**：`build`/`open`/`sync` 现在也跟随 `findProjectRoot`，支持在子目录执行（新增子目录 build 集成测试）。

复审新增测试：doctor `--json` 坏数据退出码 2、`update --dry-run` 零副作用、子目录 build、upgrader 拒绝新版 schema、viewer HTTP 集成（manifest/media/穿越/404）、guard 坏 YAML 不崩溃、pack 含 `python-detector.js` 与模板 gitignore 断言。

复审后全量：Node 16 + Python 68 + webapp 18；真实项目端到端冒烟（init→build→doctor→HTTP 路由→export→update --dry-run）全部通过。
