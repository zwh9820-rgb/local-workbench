# Tauri v2 桌面化改造说明

把现有 Next.js 工作台打包成 Windows 桌面程序（exe）。
**业务代码零重写**：页面、Drizzle 表结构、Agent 工具与循环、LM Studio 通信全部原样保留。

---

## 0. 一句话架构

> Tauri 只做「窗口 + 原生能力 + 进程管理」，业务仍然跑在 Node 里。

```
┌──────────────────────── Tauri 进程（本地个人工作台.exe）────────────────────────┐
│                                                                              │
│   WebView2 窗口  ──HTTP──▶  127.0.0.1:34115                                  │
│      ▲                          ▲                                            │
│      │ 原生对话框/窗口控制        │ 子进程：node.exe server.js                  │
│      │                          │   ├─ %APPDATA%\com.local.workbench\*.db     │
│   Rust 壳 ──spawn + env──────────┘   ├─ ...\ai-material\                      │
│                                      └─ ...\backups\                          │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ 唯一允许的外部连接
                                       ▼
                            LM Studio  127.0.0.1:1234
                            （外部独立程序，不打包、不内置模型）
```

**为什么不把后端改成 Rust？**
你的约束是「不改 Drizzle 表结构、不改 Agent tool-call 循环、不重写业务」。
Drizzle + better-sqlite3 + OpenAI SDK + 9 个工具全部是 Node 生态代码，
改写成 Rust 等于把整个后端重做一遍。sidecar 方案让这些代码一行不动，
只把「数据放哪、文件怎么选」交给桌面壳。

代价：安装包体积约 **130–160MB**（内含 Node 运行时 + 服务端产物），
换来的是 100% 行为一致、后续 Web 版和桌面版可以共用同一套代码。

---

## 1. 新增文件清单

```
src-tauri/
├─ tauri.conf.json              # 窗口 / 打包 / CSP / 资源映射
├─ Cargo.toml                   # Rust 依赖
├─ build.rs                     # tauri-build 入口
├─ capabilities/
│  └─ default.json              # 沙箱权限（IPC 来源 + 文件系统范围）
├─ frontend/
│  └─ index.html                # 启动闪屏（服务起来前的占位页）
├─ icons/                       # 32/128/256/512 png + icon.ico（脚本生成）
├─ resources/                   # 构建时生成，不进版本库
│  ├─ node.exe
│  └─ server/                   # Next standalone 产物
└─ src/
   ├─ main.rs                   # 入口（发布版隐藏控制台）
   └─ lib.rs                    # 起服务、数据目录、系统对话框、生命周期

scripts/
├─ prepare-sidecar.mjs          # next build + 复制 standalone + 复制 node.exe
└─ gen-icons.mjs                # 零依赖生成 png / ico

src/lib/
├─ paths.ts                     # 数据目录解析（Web / Tauri 双模式）
├─ desktop/
│  ├─ index.ts                  # isTauri / invoke / 外部链接 / 浏览器降级
│  └─ backup.ts                 # 导出导入双通道适配
├─ backup.ts                    # zip 打包逻辑（两端共用）

src/components/desktop/
└─ DesktopShell.tsx             # 桌面右键菜单 + 外链拦截
```

---

## 2. 前置环境（只需装一次）

### 2.1 Rust 工具链

```powershell
# 1) 安装 rustup（Windows）
winget install --id Rustlang.Rustup -e
# 或到 https://rustup.rs 下载 rustup-init.exe

# 2) 安装完成后确认（需要新开终端）
rustc --version     # 期望 1.77.2 以上
cargo --version
```

### 2.2 MSVC 构建工具（必须，Tauri 在 Windows 上要链接 MSVC）

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
```

安装器里勾选 **「使用 C++ 的桌面开发」**（Desktop development with C++），
其中必须包含：

- MSVC v143 - VS 2022 C++ x64/x86 生成工具
- Windows 10/11 SDK

> 这一步同时解决了 `npm install` 时 better-sqlite3 需要编译的问题。

### 2.3 WebView2 运行时

Windows 11 自带。Windows 10 如缺失，装一次：
<https://developer.microsoft.com/microsoft-edge/webview2/>

### 2.4 Node

Node ≥ 20（推荐 22）。**打包用的 Node 版本决定内置运行时版本**，
换 Node 后要重新执行 `npm run build:desktop`。

---

## 3. 首次运行

```bash
# 1) 依赖（已包含 @tauri-apps/cli 与 @tauri-apps/api）
npm install

# 2) 生成图标（已生成过可跳过；换 logo 时重跑）
npm run icons

