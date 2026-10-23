# AGENTS.md

> 给 AI 助手的项目说明书。**新会话第一件事：读这个文件 + `CONTRIBUTING.md`。**
> 人类读者请看 `README.md`（怎么用）和 `TAURI.md`（怎么打包）。

## 这是什么

本地个人工作台：灵感素材库 / 待办 / 日历 / 每日复盘 / 提示词模板 / AI 热点，
外加一个内嵌 Agent（function calling 直接读写本地数据）。

- 数据全部在本地 SQLite，不联网、不上云
- Agent 只连本机 LM Studio（`127.0.0.1:1234`），模型不内置、不打包
- 可打包为 Windows 桌面程序（Tauri v2）

## 技术栈与版本

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15 App Router + React 19 + TypeScript + Tailwind 3 |
| 服务端 | Next.js Route Handlers（Node runtime） |
| 数据库 | SQLite（better-sqlite3）+ Drizzle ORM 0.38 |
| 校验 | Zod 3（前后端共用一份 schema） |
| 状态 | Zustand（仅 UI 状态） |
| Agent | openai SDK → LM Studio `/v1`，原生 function calling |
| 桌面 | Tauri v2 + Node sidecar |

## 架构（最重要的一条）

Tauri 窗口里没有 Node，而业务层是 Next.js 服务端代码。所以：

```
WebView2 ──HTTP──▶ 127.0.0.1:34115 ──▶ node.exe + Next standalone（sidecar）
   ▲                                          │
   │ invoke（原生能力）                          ├─ %APPDATA%\com.local.workbench\*.db
Rust 壳（src-tauri/src/lib.rs）                 ├─ ...\ai-material\
                                               └─ ...\backups\
```

Rust 只负责：起 sidecar、注入 `WORKBENCH_DATA_DIR`、系统文件对话框、进程生命周期。
**业务逻辑一行都不在 Rust 里。**

## 硬约束（改代码前确认没违反）

1. 不改 `src/db/schema.ts` 的表结构（要加字段必须同时改 `init.ts` 的 DDL）
2. 不改 `src/lib/agent/loop.ts` 的核心循环、不改 `src/lib/agent/client.ts` 的通信方式
3. 客户端组件不得 import `@/db`（只能用 `/api/*`）
4. 所有文件路径必须经 `src/lib/paths.ts`，禁止硬编码 `process.cwd()`
5. Agent 工具禁止：shell 执行、任意路径读写、删除操作
6. 新增 Tauri 权限必须是**最小集合**（不要放开 shell / 通配 fs / 通配 remote）

## 文件地图

```
src/
├─ app/(dashboard)/        9 个页面（page.tsx 只做 Suspense 包装）
├─ app/api/                19 组接口（CRUD / search / dashboard / backup / agent）
├─ components/             页面实现（'use client'）+ ui 基础组件
├─ db/
│  ├─ schema.ts            9 张表定义 ← 改表结构看这里
│  ├─ init.ts              幂等建表 DDL ← 必须与 schema 同步
│  └─ index.ts             连接单例（WAL / 外键 / 单例缓存）
├─ lib/
│  ├─ paths.ts             数据目录解析（Web ↔ Tauri）← 路径都走这里
│  ├─ validation.ts        Zod schema（API + 表单共用）
│  ├─ backup.ts            zip 打包 / 落盘 / 导入路径校验
│  ├─ api.ts               前端请求层（迁移桌面只改这一层）
│  ├─ desktop/             isTauri / invoke 封装 / 备份双通道
│  └─ agent/
│     ├─ tools.ts          9 个工具（Zod 参数 + 执行）← 加工具看这里
│     ├─ loop.ts           agent 循环（勿改）
│     ├─ prompt.ts         系统提示词 ← 改说话方式看这里
│     ├─ client.ts         LM Studio 客户端（勿改）
│     ├─ files.ts          白名单读取（三重路径校验）
│     └─ zod-schema.ts     Zod → JSON Schema
└─ store/ui.ts             全局 UI 状态

src-tauri/
├─ tauri.conf.json         窗口 1280×800 / CSP / 打包资源 / NSIS
├─ Cargo.toml              Rust 依赖
├─ capabilities/default.json   IPC 来源白名单 + fs 最小权限
└─ src/lib.rs              起 sidecar、解压 server.zip、系统对话框

scripts/
├─ prepare-sidecar.mjs     next build → server.zip → node.exe
├─ gen-icons.mjs           生成 png/ico（零依赖）
├─ smoke-tools.ts          验证 9 个工具（不需要模型）
├─ mock-lm-server.js       假 LM Studio，配合 agent-e2e.ts
└─ desktop-smoke.ts        模拟桌面模式验证路径与备份
```

## 常用命令

```bash
npm run dev          # Web 开发（3000）
npm run typecheck    # 改完必跑
npm run tauri:dev    # 桌面调试（需 Rust）
npm run tauri:build  # 打 exe
npm run smoke:tools  # 工具自检
```

## 环境坑（本机实测过）

| 坑 | 说明 |
| --- | --- |
| GitHub 直连不通 | 必须走 Clash 代理 `127.0.0.1:7897`（已配在仓库级 git config） |
| better-sqlite3 编译失败 | 无 VS Build Tools 时用 `npx prebuild-install` 拉预编译二进制 |
| `.next` 清理被拦 | 本机 CLI 有 safe-delete 守卫，删不动时先 `mv .next /tmp/xxx` 再启动 |
| 无 Rust 工具链 | 本机 `cargo` 不可用，Rust 代码只能靠 GitHub Actions 验证 |
| 两份代码 | 仓库在 `1\`，外层目录是旧开发副本（带 node_modules），**以 `1\` 为准** |

## 改动菜谱

见 `CONTRIBUTING.md` 第 2 节：加表 / 加字段 / 加页面 / 加 API / 加工具 / 改配色 / 加原生能力 / 改端口。

## 交付前自检

```bash
npm run typecheck                 # 必须 0 error
npm run smoke:tools               # 9 个工具全绿
```

桌面相关改动额外确认：
- `tauri.conf.json` 的 `resources` 仍指向 `node.exe` + `server.zip`
- `capabilities/default.json` 没有放宽权限
- 改端口的话三处同步（见 CONTRIBUTING 2.8）
