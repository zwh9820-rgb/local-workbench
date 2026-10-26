# 本地 AI 内容生产工作台

黑白极简的本地内容生产台：**无限画布 + ComfyUI 调度 + 内嵌 Agent**。
所有数据保存在本机 SQLite，不上云；ComfyUI 与 LM Studio 作为外部独立程序运行，本应用只通过 HTTP 对接。

---

## 一、启动步骤

### 1. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（推荐 22） | 原生模块 better-sqlite3 需要 |
| ComfyUI | 任意较新版本 | 手动启动，默认 `http://127.0.0.1:8188` |
| LM Studio | 0.3+ | 加载支持 function calling 的 DeepSeek 模型，开启本地服务 `http://127.0.0.1:1234` |

### 2. 安装依赖

```bash
cd 项目目录
npm install
```

> Windows 上 `better-sqlite3` 有预编译包，正常无需 VS Build Tools。
> 若安装失败：`npm i -D windows-build-tools` 后重试，或改用 Node 22 LTS。

### 3. 配置环境变量

```bash
# Windows
copy .env.local.example .env.local
# macOS / Linux
cp .env.local.example .env.local
```

按需修改 `.env.local`（默认值即可直接跑）：

```env
DATABASE_URL=./data/workbench.db
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=deepseek-r1-distill-qwen-7b
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WS_URL=ws://127.0.0.1:8188/ws
```

### 4. 初始化数据库

```bash
npm run db:generate   # 生成迁移 SQL（已内置 0000_init.sql，可跳过）
npm run db:migrate    # 建表
```

> 首次 `npm run dev` 时也会自动迁移，第 4 步可省略。
> 想先看效果可以跑演示数据：`npm run db:seed`

### 5. 启动

```bash
npm run dev          # 开发模式 → http://localhost:3000
npm run build        # 生产构建
npm run start        # 生产启动
```

### 6. 启动外部服务

```bash
# ComfyUI（示例）
python main.py --listen 127.0.0.1 --port 8188
```

LM Studio：加载 DeepSeek 模型 → 打开 Local Server → 端口 1234 → 勾选 function calling 支持。

---

## 二、脚本说明

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | 由 schema 生成迁移 SQL |
| `npm run db:migrate` | 执行迁移 |
| `npm run db:push` | 直接把 schema 推到数据库（开发用） |
| `npm run db:studio` | Drizzle Studio 可视化查看数据 |
| `npm run db:seed` | 写入演示数据（仅在空库时生效） |

---

## 三、目录结构

```
├─ drizzle/                    迁移 SQL（0000_init.sql）
├─ data/                       SQLite 数据库 + settings.json（已 gitignore）
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx            根布局（防闪烁主题脚本 + AppShell）
│  │  ├─ page.tsx              总览：数据卡片 / 画布封面网格 / ComfyUI 任务
│  │  ├─ todo/                 待办（今日 / 本周 / 全部）
│  │  ├─ review/               每日复盘（Markdown）
│  │  ├─ inspiration/          灵感素材库
│  │  ├─ canvas/
│  │  │  ├─ page.tsx           画布列表
│  │  │  └─ [id]/              无限画布编辑器（React Flow v12）
│  │  ├─ agent/                内嵌 Agent 面板（接入中）
│  │  ├─ settings/             设置（ComfyUI / LM Studio / 备份 / 明暗）
│  │  └─ api/
│  │     ├─ search/            全局搜索（SQLite 精确 + fuse 模糊）
│  │     └─ backup/export/     导出 zip 备份
│  ├─ components/
│  │  ├─ layout/               侧边栏 / 顶栏 / 全局搜索 / 页面容器
│  │  ├─ ui/                   Button / Dialog / Card / Badge / Input
│  │  ├─ canvas/               画布卡片 / 节点渲染
│  │  └─ markdown/             Markdown 编辑器与预览
│  ├─ db/
│  │  ├─ schema.ts             8 张表定义
│  │  ├─ index.ts              连接单例 + 自动迁移
│  │  ├─ migrate.ts            迁移 CLI
│  │  └─ seed.ts               演示数据
│  ├─ server/
│  │  ├─ actions/              Server Actions（todo / inspiration / review / canvas / settings）
│  │  ├─ queries/              聚合查询（总览）
│  │  ├─ search.ts             全局搜索服务
│  │  └─ settings.ts           文件型设置存储
│  ├─ store/ui.ts              Zustand：主题 / 搜索面板 / 侧边栏
│  └─ lib/                     utils / constants
└─ tailwind.config.js          灰度主题 token
```

