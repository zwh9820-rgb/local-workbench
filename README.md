# 本地个人工作台（Local Workbench）

一个**完全本地**的个人创作工作台：灵感素材库、待办、日历、复盘、提示词模板、AI 热点，
外加一个**内嵌 Agent**（方案 A：直接跑在 Next.js 服务端，通过 OpenAI 兼容协议对接本地 LM Studio）。

- 数据全部存本地 SQLite，不上云
- Agent 只连 `http://127.0.0.1:1234/v1`，不写任何云端 OpenAI key
- 不内置模型、不打包 LM Studio，LM Studio 作为外部独立程序运行
- 已适配 **Tauri v2**，可在 GitHub Actions 上直接构建 Windows exe（本机无需装 Rust）

## 文档导航

| 文档 | 看它做什么 |
| --- | --- |
| **README.md**（本文件） | 怎么装、怎么跑、怎么打包 |
| [TAURI.md](./TAURI.md) | 桌面化架构、环境安装、打包细节、**启动失败排查** |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | **要改功能先看这个**：改动菜谱、提交与发版流程 |
| [AGENTS.md](./AGENTS.md) | 给 AI 助手的项目说明书（新开会话先让它读这个） |

> 用 AI 助手改代码时，开头说一句「先读 AGENTS.md 和 CONTRIBUTING.md」，
> 它就能拿到架构约束、文件地图和踩过的坑，不用你重新解释一遍。

---

## 0. 用 GitHub Actions 打包 exe（推荐，零本地环境）

本机没有 Rust / VS Build Tools 也能出安装包：推到 GitHub，用云端 runner 构建。

