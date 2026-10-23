# 开发手册（CONTRIBUTING）

> 目标：三个月后你自己回来改，或者换个人接手，能在 10 分钟内知道「要改的东西在哪」。

---

## 0. 先搞清楚：在哪改

| 目录 | 用途 | 是否推送到 GitHub |
| --- | --- | --- |
| `D:\work buguojiban\cunc\2026-10-22-18-22-43\1\` | **仓库本体，以后只在这里改** | ✅ 是 |
| `D:\work buguojiban\cunc\2026-10-22-18-22-43\` | 最初的开发副本（带 node_modules / data） | ❌ 否 |

**第一次在 `1\` 里开发，先装依赖：**

```powershell
cd "D:\work buguojiban\cunc\2026-10-22-18-22-43\1"
npm install          # 约 10-15 分钟，530MB
npm run dev          # http://localhost:3000
```

装完之后 `1\` 就是完整可开发环境，外层那份可以留着当备份，也可以删掉避免搞混。

---

## 1. 架构速查（改代码前必读）

```
Tauri 窗口(WebView2) ──HTTP──▶ 127.0.0.1:34115 ──▶ node.exe + Next standalone
        ▲                                              │
        │ invoke（原生对话框/窗口）                        ├─ %APPDATA%\com.local.workbench\workbench.db
   Rust 壳（src-tauri/）                                ├─ ...\ai-material\
                                                        └─ ...\backups\
                                                        │
                                                        └─HTTP──▶ LM Studio 127.0.0.1:1234