# 3) 桌面调试
npm run tauri:dev
```

`tauri dev` 会自动：

1. 执行 `beforeDevCommand` → `npm run dev`（Next dev server，3000 端口）
2. 编译 Rust（首次 3–8 分钟）
3. 打开 1280×800 窗口，直接加载 `http://localhost:3000`
4. 改前端代码热更新；改 Rust 代码自动重编译

### 开发态的数据在哪？

开发态**不注入** `WORKBENCH_DATA_DIR`，沿用 Web 版路径：
`<项目根>/data/workbench.db`，素材在 `public/assets/ai-material/`。
方便和 Web 版共用同一份数据，也方便删库重来。

---

## 4. 打包 exe

```bash
npm run tauri:build
```

内部顺序：

```
tauri build
 ├─ beforeBuildCommand → npm run build:desktop
 │    ├─ BUILD_TARGET=tauri next build      # 生成 .next/standalone
 │    ├─ 复制 .next/static + public 进 standalone
 │    ├─ 复制 standalone → src-tauri/resources/server
 │    ├─ 补拷 better_sqlite3.node（防止 tracing 漏掉原生模块）
 │    └─ 复制当前 node.exe → src-tauri/resources/node.exe
 ├─ cargo build --release
 └─ NSIS 打包
```

产物：

```
src-tauri/target/release/bundle/nsis/本地个人工作台_0.1.0_x64-setup.exe
src-tauri/target/release/本地个人工作台.exe      # 未打包的可执行文件（需带 resources）
```

安装模式是 **currentUser**（装到 `%LOCALAPPDATA%\Programs\`，不需要管理员权限）。

### 关于「单文件 exe」

- **推荐**：用 `_x64-setup.exe` 安装包分发，双击即装，桌面/开始菜单生成快捷方式，
  卸载在「设置 → 应用」里。这是 Windows 桌面程序的常规形态。
- **纯单文件**（一个 exe 拷走就能跑）在当前架构下做不到：exe 旁边必须带
  `node.exe` + `server.zip`，因为后端是 Node 服务。
  如果确实需要单文件，只有一条路：把后端整体改写成 Rust（违反「不重写业务」的约束）。
- 折中方案：把 `target/release/` 下的 exe、`node.exe`、`server.zip` 一起打成绿色压缩包分发，
  解压即用，数据仍在 `%APPDATA%`。

---

## 5. 数据目录与权限

### 5.1 运行时目录（Tauri 模式）

```
%APPDATA%\com.local.workbench\
├─ workbench.db          # SQLite（含 -wal / -shm）
├─ ai-material\          # Agent 唯一可读的素材目录
│  ├─ README.md          # 首次启动自动生成
│  └─ workflows\
├─ backups\              # 导出备份默认落盘位置 + 导入中转
├─ logs\
│  └─ server.log         # 内置服务的 stdout/stderr（排障必看）
└─ runtime\
   └─ 0.1.0\             # 首次启动从 server.zip 解压出的服务端
      ├─ server.js
      ├─ .next\
      └─ node_modules\
```

安装目录（`%LOCALAPPDATA%\Programs\本地个人工作台\`）只有三个文件：

```
本地个人工作台.exe
node.exe        # 内置 Node 运行时（构建时从 CI 的 Node 复制，ABI 与 better-sqlite3 匹配）
server.zip      # Next standalone 产物，首次启动解压到 runtime\<版本>\
```

> 为什么要解压而不是直接跑安装目录？
> Tauri 打包 resources 时按 glob 展开，`.next` 这类点开头的目录有被漏掉的风险；
> 上万个散文件也会拖慢 NSIS。单文件 zip 最稳，解压后启动不再有额外开销。
> 升级版本时 `runtime\<新版本>\` 会自动重建，旧目录可手动删除。

顶栏「文件夹」图标可以直接在资源管理器里打开数据目录。

### 5.2 沙箱权限（`src-tauri/capabilities/default.json`）

| 项 | 配置 | 作用 |
| --- | --- | --- |
| IPC 来源 | `remote.urls: ["http://127.0.0.1:34115", "http://localhost:3000"]` | 只有本机服务页面能调用 Rust 命令，任何外部网页都不行 |
| 文件系统 | `fs:*` 全部 `allow: [{ path: "$APPDATA/**" }]` | `$APPDATA` = `%APPDATA%\com.local.workbench`，即只有数据库/素材/备份三个目录 |
| 未开放 | `shell` / `http` / `process` / `dialog`(JS 侧) | 前端无法执行命令、无法发起任意外网请求、无法任意选路径 |

Rust 侧还有两道额外校验：

- `save_backup_as`：`source` 必须位于 `backups/` 内，否则直接报错
- `pick_backup_to_import`：用户选中的 zip 先**复制进** `backups/_import.zip`，
  服务端只接受数据目录内的路径（`resolveImportPath` 二次校验）

### 5.3 网络白名单

三层同时生效：

1. **CSP（`next.config.ts` headers）**：`connect-src 'self' http://127.0.0.1:1234 ...`，
   前端 fetch/XHR 只能打自己和 LM Studio。