```bash
# 1) 初始化并推送（在仓库根目录执行）
git init -b main
git add .
git commit -m "feat: 本地个人工作台 v0.1.0"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

推送后自动触发 `.github/workflows/build-windows.yml`：

| 触发方式 | 结果 |
| --- | --- |
| push 到 `main` | 构建 + 上传 artifact（Actions 页面底部可下载 zip） |
| 手动 `Run workflow` | 同上 |
| push tag `v0.1.0` | 构建 + 创建 **Draft Release** 并附上 `_x64-setup.exe` |

出包：

```bash
git tag v0.1.0
git push origin v0.1.0
```

然后到仓库 **Releases** 页面，编辑那条 draft、点 Publish 即可对外发布。

> 首次构建约 8–12 分钟（Rust 编译 + NSIS 打包），之后有 rust-cache 会快很多。
> 想加构建状态徽章，把下面这行贴到 README 顶部并替换 `OWNER/REPO`：
>
> ```markdown
> ![Build Windows EXE](https://github.com/OWNER/REPO/actions/workflows/build-windows.yml/badge.svg)
> ```

`ci.yml` 另外跑轻量检查（typecheck + `next build` + Agent 工具自检），几十秒出结果。

本地有 Rust 环境时也可以用 `npm run tauri:dev` / `npm run tauri:build`，详见 [TAURI.md](./TAURI.md)。

---

## 1. 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | ≥ 20（推荐 22） |
| npm | ≥ 10 |
| LM Studio | 任意较新版本，加载支持 function calling 的 DeepSeek 模型 |

> better-sqlite3 是原生模块，Windows 上如果安装失败，先装 Visual Studio Build Tools 或
> 使用 `npm i better-sqlite3 --build-from-source` 重试。

---

## 2. 安装与启动

```bash
# 1) 安装依赖
npm install

# 2) 复制环境变量
copy .env.local.example .env.local     # Windows
# cp .env.local.example .env.local     # macOS / Linux

# 3) 初始化数据库（二选一，推荐第一种）
npm run db:push        # 用 drizzle-kit 建表
npm run db:seed        # 可选：写入示例数据

# 4) 启动
npm run dev
```

打开 http://localhost:3000

> 说明：应用启动时 `src/db/init.ts` 也会执行一次幂等建表（`CREATE TABLE IF NOT EXISTS`），
> 所以即使跳过 `db:push` 也能直接跑起来。

### 打包生产版本

```bash
npm run build
npm run start
```

---

## 3. 启动 LM Studio（Agent 必需）

1. 打开 LM Studio → 搜索并下载 DeepSeek 系列模型（建议 `deepseek-r1-distill-qwen-7b` 或更大的指令模型）
2. 在 **Chat** 页加载模型，确认能正常对话
3. 打开左侧 **Developer**（本地服务器）页 → `Start Server`
4. 确认地址是 `http://127.0.0.1:1234`，接口路径 `/v1`
5. 打开模型配置，确认 **Function Calling / Tool Use** 已启用

回到工作台 `/agent`，顶部应显示「LM Studio 已连接」，并自动选中已加载的 DeepSeek 模型。
如果显示未连接，点右侧刷新按钮重新检测。

`.env.local` 里可固定模型：

```env
LM_STUDIO_MODEL=deepseek-r1-distill-qwen-7b
```

---

## 4. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `./data/workbench.db` | SQLite 文件路径（相对项目根或绝对路径） |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | 本地模型服务地址，**不要填云端** |
| `LM_STUDIO_API_KEY` | `lm-studio` | 协议占位，LM Studio 不校验 |
| `LM_STUDIO_MODEL` | `deepseek-r1-distill-qwen-7b` | 默认模型 ID |
| `AGENT_MAX_STEPS` | `6` | Agent 单轮最大工具循环次数 |
| `AGENT_TOOL_RESULT_LIMIT` | `4000` | 单次工具结果回灌给模型的字符上限 |
| `AI_MATERIAL_DIR` | `public/assets/ai-material` | Agent 文件白名单目录（必须在项目内） |

---

## 5. 目录结构

```
src/
├─ app/
│  ├─ (dashboard)/            # 共用布局：侧边栏 + 顶部搜索 + 主内容
│  │  ├─ page.tsx             # /            总览
│  │  ├─ calendar/            # /calendar    日历
│  │  ├─ ai-hot/              # /ai-hot      AI 热点
│  │  ├─ today-todo/          # /today-todo  今日待办
│  │  ├─ week-task/           # /week-task   本周任务
│  │  ├─ review/              # /review      今日复盘
│  │  ├─ inspiration/         # /inspiration 灵感素材库（核心）
│  │  ├─ prompt-template/     # /prompt-template 提示词模板
│  │  └─ agent/               # /agent       内嵌 Agent
│  ├─ api/                    # 所有服务端接口（CRUD / 搜索 / 备份 / Agent）
│  ├─ globals.css
│  └─ layout.tsx
├─ components/
│  ├─ layout/                 # Sidebar / TopBar / GlobalSearch / 剪贴板 / 快捷键
│  ├─ ui/                     # Button Card Modal Tag Badge Input Toast VirtualList…
│  ├─ editor/                 # MarkdownEditor / MarkdownView
│  ├─ inspiration/ todo/ calendar/ review/ prompt/ ai-hot/ dashboard/ agent/
├─ db/
│  ├─ schema.ts               # 9 张表（Drizzle）
│  ├─ index.ts                # 连接单例（WAL + 外键）
│  ├─ init.ts                 # 幂等建表 DDL
│  ├─ migrate.ts / seed.ts
├─ lib/
│  ├─ agent/                  # client(LM Studio) tools loop prompt files zod-schema
│  ├─ api.ts                  # 前端请求层（迁移 Tauri 只改这里）
│  ├─ validation.ts           # Zod：前后端共用
│  ├─ constants.ts / date.ts / utils.ts / http.ts
└─ store/ui.ts                # Zustand 全局 UI 状态
```

---

## 6. Agent 设计（方案 A）

**运行位置**：Next.js 服务端（Node runtime），不依赖任何外部 DSH 程序。

**调用链**：

```
前端 /agent
  → POST /api/agent/chat
    → src/lib/agent/loop.ts  （agent loop）
      → LM Studio /v1/chat/completions（OpenAI SDK，原生 function calling）
      → 若返回 tool_calls → executeTool() → 写 agent_tool_log → 结果回灌
      → 直到模型输出纯文本或达到 AGENT_MAX_STEPS
    → 整段消息写回 agent_session.messages
```

**可用工具（Zod 定义参数 + 运行时校验）**

| 工具 | 作用 |
| --- | --- |
| `listInspiration` | 检索灵感素材（关键词/标签/状态/类型） |
| `createInspiration` | 新建灵感条目 |
| `updateInspiration` | 改状态 / 进度 / 标题 / 正文 |
| `listTodo` | 查今日 / 本周任务 |
| `createTodo` | 新建待办 |
| `toggleTodo` | 勾选完成 / 取消完成 |
| `createReview` | 生成或覆盖某天复盘 |
| `searchAll` | 跨表 fuse 模糊检索 |
| `readWhiteListFile` | 读取素材白名单文件（**仅 files 模式**） |

**安全边界**

- 禁止 shell 执行、禁止任意路径读写、不提供删除工具
- 文件读取三重校验：拒绝绝对路径 → 拒绝 `..` → `resolve` 后必须仍在白名单根目录内
- 仅 `.md/.markdown/.json/.txt`，单文件 ≤ 512KB
- 文件读取默认关闭，必须在面板手动把模式切到「文件读取」
- 每次工具调用都写 `agent_tool_log`，面板可逐条查看参数、结果、耗时、错误

---

## 7. 全局能力

| 能力 | 位置 |
| --- | --- |
| 全局搜索（SQLite LIKE + fuse 模糊，三层检索） | 顶部搜索框 / `Ctrl+K` |
| 剪贴板快照 | 顶栏「剪贴板」抽屉，复制/粘贴自动入库，可一键转灵感 |
| 导出备份（db + 素材目录 → zip） | 顶栏「备份」 |
| 导入备份（ATTACH 逐表覆盖 + 素材还原） | 顶栏「导入」 |
| 选中文本 → 右键发送给 Agent | 任意页面 |
| 虚拟滚动 | 灵感库、会话列表 |

**快捷键**：`Ctrl+K` 搜索 · `Ctrl+N` 新建灵感 · `Ctrl+T` 新建待办 · `Ctrl+R` 复盘 · `Esc` 关闭弹窗

---

## 8. 数据库表

`events` / `todo_items` / `ai_hot` / `daily_review` / `inspiration` /
`prompt_templates` / `clipboard_snapshots` / `agent_session` / `agent_tool_log`

```bash
npm run db:generate   # 生成迁移 SQL 到 drizzle/
npm run db:migrate    # 执行迁移
npm run db:studio     # 可视化查看数据
```

---

## 9. 桌面版（Tauri v2）✅ 已完成

本项目已改造为可打包 Windows exe 的桌面应用，**完整说明见 [TAURI.md](./TAURI.md)**。

```bash
npm run tauri:dev      # 桌面调试（自动起 Next dev server）
npm run tauri:build    # 打包 exe（NSIS 安装包）
```

要点：

- 架构是「Tauri 窗口 + Node sidecar」，所以页面、Drizzle、Agent 全部原样复用
- 数据目录改为 `%APPDATA%\com.local.workbench`（db / ai-material / backups）
- 文件读写走 Rust 命令 + 系统对话框，Tauri fs 权限只放开该目录
- 网络白名单：CSP `connect-src` 只允许 `self` 与 `127.0.0.1:1234`
- 快捷键、右键菜单、Markdown 编辑器、虚拟滚动全部保留
- LM Studio 仍是外部独立程序，不内置、不打包模型

---

## 10. 自检脚本（联调前先跑一遍）

```bash
# 1) 不需要模型，直接验证 9 个工具、Zod 校验、路径白名单
npm run smoke:tools

# 2) 没有 LM Studio 时，用假模型服务验证完整 Agent 循环
npm run mock:lm      # 终端 A，监听 127.0.0.1:1234
npm run agent:e2e    # 终端 B，跑一轮 function calling

# 3) 数据库初始化 / 示例数据
npm run db:migrate
npm run db:seed
```

`smoke:tools` 会顺带验证路径穿越拦截：`../../../package.json` 与 `C:/Windows/win.ini`
都必须被拒绝，否则说明白名单校验有问题。

---

## 11. 常见问题

**Q：Agent 报「无法连接 LM Studio」**
A：确认 LM Studio 的 Developer 页已 Start Server，端口 1234，且已加载模型。

**Q：模型能聊天但从不调用工具**
A：该模型未启用 function calling，换 DeepSeek 指令模型；或在 LM Studio 模型配置里开启 Tool Use。

**Q：导入备份后数据没变化**
A：导入是逐表覆盖，已自动生效；如果页面缓存了旧数据，刷新一次即可。

**Q：想重置所有数据**
A：停止 dev server，删除 `data/` 目录，重新 `npm run db:push && npm run db:seed`。

**Q：`npm install` 报 `gyp ERR! find VS` / better-sqlite3 编译失败**
A：说明本机没有 C++ 构建工具，且预编译包没下载成功。优先走预编译（不需要 VS）：

```bash
cd node_modules/better-sqlite3
../../node_modules/.bin/prebuild-install        # Windows 也可用 npx prebuild-install
```

若仍失败，再装 Visual Studio Build Tools（勾选「使用 C++ 的桌面开发」）后
`npm rebuild better-sqlite3`。装好后用 `npm run smoke:tools` 验证，能跑就说明原生模块正常。