---

## 四、数据模型（8 张表）

| 表 | 用途 |
| --- | --- |
| `todo_items` | 待办任务（状态 / 优先级 / 截止时间 / 标签） |
| `events` | 日历日程（第一版仅总览简易展示） |
| `daily_review` | 每日复盘（`review_date` 唯一） |
| `inspiration` | 灵感素材（ongoing / paused / finished / abandoned） |
| `agent_session` | Agent 会话（消息流 JSON） |
| `agent_tool_log` | Agent 工具调用审计 |
| `canvas` | 画布 = 项目（`isTemplate` / `viewState` / `edges`） |
| `canvas_node` | 画布节点（7 种 nodeType，`meta` 存类型专属数据） |

> 设置项（ComfyUI / LM Studio 地址等）**不入库**，存 `data/settings.json`，
> 以严格保持 8 张表的约束，同时便于 Tauri 迁移。

---

## 五、快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/⌘ + K` | 全局搜索 |
| `Ctrl/⌘ + N` | 新建灵感 |
| `Ctrl/⌘ + T` | 新建待办 |
| `Esc` | 关闭弹层 |
| 画布内 `Delete` | 删除选中节点 |
| 画布内 `Space` + 拖拽 | 平移画布 |

> 浏览器会抢占 `Ctrl+T` / `Ctrl+N`（新标签页 / 新窗口）。Web 版在浏览器中可能失效，
> Tauri 打包后由 WebView 接管，可正常使用。

---

## 六、当前进度

已完成：

- 阶段 1–6：工程配置、8 表 schema、灰度主题、应用外壳、数据库层、UI 组件库
- 阶段 7：待办 / 灵感 / 复盘的完整 CRUD（Server Actions + Markdown 编辑）
- 阶段 8（部分）：画布列表、无限画布编辑器（拖拽 / 缩放 / 框选 / 连线 / 分组框 / 节点编辑 / 视口记忆 / 存为模板 / 模板复制）
- 阶段 11（部分）：全局搜索（Ctrl+K，SQLite + fuse）、导出 zip 备份
- 阶段 12（部分）：总览聚合卡片（画布封面网格 + ComfyUI 任务状态）

待接入（下一阶段）：

1. ComfyUI 调度：`/prompt` 提交、WebSocket 实时进度、`/view` 图片回填、PNG 内嵌 workflow 解析、抓取当前工作流
2. 内嵌 Agent：OpenAI SDK → LM Studio function calling，11 个工具 + 会话回放 + tool 日志
3. 画布增强：节点跨画布复制粘贴、`{{变量}}` 填充实例化、节点缩放把手
4. 长列表虚拟滚动、备份导入

---

## 七、Tauri v2 迁移提示

业务代码已按可迁移方式编写：

- 所有数据读写都在服务端（Server Actions / Route Handlers），无浏览器强依赖 API
- 数据库路径通过 `DATABASE_URL` 注入，改指 `AppData` 目录即可
- ComfyUI / LM Studio 均为 `http://127.0.0.1:*` 直连，`next.config.ts` 里的 `/comfy` 代理仅开发期解决跨域
- 不依赖 `window.localStorage` 存业务数据（只存主题等 UI 偏好）

打包时把 Next.js 以 Node sidecar 方式随 Tauri 启动，前端窗口加载本地端口即可。