2. **CSP（`tauri.conf.json` app.security.csp）**：对本地内容同样限制 connect-src。
3. **业务层**：Agent 只连 `LM_STUDIO_BASE_URL`（默认 127.0.0.1:1234），
   没有任何云端 key 相关代码；服务端 `HOSTNAME=127.0.0.1` 只监听回环地址，
   局域网内其他机器也访问不到。

> 注意：LM Studio 本身需要模型下载时联网，那是**它自己**的行为，与本应用无关。

---

## 6. 快捷键

快捷键全部由前端 `HotkeysProvider` 处理，在 Tauri 窗口内照常生效：

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+K` | 全局搜索 |
| `Ctrl+N` | 新建灵感 |
| `Ctrl+T` | 新建待办 |
| `Ctrl+R` | 打开复盘（已 `preventDefault`，不会刷新页面） |
| `Esc` | 关闭弹窗 |

WebView2 默认的 `Ctrl+R` / `F5` 刷新会被我们的 keydown 拦截。
右键菜单由 `DesktopShell` 接管（选区右键仍是「发送给 Agent」）。

---

## 7. 备份导出 / 导入（适配系统弹窗）

| 动作 | Web 版 | 桌面版 |
| --- | --- | --- |
| 导出 | `GET /api/backup/export` 返回二进制 → 浏览器下载 | `POST /api/backup/export` 写入 `backups/` → Rust 弹「另存为」复制到用户选择的位置 |
| 导入 | `<input type=file>` → multipart 上传 | Rust 弹「打开」→ 复制进 `backups/_import.zip` → `POST /api/backup/import { path }` |

两端共用 `src/lib/backup.ts` 的打包逻辑，备份包内容完全一致
（`workbench.db` + `ai-material/` + `meta.json`）。

---

## 8. 代码改动清单

### ✅ 完全没动（重点）

| 模块 | 说明 |
| --- | --- |
| `src/db/schema.ts` | 9 张表、字段、索引、类型导出，一个字符没改 |
| `src/db/init.ts` | 幂等建表 DDL 原样保留 |
| `src/lib/agent/tools.ts` | 9 个工具定义、Zod schema、执行逻辑 |
| `src/lib/agent/loop.ts` | agent loop、工具回灌、会话落库 |
| `src/lib/agent/client.ts` | LM Studio 客户端、模型解析 |
| `src/lib/agent/prompt.ts` | 系统提示词 |
| 所有页面组件 | `inspiration / todo / calendar / review / prompt / ai-hot / agent / dashboard` |
| 所有业务 API | `inspiration / todo / events / ai-hot / review / prompt-template / clipboard / search / dashboard / agent/*` |
| `tailwind.config.js` / `globals.css` | 配色与布局零改动 |

### 🔧 只改了「路径 / 文件 / 桌面适配」

| 文件 | 改动 |
| --- | --- |
| `src/lib/paths.ts` | **新增**，数据目录解析（`WORKBENCH_DATA_DIR` → `%APPDATA%`） |
| `src/db/index.ts` | `resolveDbPath()` 改为调用 `getDbFile()`；建连前 `ensureDataDirs()` |
| `src/lib/agent/files.ts` | `getMaterialRoot()` 改为 `getMaterialDir()`，校验逻辑一字未改 |
| `src/lib/backup.ts` | **新增**，从 export 路由抽出打包逻辑，加 `saveBackupToAppDir` / `resolveImportPath` |
| `src/app/api/backup/export/route.ts` | 增加 `POST`（写盘 + 返回路径），`GET` 行为不变 |
| `src/app/api/backup/import/route.ts` | 增加 `{ path }` 入参，multipart 分支不变 |
| `src/lib/desktop/*` | **新增**，`isTauri()` 判定 + invoke 封装 + 双通道备份 |
| `src/components/desktop/DesktopShell.tsx` | **新增**，右键菜单 + 外链拦截 |
| `src/components/layout/TopBar.tsx` | 导出/导入改调 `lib/desktop/backup`，加「数据目录」按钮 |
| `src/app/(dashboard)/layout.tsx` | 挂载 `<DesktopShell />` |
| `next.config.ts` | 增加 `output: 'standalone'`（仅 `BUILD_TARGET=tauri`）+ CSP 头 |

---

## 9. 常见问题

**Q：`tauri dev` 报 `failed to get cargo metadata`**
A：Rust 没装或没进 PATH。新开一个终端再试；Windows 还要确认 MSVC 已装。

**Q：窗口白屏 / 提示「内置服务启动失败」**
A：先看日志：`%APPDATA%\com.local.workbench\logs\server.log`，
错误页上也会直接显示末尾 60 行。最常见的原因见下面「启动失败排查」。

**Q：提示端口 34115 被占用**
A：多半是上次崩溃残留的 `node.exe`。任务管理器结束所有 node.exe 再重开；
确认占用者：`netstat -ano | findstr :34115`。
要永久改端口，需同步改三处：`src-tauri/src/lib.rs` 的 `SERVER_PORT`、
`capabilities/default.json` 的 `remote.urls`、`tauri.conf.json` 的 CSP。

### 启动失败排查（内置服务起不来）

1. **看日志**：`%APPDATA%\com.local.workbench\logs\server.log`
2. **手动复现**（能看到完整报错，最直接）：

   ```powershell
   cd "$env:APPDATA\com.local.workbench\runtime\0.1.0"
   & "$env:LOCALAPPDATA\Programs\本地个人工作台\node.exe" .\server.js
   ```

   正常情况下会打印 `▲ Next.js ... Ready in xxx ms`。

3. **按报错对症**：

| 日志里的关键词 | 原因 | 处理 |
| --- | --- | --- |
| `Could not find a production build in the '.next' directory` | 安装包里 `server.zip` 不完整 | 重新安装；本地构建则重跑 `npm run build:desktop` |
| `Cannot find module 'better-sqlite3'` / `was compiled against a different Node.js version` | 原生模块缺失或 ABI 不匹配 | 重跑 `npm run build:desktop`（脚本会自动补拷整包），确保打包用的 Node 与 `node.exe` 是同一个 |
| `SQLITE_CANTOPEN` / `unable to open database file` | 数据目录不可写 | 检查 `%APPDATA%\com.local.workbench` 权限；OneDrive 同步盘容易出这问题 |
| 日志为空、进程立刻退出 | 杀毒软件拦截 `node.exe` | 把安装目录加入白名单（Defender 的「排除项」） |
| `EADDRINUSE` | 端口被占 | 见上一条 |
| 等待超时但日志正常输出到 `Ready` | 端口探测失败（少见） | 确认没有防火墙拦截本机回环 |

4. **彻底重来**：关闭应用 → 删除 `%APPDATA%\com.local.workbench\runtime`（不影响数据库和素材）→ 重开。


**Q：杀毒软件报毒**
A：未签名 exe 的常见误报。选项：加入白名单；或购买代码签名证书后在
`bundle.windows` 配置 `certificateThumbprint` 重新打包。

**Q：Agent 连不上 LM Studio**
A：先启动 LM Studio → 加载 DeepSeek → Developer 页 Start Server。
桌面版和 Web 版共用同一套逻辑，报错文案也一样。

**Q：想换图标**
A：准备 1024×1024 png，执行 `npx tauri icon path/to/logo.png`（会覆盖 `src-tauri/icons`）。

**Q：安装后数据在哪？卸载会删数据吗？**
A：`%APPDATA%\com.local.workbench`，卸载程序不会删除该目录，重装后数据还在。
彻底清理需要手动删除这个文件夹。

---

## 10. 版本更新说明（随包附带）

```
本地个人工作台 v0.1.0
────────────────────────────────
· 灵感素材库 / 今日待办 / 本周任务 / 日历 / 每日复盘 / AI 热点 / 提示词模板
· 内嵌 Agent（对接本机 LM Studio，function calling 直接改数据）
· 全局搜索（Ctrl+K）、剪贴板快照、一键 zip 备份/恢复
· 数据全部存储于 %APPDATA%\com.local.workbench，不联网、不上云

升级方式
1. 退出旧版本（托盘/任务管理器确认无残留进程）
2. 运行新版 setup.exe 覆盖安装
3. 数据目录不变，首次启动自动复用旧数据库（表结构不变，无需迁移）

前置依赖
· LM Studio（外部独立程序）：https://lmstudio.ai
  加载 DeepSeek 系列模型 → Developer 页 Start Server（127.0.0.1:1234）
· WebView2 运行时（Win10 需要，Win11 自带）

已知限制
· 安装包约 130–160MB（内含 Node 运行时与服务端）
· 未做代码签名，SmartScreen 可能提示"未知发布者"，选「仍要运行」
```
