# 发布指南：推送到 GitHub + 自动打 Windows exe

> 适用场景：GitHub 上**已经有第一版**，本地是**大改动的第二版**。
> 本地目录目前是全新初始化的 git 仓库（`main` 分支，1 个提交），
> 与远程第一版**没有共同祖先**，所以不能用普通 `git pull` 合并。

---

## 一、把第二版推上去

### 第 0 步：先给远程第一版留个后路（强烈建议）

打开 GitHub 网页 → 仓库 → **Branches** → 找到 `main` → 点 **New branch**，
建一个 `v1-archive`。这样即使后面覆盖了 `main`，第一版还能随时找回。

或者本地打标签（需要在能访问远程的机器上）：

```bash
git fetch origin
git tag v1.0.0 origin/main
git push origin v1.0.0
```

### 第 1 步：关联远程仓库

```bash
cd "D:/work buguojiban/cunc/2026-10-26-15-53-48"

# 换成你自己的仓库地址
git remote add origin https://github.com/zwh9820-rgb/你的仓库名.git

# 确认一下
git remote -v
```

### 第 2 步：推送（二选一）

**方案 A：覆盖远程 main（推荐，最干净）**

既然是大改版，直接把 `main` 替换成第二版：

```bash
git push -f origin main
```

> `-f` 只影响远程 `main` 这一个分支的指针，不会删除其它分支，
> 所以只要你建了 `v1-archive` 分支，第一版就还在。

**方案 B：保留历史（想在新分支上对比）**

```bash
git push -u origin main:main-v2
```

然后在 GitHub 上发起 PR：`main-v2` → `main`，review 完再合并。

**方案 C：强行合并两段无关历史（不推荐，容易产生大量冲突）**

```bash
git fetch origin
git merge origin/main --allow-unrelated-histories
# 手动解决冲突后再 push
```

### 第 3 步：验证

```bash
git log --oneline -3
git remote -v
```

刷新 GitHub 页面，应该能看到 72 个文件、第二版全部内容。

---

## 二、自动打包成 exe

### 触发方式

**方式 1：打 tag（会同时创建 Release 并挂上 exe）**

```bash
git tag v2.0.0
git push origin v2.0.0
```

**方式 2：手动触发（只产出 artifact，不发 Release）**

GitHub 仓库 → **Actions** → 左侧 `Build Windows Installer` → **Run workflow**。

### 构建过程做了什么

```
npm ci
  → NEXT_OUTPUT=standalone npm run build
  → node scripts/prepare-desktop.mjs      # 组装 sidecar 目录
  → 下载 node.exe (v22 win-x64)
  → npx tauri icon                        # 生成全套图标
  → npx tauri build                       # Rust 编译 + NSIS 打包
  → 上传 artifact / 挂到 Release
```

耗时约 10–20 分钟（首次要编译 Rust 依赖，之后有缓存会快很多）。

### 产物在哪

- **Release 页面**：`AI Content Workbench_0.2.0_x64-setup.exe`（NSIS 安装包）
  和 `AI-Content-Workbench-portable.zip`（免安装，解压双击 exe）
- **Actions → 对应 run → Artifacts**：`windows-installer`、`windows-portable`

### 安装包运行逻辑

```
双击 exe
  → Tauri 窗口打开（先显示极简启动页）
  → 用内置 node.exe 启动 Next 服务（127.0.0.1 空闲端口）
  → 端口就绪后窗口跳转到本地地址
  → 数据库落在 %APPDATA%\com.zwh.aicontentworkbench\workbench.db
```

ComfyUI 和 LM Studio 仍然是你自己手动启动的外部程序，安装包不包含它们。

---

## 三、常见问题

### Q1：构建失败在 `better-sqlite3 原生模块未被打包`

说明 Next 的 tracing 没带上 `.node` 文件。
检查 `next.config.ts` 里的 `serverExternalPackages: ['better-sqlite3']` 是否还在。
`scripts/prepare-desktop.mjs` 会在第 6 步主动校验并报错。

### Q2：构建失败在 `Cannot find module ... get-metadata-route`

Next 的 standalone 会裁剪 `node_modules/next`，但部分模块是动态 require 的，
tracing 抓不到。`prepare-desktop.mjs` 里的「补齐 next 包缺失文件」就是解决这个，
如果还报别的模块，把模块路径加到同一个补齐逻辑里即可（它会自动扫全量差异）。

### Q3：安装后双击没反应

先看有没有被 Windows Defender 拦截（未签名 exe 常见）。
其次用便携版 zip 解压后，在命令行里跑一次主程序，能看到 stderr：

```powershell
cd 解压目录
.\AI Content Workbench.exe
```

如果报「资源缺失」，说明 `resources/app` 或 `resources/node.exe` 没打进包，
检查 `tauri.conf.json` 的 `bundle.resources` 配置。

### Q4：想改版本号

三处要同步：

| 文件 | 字段 |
| --- | --- |
| `package.json` | `version` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/tauri.conf.json` | `version` |

然后打对应 tag（`v0.3.0` …）。

### Q5：能不能不装 Node 直接跑

可以。安装包内置了 `node.exe`，用户机器不需要装 Node。
代价是安装包体积约 70–100 MB（node 运行时 + Next 服务）。

---

## 四、本地想自己验证桌面构建

需要装 Rust（https://rustup.rs）和 VS Build Tools（C++ 桌面开发）：

```bash
npm run build:standalone   # 等价 NEXT_OUTPUT=standalone npm run build
node scripts/prepare-desktop.mjs
# 把 node.exe 放到 src-tauri/resources/node.exe
npx tauri icon src-tauri/icon.png -o src-tauri/icons
npx tauri build
```

产物在 `src-tauri/target/release/bundle/nsis/`。