```

**三条硬约束（改动时别破坏）：**

1. **业务逻辑全在 Next.js 服务端**（API Route + Drizzle + better-sqlite3 + Agent）。
   不要试图搬进 Rust，也不要让客户端组件直接 import `@/db`。
2. **前端只通过 `/api/*` 和 `@/lib/desktop` 与外部交互**。
   这样 Web 版和桌面版共用一套代码。
3. **数据目录由 `src/lib/paths.ts` 统一决定**。
   任何新增的文件读写都必须走它，不要硬编码 `process.cwd()`。

---

## 2. 改动菜谱

### 2.1 加一张数据表 / 加一个字段

| 步骤 | 文件 |
| --- | --- |
| ① 定义表 | `src/db/schema.ts` |
| ② 加建表 DDL（幂等，必须和 schema 一致） | `src/db/init.ts` |
| ③ 加校验 | `src/lib/validation.ts` |
| ④ 写 API | `src/app/api/<实体>/route.ts` + `[id]/route.ts` |
| ⑤ 页面用 | `src/components/<模块>/*.tsx` |

> 只加字段时：`schema.ts` + `init.ts` 的 `CREATE TABLE`（新库生效），
> 老库需要手写 `ALTER TABLE`，或在 `ensureSchema` 里加迁移语句。
> 记得同步 `src/db/seed.ts`（可选）。

### 2.2 加一个页面

1. `src/app/(dashboard)/<路由>/page.tsx`（server 组件 + Suspense 包装）
2. 具体实现放 `src/components/<模块>/<X>Client.tsx`（`'use client'`）
3. 导航项加到 `src/lib/constants.ts` 的 `NAV_ITEMS`
4. 需要搜索的话，在 `src/app/api/search/route.ts` 加一个分组

### 2.3 加一个 API

```
src/app/api/<名字>/route.ts          # GET / POST
src/app/api/<名字>/[id]/route.ts     # GET / PATCH / DELETE
```

约定：返回 `ok(data)` / `fail(msg, status)`（来自 `@/lib/http`），
入参一律 `xxxSchema.parse(await req.json())`。

### 2.4 加一个 Agent 工具 ⭐

| 步骤 | 位置 |
| --- | --- |
| ① 定义参数 Zod schema | `src/lib/agent/tools.ts` 顶部 |
| ② 实现 execute | 同一个文件，`AGENT_TOOLS` 数组里追加一项 |
| ③ 前端计数 | `src/components/agent/AgentClient.tsx` 底部「共 9 个工具」文案 |

JSON Schema 由 `zodToJsonSchema()` 自动生成，**不用手写**。
新增需要读文件的工具记得加 `requiresFiles: true`（仅 files 模式可用）。

⚠️ 不要在工具里做删除操作；写操作前先查后改（见 `updateInspiration` 的写法）。

### 2.5 改 Agent 的说话方式 / 规则

`src/lib/agent/prompt.ts` — `BASE_PROMPT`。
改完不需要动工具和循环。

### 2.6 改配色 / 布局

- 色板：`tailwind.config.js` 的 `colors`（brand / ink / paper / status）
- 全局样式与 Markdown 排版：`src/app/globals.css`
- 布局骨架：`src/app/(dashboard)/layout.tsx` + `components/layout/*`

### 2.7 加一个系统能力（原生对话框、托盘、开机自启…）

1. `src-tauri/Cargo.toml` 加依赖（或插件）
2. `src-tauri/src/lib.rs` 写 `#[tauri::command]`，注册到 `invoke_handler`
3. 需要权限的，在 `src-tauri/capabilities/default.json` 加最小权限
4. 前端通过 `src/lib/desktop/index.ts` 的 `invokeCmd('xxx')` 调用

⚠️ **不要**在 `capabilities` 里放开 `shell` / 任意路径 `fs` / 通配 `remote.urls`。

### 2.8 改端口（34115 被占用时）

三处必须同步：

| 文件 | 改什么 |
| --- | --- |
| `src-tauri/src/lib.rs` | `const SERVER_PORT` |
| `src-tauri/capabilities/default.json` | `remote.urls` |
| `src-tauri/tauri.conf.json` | `app.security.csp` 里的端口 |

---

## 3. 本地开发

```bash
npm run dev            # Web 版（改前端最快，浏览器里就能调）
npm run typecheck      # 改完必跑
npm run tauri:dev      # 桌面版（需本机有 Rust，见 TAURI.md）
npm run smoke:tools    # 验证 9 个 Agent 工具（不需要 LM Studio）
npm run mock:lm        # 假模型服务，配合 npm run agent:e2e 验证 Agent 循环
```

**改完提交前跑一遍：**

```bash
npm run typecheck
```

---

## 4. 提交与发布

### 4.1 日常更新（不出正式版）

```bash
git add -A
git commit -m "feat: 一句话说清改了什么"
git push
```

推送后 GitHub Actions 自动构建（约 10 分钟）：
**Actions → 最新运行 → 底部 Artifacts → `windows-x64-nsis-0.1.0.zip`**。

### 4.2 发正式版

版本号**三处必须一致**：

| 文件 | 字段 |
| --- | --- |
| `package.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `src-tauri/tauri.conf.json` | `"version"` |

```bash
# 改完三处版本号后
git add -A
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1
```

→ Releases 出现 Draft，编辑说明后 Publish。

> `Cargo.toml` 的版本决定运行时解压目录 `%APPDATA%\...\runtime\<版本>\`，
> bump 后新版会自动重新解压，不会和旧文件混用。

### 4.3 网络

GitHub 需要走代理（Clash Verge 混合端口，当前 `127.0.0.1:7897`）：

```bash
git config http.proxy  http://127.0.0.1:7897
git config https.proxy http://127.0.0.1:7897
```

已对本仓库配置过。换端口后重新设置；Clash 没开时会报 `Failed to connect to 127.0.0.1:7897`。

---

## 5. 出问题了看哪里

| 现象 | 先看 |
| --- | --- |
| 桌面版启动失败 | `%APPDATA%\com.local.workbench\logs\server.log`，对照 `TAURI.md` 的排查表 |
| 构建失败（红叉） | Actions 里红色那一步的日志 |
| Agent 不调工具 | 是否加载了支持 function calling 的 DeepSeek 模型 |
| 数据没了 | `%APPDATA%\com.local.workbench\workbench.db` 是否还在；有没有用「导入备份」覆盖 |

---

## 6. 别做的事

- ❌ 提交 `node_modules` / `.next` / `data` / `src-tauri/resources`（已在 `.gitignore`）
- ❌ 把 `.env.local`、数据库文件、备份 zip 传上去
- ❌ 在组件里直接 `import { db } from '@/db'`（只能服务端用）
- ❌ 给 Agent 加 shell 执行或任意路径读写
- ❌ 改 `src/lib/agent/loop.ts` 的核心循环（除非明确要改 Agent 行为）
