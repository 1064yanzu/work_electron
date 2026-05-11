<p align="center">
  <h1 align="center">IPO Workbench</h1>
  <p align="center">AI 驱动的知识工作台桌面应用</p>
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

- [什么是 IPO Workbench](#什么是-ipo-workbench)
- [核心功能](#核心功能)
- [界面截图](#界面截图)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [构建](#构建)
- [项目结构](#项目结构)
- [文档](#文档)
- [致谢](#致谢)
- [开源协议](#开源协议)
- [免责声明](#免责声明)

---

## 什么是 IPO Workbench

IPO Workbench 是一款功能完备的开源 AI 知识工作台桌面应用。它深度集成了 **Anthropic Claude Agent SDK**，提供强大的 AI 助手体验，同时具备知识管理、代码沙盒、电子书阅读、Wiki 知识图谱、语音合成、桌面宠物、远程控制等完整能力——全部统一在温暖色调的三栏界面中。

无论你是开发者、研究者、写作者还是知识工作者，IPO Workbench 都可以成为你的一站式智能工作空间。

### 设计理念

- **AI 原生**：AI 助手不是插件，而是应用的核心。深度集成 Claude Agent SDK，让 AI 拥有真正的工具调用能力。
- **知识中心**：一切围绕知识展开——资料、笔记、卡片、Wiki、阅读器——形成从摄取到组织、检索到创造的完整知识闭环。
- **温暖精致**：受 Claude.ai 和 B.AI 设计语言启发，界面采用暖奶油色调、胶囊化组件、细腻的微交互。告别冰冷的科技感。
- **隐私优先**：所有数据本地存储（libSQL/SQLite）。无遥测、无数据收集。你完全拥有自己的数据。

---

## 核心功能

### AI 智能对话（Copilot）

右侧面板的 AI 助手，由 Claude Agent SDK 驱动：

- **工具调用 Agent**：AI 可以读写文件、执行终端命令、搜索网页、管理知识库、生成图片等——全部通过结构化的工具调用完成。
- **计划模式**：切换计划模式，让 AI 在行动前逐步思考。
- **交互式权限**：每次工具调用都需要你的批准。可按工具类别设置权限模式（询问/允许/拒绝）。
- **斜杠命令**：20+ 内置斜杠命令，包括 `/compact`、`/init`、`/review`、`/help`、`/cost`、`/agents`、`/permissions`、`/export`、`/doctor` 等。
- **多 Agent 协作**：支持子 Agent 和团队协作模式。
- **会话管理**：持久化对话历史、会话恢复、检查点保存/恢复。
- **Agent 记忆**：持久化长期记忆系统——AI 跨会话记住上下文。

### 知识管理

完整的知识生命周期系统：

- **资料导入**：从 URL、本地文件或直接粘贴导入文档。自动内容提取和分块。
- **全文搜索**：FTS5 驱动的全库全文搜索。
- **向量嵌入**：基于嵌入的语义搜索。
- **文件夹与组织**：支持拖拽的层级文件夹结构。
- **笔记**：支持 Markdown 的富文本笔记。
- **知识卡片**：基于间隔重复（SRS）的闪卡系统，用于主动回忆。

### 电子书阅读器

功能完备的阅读体验：

- **格式支持**：PDF、EPUB、MOBI、AZW3、TXT、HTML、Markdown、DOCX、CBZ。
- **阅读进度**：自动进度追踪与同步。
- **高亮与批注**：创建、管理和导出高亮。
- **书签**：跨书籍的快速访问书签。
- **书内搜索**：任意书籍的全文搜索。
- **阅读会话**：追踪阅读时间和习惯。
- **知识卡片生成**：将高亮转化为间隔重复闪卡。

### 代码沙盒（托管工作区）

中栏的托管编码环境：

- **终端**：xterm.js 终端 + node-pty 后端。
- **文件操作**：安全的文件系统操作（读/写/列/创建目录/复制/移动/删除）。
- **执行图**：@xyflow/react 可视化执行流程。
- **预览服务器**：内置前端项目预览开发服务器。
- **Git Worktree**：隔离的 Git Worktree 管理，支持并行开发。

### Wiki 与知识图谱

可视化知识探索：

- **Wiki 页面**：创建和编辑 Wiki 页面，支持富文本内容。
- **知识图谱**：D3/XYFlow 驱动的交互式知识关系图谱可视化。
- **自动生成**：AI 辅助从资料生成 Wiki 页面。

### TTS 语音合成

多 Provider 语音合成：

- **6 个 Provider**：系统 TTS、OpenAI 兼容、ElevenLabs、火山引擎、MiMo、自定义。
- **声音克隆**：从音频样本克隆自定义声音。
- **流式合成**：实时流式音频输出。
- **宠物集成**：桌面宠物可以通过气泡展示朗读合成文本。

### 桌面宠物（Mascot）

一个动态桌面伴侣：

- **动态精灵**：多状态动画（闲置、思考、打招呼、完成、难过、困倦）。
- **鼠标注视**：宠物的眼睛跟随你的光标移动。
- **语音气泡**：TTS 驱动的语音配合可视化气泡。
- **全局热键**：`Ctrl+Alt+Space` 随时召唤宠物。
- **自定义形象包**：通过 `mascot://` 协议一键导入社区创作的形象包。
- **新手引导**：首次运行引导介绍。

### 远程控制

从聊天平台控制 IPO Workbench：

- **支持平台**：飞书/Lark、Telegram、Slack、Discord、QQ 机器人、微信（实验性）。
- **配对安全**：带审批流程的安全设备配对。
- **Agent 绑定**：将 AI Agent 会话绑定到远程频道，实现交互式对话。
- **会话管理**：管理多个远程会话，支持终止控制。

### 更多功能

- **内置浏览器**：嵌入式浏览器面板，支持 URL 内容剪藏和 Exa MCP 搜索。
- **AI 图片生成**：多 Provider 图片生成（DALL-E、Stable Diffusion 等）。
- **技能市场**：从社区镜像发现、安装和管理 Agent 技能。
- **MCP 服务器管理**：配置和管理 Model Context Protocol 服务器。
- **命令面板**：`Cmd/Ctrl+K` 即时访问任意命令。
- **WebDAV 备份与同步**：支持 WebDAV 云存储的自动备份调度。
- **多主题**：亮色/暗色模式，采用温暖的 B.AI 设计系统。
- **产物管理**：AI 生成输出的版本化存储。

---

## 界面截图

> TODO: 添加截图

| 三栏布局 | AI Copilot | 电子书阅读器 |
|:---:|:---:|:---:|
| ![](screenshots/layout.png) | ![](screenshots/copilot.png) | ![](screenshots/reader.png) |

| 知识图谱 | 桌面宠物 | 设置面板 |
|:---:|:---:|:---:|
| ![](screenshots/wiki-graph.png) | ![](screenshots/pet.png) | ![](screenshots/settings.png) |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| **运行时** | Electron 40 |
| **前端** | React 18 + TypeScript 5.9 + Vite 7 |
| **样式** | Tailwind CSS 3.4（B.AI 暖色调设计系统） |
| **状态管理** | 自研 `useSyncExternalStore` Store 系统 |
| **数据库** | libSQL/SQLite（FTS5）+ Drizzle ORM |
| **AI 引擎** | Anthropic Claude Agent SDK |
| **LLM 层** | 多 Provider（OpenAI、Anthropic、DeepSeek、Ollama、Dify、自定义） |
| **终端** | xterm.js + node-pty |
| **编辑器** | Monaco Editor |
| **阅读器** | react-pdf + epub.js + pdf-parse |
| **图谱** | @xyflow/react + D3 |
| **HTTP** | Express 5（本地服务器） |
| **日志** | Winston |
| **格式化** | Biome |
| **构建** | electron-builder 26 |

---

## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9
- **Git**

### 安装

```bash
# 克隆仓库
git clone https://github.com/YOUR_ORG/ipo-workbench.git
cd ipo-workbench

# 安装依赖
npm install

# postinstall 脚本会自动：
# - 重建 node-pty 原生模块
# - 拷贝 PDF.js worker 资源
```

### 开发

```bash
npm run dev
```

启动 Vite 开发服务器 + Electron HMR。`predev` 脚本会自动拷贝 PDF.js 资源。

### 配置 AI

1. 打开设置（`Cmd/Ctrl+,`）
2. 进入 **AI 与模型 > Provider 与模型**
3. 添加你首选 Provider 的 API 密钥（Anthropic、OpenAI、DeepSeek 等）
4. 在 **默认模型分配** 中选择模型

---

## 构建

```bash
# macOS 构建
npm run build:mac

# Windows 构建
npm run build:win

# 双平台构建
npm run build:all
```

构建产物输出到 `release/` 目录。

### 常用命令

```bash
npm run dev              # 启动开发服务器（Vite + Electron HMR）
npm run build            # 完整构建（tsc + vite + electron-builder）
npm run typecheck        # TypeScript 类型检查（不输出）
npm run lint             # Biome 检查
npm run format           # Biome 格式化（自动修复）
npm run postinstall      # 重建原生模块 + 拷贝资源
```

---

## 项目结构

```
ipo-workbench/
├── electron/                     # Electron 主进程
│   ├── main/
│   │   ├── index.ts              # 入口（CLI 参数、窗口创建）
│   │   ├── app-lifecycle.ts      # 启动链路（db → IPC → 窗口 → 服务）
│   │   ├── db/                   # libSQL + Drizzle ORM、迁移
│   │   ├── ipc/
│   │   │   ├── register.ts       # 集中 IPC 注册（~150+ 命令）
│   │   │   └── handlers/         # 领域 handler（49 个文件）
│   │   ├── llm/                  # 多 Provider LLM 调用层
│   │   ├── http/                 # 内嵌 HTTP：Anthropic 代理 + 剪藏服务
│   │   ├── kb/                   # 知识库：FTS5 + 向量嵌入
│   │   ├── reader/               # 电子书解析（epub/pdf）+ SRS 调度
│   │   ├── services/             # 21 个后端服务
│   │   ├── remote-control/       # IM 平台集成
│   │   ├── cloud-node/           # 云端中继客户端
│   │   ├── skills-marketplace/   # Agent 技能市场
│   │   ├── tts/                  # 多 Provider TTS
│   │   ├── storage/              # Vault/文件存储抽象
│   │   ├── logging/              # Winston 日志
│   │   └── windows/              # 窗口工厂
│   ├── preload/                  # contextBridge → window.electronAPI
│   └── shared/
│       ├── ipc-schema.ts         # IPC 类型契约（3200+ 行，单一事实源）
│       └── preload-api.ts        # Preload API 接口
├── src/                          # React 渲染进程
│   ├── main.tsx                  # 入口（哈希路由：主应用 / 宠物）
│   ├── App.tsx                   # 三栏布局总壳
│   ├── components/
│   │   ├── layout/               # PanelShell、ResizeHandle、SidebarRail
│   │   ├── resource/             # 左栏资源视图
│   │   ├── sandbox/              # 中栏：托管工作区 + 执行图
│   │   ├── wiki/                 # Wiki 编辑、生成、知识图谱
│   │   ├── Terminal/             # xterm.js 终端面板
│   │   ├── CopilotSidebar.tsx    # 右栏：AI 对话
│   │   ├── chat/                 # 对话消息、输入、工具调用展示
│   │   ├── agent/                # Agent 运行时 UI
│   │   ├── Settings/             # 5 大类 21 子标签设置面板
│   │   ├── CommandPalette/       # Cmd+K 命令面板
│   │   ├── reader/               # 电子书阅读器全屏层
│   │   ├── cards/                # 知识卡片库
│   │   ├── skills/               # 技能市场 UI
│   │   ├── Mascot/               # 桌面宠物引导 + 展示
│   │   └── ui/                   # 基础 UI 组件
│   ├── lib/
│   │   ├── stores/               # 自研 Store 系统（useSyncExternalStore）
│   │   ├── agent/                # Agent SDK 客户端、持久化、权限
│   │   ├── api.ts                # 业务 API 封装
│   │   ├── tauriCompat.ts        # invoke<T>(cmd, args) — IPC 桥接
│   │   ├── tauriEventCompat.ts   # listen<T>(event, cb) — 事件桥接
│   │   └── config.ts             # 设置读写
│   └── pet/                      # 桌面宠物子应用（#/pet 路由）
├── docs/                         # 70+ 文档文件
├── cloud-relay/                  # 云端中继服务（独立子项目）
├── scripts/                      # 构建脚本
├── tailwind.config.js            # Tailwind + B.AI 设计 token
├── biome.json                    # Biome 格式化配置
├── vite.config.ts                # Vite + electron 插件配置
└── package.json                  # 依赖与脚本
```

---

## 文档

详细文档位于 [`docs/`](docs/) 目录：

| 文档 | 说明 |
|---|---|
| [架构指南](ARCHITECTURE.md) | 应用架构深度解析 |
| [功能指南](FEATURES.md) | 功能详细文档 |
| [开发指南](DEVELOPMENT.md) | 贡献者和开发者指南 |
| [API 参考](API.md) | IPC 命令与 HTTP API 参考 |
| [更新日志](docs/changelog.md) | 详细开发更新日志 |
| [UI 设计规范](docs/UI设计规范.md) | UI 设计规范 |
| [前端设计系统](docs/frontend-design-system.md) | B.AI 设计系统文档 |
| [斜杠命令](docs/slash-commands-reference.md) | 斜杠命令参考 |
| [TTS API](docs/TTS接口文档.md) | TTS IPC 接口文档 |
| [WebDAV API](docs/webdav接口文档.md) | WebDAV 备份/恢复接口 |
| [Reader API](docs/reader-api.md) | 电子书阅读器 IPC 参考 |
| [后端 API](docs/接口文档.md) | 完整后端 API 文档 |
| [Claude SDK 参考](docs/Claude_sdk.md) | Claude Agent SDK 集成参考 |

---

## 致谢

IPO Workbench 站在巨人的肩膀上。我们衷心感谢以下开源项目和技术：

### 特别致谢

- **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** — Cherry Studio 优雅的多模型 AI 客户端设计为我们的 AI 聊天界面、Provider 管理和模型选择器模式提供了宝贵的参考。其深思熟虑的 UI/UX 方案对 IPO Workbench 的用户体验设计产生了深远影响。

- **[OpenClaw](https://github.com/openclaw)** — OpenClaw 的 IM 平台集成架构为我们的远程控制系统提供了重要参考。他们在多平台消息机器人框架方面的工作启发了我们飞书、Telegram、Slack 和 Discord 的集成方案。

- **[Anthropic Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** — Claude Agent SDK 是 IPO Workbench 的 AI 核心引擎。其强大的工具调用、交互式权限系统、多 Agent 协作和流式事件架构，实现了定义我们应用的深度 AI 集成。我们衷心感谢 Anthropic 团队构建并开源了这个卓越的框架。

### 技术基础

- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- [React](https://react.dev/) — UI 组件库
- [Vite](https://vite.dev/) — 下一代前端构建工具
- [Tailwind CSS](https://tailwindcss.com/) — 实用优先的 CSS 框架
- [libSQL](https://turso.tech/libsql) — 开源 SQLite 分支，支持远程复制
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript SQL ORM
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code 的编辑器组件
- [xterm.js](https://xtermjs.org/) — Web 终端模拟器
- [react-pdf](https://github.com/wojtekmaj/react-pdf) — PDF 查看器组件
- [XYFlow](https://reactflow.dev/) — 基于节点的图谱可视化
- [D3.js](https://d3js.org/) — 数据驱动的可视化
- [Lucide](https://lucide.dev/) — 精美图标库
- [Biome](https://biomejs.dev/) — 快速的代码格式化器和检查器
- [node-pty](https://github.com/microsoft/node-pty) — Node.js 伪终端
- [Shiki](https://shiki.matsu.io/) — 语法高亮器
- [TanStack Query](https://tanstack.com/query) — 异步状态管理
- [Winston](https://github.com/winstonjs/winston) — 日志库

---

## 开源协议

本项目基于 **Apache License 2.0** 开源——详见 [LICENSE](LICENSE) 文件。

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

**IPO Workbench 按"原样"提供，不附带任何形式的明示或暗示保证。**

1. **AI 生成内容**：IPO Workbench 集成了 AI 模型（Claude、GPT、DeepSeek 等）来生成文本、代码、图片等内容。所有 AI 生成内容仅供参考，不应被视为专业建议。用户有责任在依赖任何 AI 生成内容之前验证其准确性和适当性。

2. **第三方服务**：本应用可能连接第三方 AI 提供商、云服务和消息平台。你对这些第三方服务的使用须遵守其各自的服务条款和隐私政策。我们不对任何第三方服务的可用性、准确性或做法负责。

3. **数据隐私**：IPO Workbench 将所有用户数据存储在本地设备上。但是，使用 AI 功能时，你的提示词和对话内容将发送至已配置的 AI 提供商。请在使用前查阅你的 AI 提供商的隐私政策。

4. **免责条款**：在任何情况下，IPO Workbench 的作者、贡献者或版权持有者均不对因使用本软件或与本软件相关的使用或其他交易而产生的任何索赔、损害或其他责任承担任何责任，无论是在合同诉讼、侵权诉讼或其他诉讼中。

5. **Beta 软件**：IPO Workbench 目前处于活跃开发阶段（v0.1.0）。功能可能会变更，可能存在 Bug。建议使用内置的 WebDAV 备份功能定期备份数据。

6. **合规使用**：用户在使用本软件时必须遵守所有适用的法律法规。不得将 IPO Workbench 用于任何非法、有害或不道德的目的。AI 功能应负责任地使用，并遵守各 AI 提供商的服务条款。

---

<p align="center">
  IPO Workbench 团队用心打造。
  <br/>
  <sub>基于 Claude Agent SDK、React 和 Electron 构建。</sub>
</p>
