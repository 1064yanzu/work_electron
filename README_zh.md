<p align="center">
  <h1 align="center">IPO Workbench</h1>
  <p align="center">AI 驱动的桌面知识工作台</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" />
  </p>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

---

## 目录

- [项目简介](#项目简介)
- [为什么选择 IPO Workbench](#为什么选择-ipo-workbench)
- [应用架构](#应用架构)
- [核心功能](#核心功能)
- [截图](#截图)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [构建](#构建)
- [项目结构](#项目结构)
- [支持的 LLM 提供商](#支持的-llm-提供商)
- [文档索引](#文档索引)
- [参与贡献](#参与贡献)
- [路线图](#路线图)
- [致谢](#致谢)
- [许可证](#许可证)
- [免责声明](#免责声明)

---

## 项目简介

**IPO Workbench** 是一款全功能开源 AI 知识工作台桌面应用，深度集成 **Anthropic Claude Agent SDK**，将强大的 AI 助手能力与完整的知识管理工具链融为一体，在一个温暖克制的三栏界面中为你提供沉浸式智能工作空间。

> **核心亮点**
>
> - **AI 原生**：AI 助手不是插件，而是应用的核心。Claude Agent SDK 赋予 AI 真正的工具调用能力——读写文件、执行终端命令、检索知识库，一切皆可委托。
> - **知识驱动**：从知识导入、FTS5 全文检索、向量语义搜索，到笔记、卡片间隔复习、Wiki 知识图谱，构成完整的知识飞轮。
> - **隐私优先**：所有数据本地存储（libSQL/SQLite），无遥测，无数据收集，你完全拥有自己的数据。
> - **精工界面**：以 Claude.ai 与 B.AI 设计语言为蓝本，暖奶油色调、全胶囊化组件、精细微交互，无任何冰冷的工具感。

---

## 为什么选择 IPO Workbench

| 对比维度 | 通用 AI 客户端 | 传统知识管理工具 | **IPO Workbench** |
|---|---|---|---|
| AI 工具调用 | 受限或无 | 无 | 完整 Agent SDK，工具可扩展 |
| 知识管理 | 无 | 核心功能 | 内置，与 AI 深度联动 |
| 数据隐私 | 云端依赖 | 本地/云端不一 | 全本地，零遥测 |
| 代码沙盒 | 无 | 无 | xterm 终端 + 执行图可视化 |
| 电子书阅读 | 无 | 部分支持 | 9 种格式 + 高亮/标注/SRS |
| 远程控制 | 无 | 无 | 飞书/Telegram/Slack/Discord |
| 桌面宠物 | 无 | 无 | 多态动画吉祥物，TTS 联动 |
| 开源协议 | 多为闭源 | 不一 | Apache 2.0 |

无论你是开发者、研究员、写作者还是知识工作者，IPO Workbench 都可以成为你的一站式智能工作空间。

---

## 应用架构

IPO Workbench 采用标准 Electron 三进程架构，并内嵌两个本地 HTTP 服务：

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Electron 应用                               │
│                                                                      │
│  ┌────────────────────┐  contextBridge  ┌──────────────────────┐    │
│  │   主进程 (Main)     │ ◄────────────► │  预加载脚本(Preload)  │    │
│  │                    │  window.electron│                      │    │
│  │  app-lifecycle.ts  │       API       └──────────┬───────────┘    │
│  │  IPC register.ts   │                            │ IPC Bridge     │
│  │  libSQL / Drizzle  │                 ┌──────────▼───────────┐    │
│  │  Agent SDK 集成     │                 │  渲染进程(Renderer)   │    │
│  │                    │                 │                      │    │
│  │  本地 HTTP 服务：    │                 │  React 18 + Vite 7   │    │
│  │  ┌───────────────┐ │                 │  三栏布局              │    │
│  │  │ Anthropic 代理│ │                 │  ┌────┬───────┬────┐  │    │
│  │  │ 127.0.0.1:    │ │                 │  │ 左 │ 中心  │ 右 │  │    │
│  │  │ 8765+ (x10)   │ │                 │  │ 栏 │ 沙盒  │ 栏 │  │    │
│  │  ├───────────────┤ │                 │  │ 知 │ Wiki  │ AI │  │    │
│  │  │ Clip 服务     │ │                 │  │ 识 │ 终端  │助手│  │    │
│  │  │ 127.0.0.1:    │ │                 │  └────┴───────┴────┘  │    │
│  │  │ 21064+ (x10)  │ │                 └──────────────────────┘    │
│  │  └───────────────┘ │                                              │
│  └────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘

IPC 契约唯一事实源：electron/shared/ipc-schema.ts（约 3200 行）
```

**关键调用链：**

```
启动：index.ts → app-lifecycle.ts → db 初始化 → IPC 注册 → 窗口创建 → HTTP 服务启动
前端调用：React 组件 → tauriCompat.invoke() → preload contextBridge → IPC handler → 返回结果
Agent 执行：Claude SDK → 工具调用请求 → 本地 Anthropic 代理 → 工具 handler → 结果返回 SDK
```

---

## 核心功能

### AI 对话助手（Copilot）

右侧面板由 Claude Agent SDK 驱动的智能助手：

- **工具调用 Agent**：AI 可读写文件、执行终端命令、检索知识库、生成图像、搜索网络等，所有操作均通过结构化工具调用完成。
- **计划模式（Plan Mode）**：开启计划模式后，AI 在执行前逐步推理并展示行动方案，便于你在执行前审查。
- **交互式权限系统**：每个工具调用都需要你的审批。可按工具类别设置权限模式（询问 / 允许 / 拒绝），精细控制 AI 的行动边界。
- **斜杠命令**：20+ 个内置斜杠命令，包括 `/compact`、`/init`、`/review`、`/help`、`/cost`、`/agents`、`/permissions`、`/export`、`/doctor` 等。
- **多 Agent 协作**：支持子 Agent 与协作者模式，复杂任务可拆解给多个 Agent 并行处理。
- **会话管理**：持久化对话历史，支持会话恢复、检查点保存与回滚。
- **Agent 记忆**：跨会话持久记忆系统——AI 能记住你的偏好与上下文。

---

### 知识管理

完整的知识生命周期系统：

- **知识来源（Sources）**：通过 URL 抓取、本地文件导入或直接粘贴文本导入知识，自动提取内容并分块存储。
- **FTS5 全文检索**：基于 SQLite FTS5 的全知识库全文检索，毫秒级响应。
- **向量语义检索**：基于嵌入向量的语义相似度检索，找到概念关联而不仅仅是关键词匹配。
- **文件夹管理**：层级文件夹结构，支持拖拽组织。
- **笔记**：支持 Markdown 的富文本笔记系统。
- **知识卡片**：闪卡系统，内置间隔重复（SRS）算法，用于主动回忆训练。

---

### 电子书阅读器

功能完整的沉浸式阅读体验：

- **格式支持**：PDF、EPUB、MOBI、AZW3、TXT、HTML、Markdown、DOCX、CBZ。
- **阅读进度**：自动追踪并同步阅读进度。
- **高亮与注释**：创建、管理并导出高亮内容与批注。
- **书签**：跨书籍快速访问书签系统。
- **书内检索**：在任意书籍内进行全文检索。
- **阅读统计**：追踪阅读时间与阅读习惯数据。
- **知识卡片生成**：将书中高亮内容一键转化为间隔重复闪卡。

---

### 代码沙盒（托管工作区）

中心面板的托管编码环境：

- **终端**：完整的 xterm.js 终端，后端由 node-pty 驱动，支持真实 shell 交互。
- **安全文件操作**：受控的文件系统操作（读取 / 写入 / 列目录 / 新建 / 复制 / 移动 / 删除）。
- **执行图可视化**：基于 @xyflow/react 的执行流程可视化图，直观呈现 Agent 的行动路径。
- **预览服务器**：内置前端项目开发预览服务，支持实时预览。
- **Git Worktree 管理**：隔离的 Git Worktree 管理，支持并行开发分支。

---

### Wiki 与知识图谱

可视化知识探索：

- **Wiki 页面**：创建并编辑富内容 Wiki 页面，支持 Markdown 与内联媒体。
- **交互式知识图谱**：基于 D3.js 与 XYFlow 的交互式知识关系图，节点可拖拽、缩放、过滤。
- **AI 辅助生成**：AI 可根据已有知识来源自动生成 Wiki 页面草稿。

---

### 文字转语音（TTS）

多提供商文字转语音系统：

- **6 大提供商**：系统 TTS、OpenAI 兼容接口、ElevenLabs、火山引擎、MiMo 及自定义提供商。
- **声音克隆**：通过音频样本克隆自定义声音。
- **流式合成**：实时流式音频输出，低延迟播放。
- **桌宠联动**：桌面宠物可朗读合成文本，配合语音气泡显示。

---

### 桌面宠物（吉祥物）

动态桌面伴侣：

- **多状态动画精灵**：内置待机、思考、打招呼、完成、难过、困倦等多种状态动画。
- **鼠标凝视**：宠物眼神跟随你的光标移动。
- **语音气泡**：TTS 驱动的语音与视觉气泡，宠物可"开口说话"。
- **全局热键**：`Ctrl+Alt+Space` 随时唤出宠物窗口。
- **自定义吉祥物包**：通过 `mascot://` 协议导入社区创建的吉祥物包。
- **新手引导**：首次启动的引导式介绍流程。

---

### 远程控制

从 IM 平台远程控制 IPO Workbench：

- **支持平台**：飞书 / Lark、Telegram、Slack、Discord、QQ Bot、微信（实验性）。
- **配对安全**：带审批流程的安全设备配对机制。
- **Agent 绑定**：将 AI Agent 会话绑定到远程频道，实现交互式远程对话。
- **会话管理**：管理多个远程会话，支持强制终止控制。

---

### 其他功能

- **内置浏览器**：嵌入式浏览器面板，支持 URL 内容剪辑与 Exa MCP 搜索。
- **AI 图像生成**：多提供商图像生成（DALL-E、Stable Diffusion 等）。
- **技能市场**：发现、安装并管理社区镜像的 Agent 技能包。
- **MCP 服务器管理**：配置并管理 Model Context Protocol 服务器。
- **命令面板**：`Cmd/Ctrl+K` 快速访问任意命令。
- **WebDAV 备份同步**：定时自动备份至 WebDAV 云存储。
- **多主题**：亮色 / 暗色主题，采用暖调 B.AI 设计系统。
- **产物管理（Artifact）**：AI 生成输出的版本化产物存储。

---

## 截图

> TODO：待补充截图

| 三栏布局 | AI Copilot | 电子书阅读器 |
|:---:|:---:|:---:|
| ![](docs/screenshots/layout.png) | ![](docs/screenshots/copilot.png) | ![](docs/screenshots/reader.png) |

| 知识图谱 | 桌面宠物 | 设置面板 |
|:---:|:---:|:---:|
| ![](docs/screenshots/wiki-graph.png) | ![](docs/screenshots/pet.png) | ![](docs/screenshots/settings.png) |

---

## 技术栈

| 层次 | 技术 |
|---|---|
| **运行时** | Electron 40 |
| **前端** | React 18 + TypeScript 5.9 + Vite 7 |
| **样式** | Tailwind CSS 3.4（B.AI 暖调设计系统） |
| **状态管理** | 自定义 `useSyncExternalStore` store 体系 |
| **数据库** | libSQL/SQLite（FTS5）+ Drizzle ORM |
| **AI 引擎** | Anthropic Claude Agent SDK |
| **LLM 层** | 多提供商（OpenAI、Anthropic、DeepSeek、Ollama、Dify、自定义） |
| **终端** | xterm.js + node-pty |
| **编辑器** | Monaco Editor |
| **阅读器** | react-pdf + epub.js + pdf-parse |
| **图谱可视化** | @xyflow/react + D3.js |
| **HTTP** | Express 5（本地服务） |
| **日志** | Winston |
| **代码格式化** | Biome |
| **打包** | electron-builder 26 |

---

## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9
- **Git**

> **注意**：仓库路径包含空格（`/Volumes/external disk/...`），在脚本与终端命令中请注意路径引用时使用引号。

### 安装

```bash
# 克隆仓库
git clone https://github.com/YOUR_ORG/ipo-workbench.git
cd ipo-workbench

# 安装依赖
npm install

# postinstall 脚本将自动：
# - 重新编译 node-pty 原生模块
# - 复制 PDF.js Worker 资源文件
```

### 开发模式

```bash
npm run dev
```

此命令启动带 HMR 的 Vite 开发服务器与 Electron 进程。`predev` 脚本会在启动前自动复制 PDF.js 资源。

### 配置 AI

1. 打开设置面板（`Cmd/Ctrl+,`）
2. 进入 **AI 与模型 > 提供商与模型**
3. 为你偏好的提供商（Anthropic、OpenAI、DeepSeek 等）添加 API Key
4. 在 **默认模型分配** 中选择要使用的模型

---

## 构建

```bash
# 构建 macOS 版本
npm run build:mac

# 构建 Windows 版本
npm run build:win

# 同时构建两个平台
npm run build:all
```

构建产物输出至 `release/` 目录。

### 常用命令

```bash
npm run dev              # 启动开发服务器（Vite + Electron HMR）
npm run build            # 完整构建（tsc + vite + electron-builder）
npm run typecheck        # TypeScript 类型检查（不输出文件）
npm run lint             # Biome 检查
npm run format           # Biome 格式化（自动修复）
npm run postinstall      # 重新编译原生模块 + 复制资源文件
```

---

## 项目结构

```
ipo-workbench/
├── electron/                     # Electron 主进程
│   ├── main/
│   │   ├── index.ts              # 入口（CLI 参数、窗口创建）
│   │   ├── app-lifecycle.ts      # 启动链路（db → IPC → 窗口 → 服务）
│   │   ├── db/                   # libSQL + Drizzle ORM，数据库迁移
│   │   ├── ipc/
│   │   │   ├── register.ts       # IPC 注册中心（150+ 命令）
│   │   │   └── handlers/         # 领域 handlers（49 个文件）
│   │   ├── llm/                  # 多提供商 LLM 调用层
│   │   ├── http/                 # 内嵌 HTTP：Anthropic 代理 + Clip 服务
│   │   ├── kb/                   # 知识库：FTS5 + 向量嵌入
│   │   ├── reader/               # 电子书解析器（epub/pdf）+ SRS 调度
│   │   ├── services/             # 21 个后端服务
│   │   ├── remote-control/       # IM 平台集成
│   │   ├── cloud-node/           # 云中继客户端
│   │   ├── skills-marketplace/   # Agent 技能市场
│   │   ├── tts/                  # 多提供商 TTS
│   │   ├── storage/              # Vault/文件存储抽象层
│   │   ├── logging/              # Winston 日志
│   │   └── windows/              # 窗口工厂
│   ├── preload/                  # contextBridge → window.electronAPI
│   └── shared/
│       ├── ipc-schema.ts         # IPC 类型契约（3200+ 行，唯一事实源）
│       └── preload-api.ts        # Preload API 接口定义
├── src/                          # React 渲染进程
│   ├── main.tsx                  # 入口（基于 Hash 路由：主应用 / 桌宠）
│   ├── App.tsx                   # 三栏布局外壳
│   ├── components/
│   │   ├── layout/               # PanelShell、ResizeHandle、SidebarRail
│   │   ├── resource/             # 左侧栏视图
│   │   ├── sandbox/              # 中心：托管工作区 + 执行图
│   │   ├── wiki/                 # Wiki 编辑器、生成器、知识图谱
│   │   ├── Terminal/             # xterm.js 终端面板
│   │   ├── CopilotSidebar.tsx    # 右侧栏：AI 对话
│   │   ├── chat/                 # 对话消息、输入框、工具调用展示
│   │   ├── agent/                # Agent 运行时 UI
│   │   ├── Settings/             # 5 大类别、21 个子标签设置面板
│   │   ├── CommandPalette/       # Cmd+K 命令面板
│   │   ├── reader/               # 电子书阅读器覆盖层
│   │   ├── cards/                # 知识卡片库
│   │   ├── skills/               # 技能市场 UI
│   │   ├── Mascot/               # 桌面宠物引导 + 显示
│   │   └── ui/                   # 基础 UI 组件
│   ├── lib/
│   │   ├── stores/               # 自定义 store 体系（useSyncExternalStore）
│   │   ├── agent/                # Agent SDK 客户端、持久化、权限管理
│   │   ├── api.ts                # 业务 API 封装
│   │   ├── tauriCompat.ts        # invoke<T>(cmd, args) — IPC 桥
│   │   ├── tauriEventCompat.ts   # listen<T>(event, cb) — 事件桥
│   │   └── config.ts             # 设置读写
│   └── pet/                      # 桌面宠物子应用（#/pet 路由）
├── docs/                         # 70+ 个文档文件
├── cloud-relay/                  # 云中继服务（独立子项目）
├── scripts/                      # 构建脚本
├── tailwind.config.js            # Tailwind + B.AI 设计 Token
├── biome.json                    # Biome 格式化配置
├── vite.config.ts                # Vite + electron 插件配置
└── package.json                  # 依赖与脚本
```

---

## 支持的 LLM 提供商

| 提供商 | 说明 |
|---|---|
| **Anthropic** | Claude 系列模型，原生 Agent SDK 集成 |
| **OpenAI** | GPT 系列模型，标准 OpenAI API |
| **DeepSeek** | DeepSeek-Chat / DeepSeek-Coder |
| **Ollama** | 本地部署模型，完全离线运行 |
| **Dify** | Dify 工作流与应用接口 |
| **自定义兼容接口** | 任何 OpenAI 兼容接口均可接入 |

---

## 文档索引

完整文档位于 [`docs/`](docs/) 目录：

| 文档 | 描述 |
|---|---|
| [架构指南](ARCHITECTURE.md) | 深入解析应用架构 |
| [功能指南](FEATURES.md) | 详细功能说明文档 |
| [开发指南](DEVELOPMENT.md) | 贡献者与开发者指南 |
| [API 参考](API.md) | IPC 命令与 HTTP API 参考 |
| [变更日志](docs/changelog.md) | 详细开发变更记录 |
| [UI 设计规范](docs/UI设计规范.md) | UI 设计规范文档 |
| [前端设计系统](docs/frontend-design-system.md) | B.AI 设计系统说明 |
| [斜杠命令参考](docs/slash-commands-reference.md) | 斜杠命令完整参考 |
| [TTS 接口文档](docs/TTS接口文档.md) | TTS IPC 接口文档 |
| [WebDAV 接口文档](docs/webdav接口文档.md) | WebDAV 备份/恢复接口 |
| [阅读器 API](docs/reader-api.md) | 电子书阅读器 IPC 参考 |
| [后端接口文档](docs/接口文档.md) | 完整后端 API 文档 |
| [Claude SDK 参考](docs/Claude_sdk.md) | Claude Agent SDK 集成参考 |

---

## 参与贡献

欢迎所有形式的贡献！

### 如何贡献

1. **Fork** 本仓库并创建你的功能分支：`git checkout -b feat/your-feature`
2. **提交**你的修改：遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
3. **推送**到你的 Fork：`git push origin feat/your-feature`
4. **创建 Pull Request**，详细描述修改内容与动机

### 代码规范

- 使用 `npm run typecheck` 确保类型检查通过
- 使用 `npm run format` 进行 Biome 自动格式化
- 新增 IPC 命令必须同步更新 `electron/shared/ipc-schema.ts`
- 涉及前后端交互的改动需更新 `docs/接口文档.md`
- 所有注释与文档使用中文

### PR 流程

- PR 必须通过 TypeScript 类型检查（`npm run typecheck`）
- 描述中需包含：改动原因、实现方案、影响范围
- 重大功能建议先提 Issue 讨论方案再开始开发

---

## 路线图

- [ ] 插件系统 / 开放扩展 API
- [ ] 移动端伴侣应用
- [ ] 团队协作与共享知识库
- [ ] 更多电子书格式支持（Comic Book Archive 增强）
- [ ] 离线向量模型（完全本地语义检索）
- [ ] 深色主题优化与更多主题包
- [ ] 多语言界面国际化（i18n）
- [ ] 云同步（端到端加密）

---

## 致谢

IPO Workbench 站在巨人的肩膀上。我们向以下开源项目与技术表示由衷感谢：

### 特别感谢

- **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** — Cherry Studio 优雅的多模型 AI 客户端设计为我们的 AI 对话界面、提供商管理与模型选择器提供了宝贵参考。其精心的 UI/UX 设计思路深刻影响了 IPO Workbench 的用户体验设计。

- **[OpenClaw](https://github.com/openclaw)** — OpenClaw 的 IM 平台集成架构为我们的远程控制系统提供了重要参考。其在多平台消息机器人框架上的工作启发了我们对飞书、Telegram、Slack 与 Discord 集成的实现方式。

- **[Anthropic Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** — Claude Agent SDK 是 IPO Workbench 的 AI 骨干。其强大的工具调用、交互式权限系统、多 Agent 协作与流式事件架构，成就了定义本应用的深度 AI 集成体验。我们对 Anthropic 团队构建并开源这一卓越框架深表感谢。

### 桌面与运行时

- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- [Vite](https://vite.dev/) — 下一代前端构建工具
- [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) — Electron 与 Vite 的集成插件

### 前端框架

- [React](https://react.dev/) — UI 组件库
- [TypeScript](https://www.typescriptlang.org/) — 类型安全的 JavaScript
- [Tailwind CSS](https://tailwindcss.com/) — 实用优先的 CSS 框架
- [TanStack Query](https://tanstack.com/query) — 异步状态管理
- [TanStack Virtual](https://tanstack.com/virtual) — 高性能虚拟滚动

### UI 与图标

- [Lucide React](https://lucide.dev/) — 优美的图标库
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) — 可拖拽调整的面板组件
- [class-variance-authority](https://cva.style/) — 类型安全的变体类名管理
- [tailwind-merge](https://github.com/dcastil/tailwind-merge) — Tailwind 类名合并工具
- [clsx](https://github.com/lukeed/clsx) — 条件类名工具

### 编辑器与终端

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code 的编辑器组件
- [xterm.js](https://xtermjs.org/) — Web 端终端模拟器
- [node-pty](https://github.com/microsoft/node-pty) — Node.js 伪终端支持

### AI 与 LLM

- [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk) — Claude Agent SDK 核心

### 可视化

- [@xyflow/react（React Flow）](https://reactflow.dev/) — 节点图可视化
- [D3.js](https://d3js.org/)（d3-force / d3-drag / d3-selection / d3-zoom）— 数据驱动可视化
- [Mermaid](https://mermaid.js.org/) — 图表与流程图渲染

### 数据库与存储

- [libSQL](https://turso.tech/libsql) — 支持远程复制的开源 SQLite 分支
- [Drizzle ORM](https://orm.drizzle.team/) — SQL 数据库 TypeScript ORM

### 文档处理

- [react-pdf](https://github.com/wojtekmaj/react-pdf) — PDF 查看器组件
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF 文本提取
- [mammoth](https://github.com/mwilliamson/mammoth.js) — DOCX 转换
- [@mozilla/readability](https://github.com/mozilla/readability) — 网页内容提取
- [node-stream-zip](https://github.com/antelle/node-stream-zip) — ZIP 流式解压

### 语法与 Markdown

- [Shiki](https://shiki.matsu.io/) — 语法高亮渲染器
- [react-markdown](https://github.com/remarkjs/react-markdown) — React Markdown 渲染
- [remark-gfm](https://github.com/remarkjs/remark-gfm) — GitHub Flavored Markdown 支持
- [react-diff-viewer-continued](https://github.com/praneshr/react-diff-viewer) — Diff 差异展示
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML 净化，防止 XSS

### IM 与远程控制

- [飞书 Node SDK](https://github.com/larksuite/node-sdk) — 飞书/Lark 开放平台集成
- [@slack/bolt](https://slack.dev/bolt-js/) — Slack Bot 框架
- [discord.js](https://discord.js.org/) — Discord Bot 库
- [grammy](https://grammy.dev/) — Telegram Bot 框架（grammY）

### HTTP 与网络

- [Express 5](https://expressjs.com/) — 本地 HTTP 服务
- [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware) — HTTP 代理中间件
- [WebDAV](https://github.com/perry-mitchell/webdav-client) — WebDAV 客户端
- [ws](https://github.com/websockets/ws) — WebSocket 实现
- [chokidar](https://github.com/paulmillr/chokidar) — 文件系统监视

### 工具库

- [zod](https://zod.dev/) — TypeScript 优先的 Schema 验证
- [lz-string](https://github.com/pieroxy/lz-string) — 字符串压缩
- [archiver](https://github.com/archiverjs/node-archiver) — 文件归档打包
- [sharp](https://sharp.pixelplumbing.com/) — 高性能图像处理
- [fs-extra](https://github.com/jprichardson/node-fs-extra) — 扩展的文件系统工具
- [jsdom](https://github.com/jsdom/jsdom) — Node.js 中的 DOM 实现
- [diff](https://github.com/kpdecker/jsdiff) — 文本差异计算
- [qrcode](https://github.com/soldair/node-qrcode) — 二维码生成
- [Winston](https://github.com/winstonjs/winston) — 日志库

### 构建与质量

- [electron-builder](https://www.electron.build/) — Electron 应用打包工具
- [Biome](https://biomejs.dev/) — 高速代码格式化与检查工具
- [@electron/rebuild](https://github.com/electron/rebuild) — 原生模块重新编译

---

## 许可证

本项目基于 **Apache License 2.0** 协议开源，详见 [LICENSE](LICENSE) 文件。

```
Copyright 2024-2026 IPO Workbench Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 免责声明

**IPO Workbench 按"现状"提供，不附带任何明示或暗示的保证。**

1. **AI 生成内容**：IPO Workbench 集成了 AI 模型（Claude、GPT、DeepSeek 等）用于生成文本、代码、图像及其他内容。所有 AI 生成内容仅供参考，不构成专业建议。用户在依赖任何 AI 生成内容之前，应自行核实其准确性与适用性。

2. **第三方服务**：本应用可能连接第三方 AI 提供商、云服务及消息平台。你对此类第三方服务的使用须遵守其各自的服务条款与隐私政策。我们不对任何第三方服务的可用性、准确性或实践行为承担责任。

3. **数据隐私**：IPO Workbench 将所有用户数据存储在本地设备上。但在使用 AI 功能时，你的提示词与对话内容将被发送至你所配置的 AI 提供商。使用前请查阅相应 AI 提供商的隐私政策。

4. **责任限制**：在任何情况下，IPO Workbench 的作者、贡献者或版权持有人均不对任何合同、侵权或其他行为引起的、与本软件或其使用相关的任何索赔、损害或其他责任承担责任。

5. **Beta 软件**：IPO Workbench 目前处于积极开发阶段（v0.2.3）。功能可能发生变化，且可能存在缺陷。建议定期使用内置 WebDAV 备份功能备份你的数据。

6. **合规使用**：用户在使用本软件时必须遵守所有适用的法律法规。请勿将 IPO Workbench 用于任何非法、有害或不道德的用途。AI 功能应负责任地使用，并遵守相应 AI 提供商的服务条款。

---

<p align="center">
  由 IPO Workbench 团队用心打造。
  <br/>
  <sub>基于 Claude Agent SDK、React 与 Electron 构建。</sub>
</p>
