<p align="center">
  <h1 align="center">IPO Workbench</h1>
  <p align="center">AI-Powered Knowledge Workbench for Desktop</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" />
  </p>
</p>

<p align="center">
  <strong>English</strong> | <a href="README_zh.md">中文</a>
</p>

---

## Table of Contents

- [What is IPO Workbench](#what-is-ipo-workbench)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Build](#build)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Acknowledgements](#acknowledgements)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## What is IPO Workbench

IPO Workbench is a full-featured, open-source AI knowledge workbench desktop application. It deeply integrates the **Anthropic Claude Agent SDK** to provide a powerful AI assistant experience, while offering a complete set of knowledge management, code sandboxing, e-book reading, wiki knowledge graphs, text-to-speech, desktop pet, remote control, and other capabilities — all in a unified, warm-toned three-panel interface.

Whether you are a developer, researcher, writer, or knowledge worker, IPO Workbench can serve as your all-in-one intelligent workspace.

### Design Philosophy

- **AI-Native**: The AI assistant is not a plugin — it is the core of the application. Deep integration with Claude Agent SDK gives the AI true tool-use capabilities.
- **Knowledge-Centric**: Everything revolves around knowledge — sources, notes, cards, wiki, reader — forming a complete knowledge loop from ingestion to organization to retrieval to creation.
- **Warm & Refined**: Inspired by Claude.ai and B.AI design language, the interface uses a warm cream palette, capsule-based components, and meticulous micro-interactions. No cold, clinical feel.
- **Privacy-First**: All data is stored locally (libSQL/SQLite). No telemetry. No data collection. You own your data completely.

---

## Key Features

### AI Agent Chat (Copilot)

The right-panel AI assistant powered by the Claude Agent SDK:

- **Tool-Use Agent**: The AI can read/write files, execute terminal commands, search the web, manage knowledge bases, generate images, and more — all through structured tool calls.
- **Plan Mode**: Toggle plan mode for the AI to think step-by-step before acting.
- **Interactive Permissions**: Every tool call requires your approval. Set permission modes (ask/allow/deny) per tool category.
- **Slash Commands**: 20+ built-in slash commands including `/compact`, `/init`, `/review`, `/help`, `/cost`, `/agents`, `/permissions`, `/export`, `/doctor`, and more.
- **Multi-Agent Collaboration**: Support for sub-agent and teammate collaboration patterns.
- **Session Management**: Persistent conversation history, session resumption, and checkpoint save/restore.
- **Agent Memory**: Persistent long-term memory system — the AI remembers context across sessions.

### Knowledge Management

A complete knowledge lifecycle system:

- **Sources**: Import documents from URLs, local files, or direct paste. Automatic content extraction and chunking.
- **Full-Text Search**: FTS5-powered full-text search across all your knowledge base.
- **Vector Embeddings**: Semantic search via embedding-based chunk retrieval.
- **Folders & Organization**: Hierarchical folder structure with drag-and-drop.
- **Notes**: Rich note-taking with markdown support.
- **Knowledge Cards**: Flashcard system with spaced repetition (SRS) for active recall.

### E-Book Reader

A full-featured reading experience:

- **Format Support**: PDF, EPUB, MOBI, AZW3, TXT, HTML, Markdown, DOCX, CBZ.
- **Reading Progress**: Automatic progress tracking and sync.
- **Highlights & Annotations**: Create, manage, and export highlights.
- **Bookmarks**: Quick-access bookmarks across books.
- **In-Book Search**: Full-text search within any book.
- **Reading Sessions**: Track your reading time and habits.
- **Knowledge Card Generation**: Turn highlights into spaced-repetition flashcards.

### Code Sandbox (Managed Workspace)

A managed coding environment in the center panel:

- **Terminal**: Full xterm.js terminal with node-pty backend.
- **File Operations**: Safe filesystem operations (read/write/list/mkdir/copy/move/delete).
- **Execution Graph**: Visual execution flow with @xyflow/react.
- **Preview Server**: Built-in dev server for frontend project preview.
- **Git Worktree**: Isolated git worktree management for parallel development.

### Wiki & Knowledge Graph

Visual knowledge exploration:

- **Wiki Pages**: Create and edit wiki pages with rich content.
- **Knowledge Graph**: D3/XYFlow-powered interactive graph visualization of knowledge relationships.
- **Auto-Generation**: AI-assisted wiki page generation from sources.

### TTS (Text-to-Speech)

Multi-provider text-to-speech:

- **6 Providers**: System TTS, OpenAI-compatible, ElevenLabs, Volcano Engine, MiMo, and custom.
- **Voice Cloning**: Clone custom voices from audio samples.
- **Streaming Synthesis**: Real-time streaming audio output.
- **Pet Integration**: Desktop pet can speak synthesized text with bubble display.

### Desktop Pet (Mascot)

An animated desktop companion:

- **Animated Sprites**: Multi-state animations (idle, thinking, greet, done, sad, sleepy).
- **Mouse Gaze**: The pet follows your cursor with eye movement.
- **Speech Bubbles**: TTS-powered speech with visual bubbles.
- **Global Hotkey**: `Ctrl+Alt+Space` to summon the pet anytime.
- **Custom Mascot Packs**: Import community-created mascot packs via `mascot://` protocol.
- **Onboarding**: First-run guided introduction.

### Remote Control

Control IPO Workbench from messaging platforms:

- **Supported Platforms**: Feishu/Lark, Telegram, Slack, Discord, QQ Bot, WeChat (experimental).
- **Pairing Security**: Secure device pairing with approval workflow.
- **Agent Binding**: Bind an AI agent session to a remote channel for interactive conversations.
- **Session Management**: Manage multiple remote sessions with termination controls.

### Additional Features

- **Built-in Browser**: Embedded browser panel with URL content clipping and Exa MCP search.
- **AI Image Generation**: Multi-provider image generation (DALL-E, Stable Diffusion, etc.).
- **Skills Marketplace**: Discover, install, and manage agent skills from community mirrors.
- **MCP Server Management**: Configure and manage Model Context Protocol servers.
- **Command Palette**: `Cmd/Ctrl+K` for instant access to any command.
- **WebDAV Backup & Sync**: Automatic backup scheduling with WebDAV cloud storage.
- **Multi-Theme**: Light/dark mode with warm-tone B.AI design system.
- **Artifact Management**: Versioned artifact storage for AI-generated outputs.

---

## Screenshots

> TODO: Add screenshots

| Three-Panel Layout | AI Copilot | E-Book Reader |
|:---:|:---:|:---:|
| ![](docs/screenshots/layout.png) | ![](docs/screenshots/copilot.png) | ![](docs/screenshots/reader.png) |

| Knowledge Graph | Desktop Pet | Settings |
|:---:|:---:|:---:|
| ![](docs/screenshots/wiki-graph.png) | ![](docs/screenshots/pet.png) | ![](docs/screenshots/settings.png) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Electron 40 |
| **Frontend** | React 18 + TypeScript 5.9 + Vite 7 |
| **Styling** | Tailwind CSS 3.4 (B.AI warm-tone design system) |
| **State** | Custom `useSyncExternalStore` store system |
| **Database** | libSQL/SQLite (FTS5) + Drizzle ORM |
| **AI Engine** | Anthropic Claude Agent SDK |
| **LLM Layer** | Multi-provider (OpenAI, Anthropic, DeepSeek, Ollama, Dify, custom) |
| **Terminal** | xterm.js + node-pty |
| **Editor** | Monaco Editor |
| **Reader** | react-pdf + epub.js + pdf-parse |
| **Graph** | @xyflow/react + D3 |
| **HTTP** | Express 5 (local servers) |
| **Logging** | Winston |
| **Formatting** | Biome |
| **Build** | electron-builder 26 |

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Git**

### Install

```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/ipo-workbench.git
cd ipo-workbench

# Install dependencies
npm install

# The postinstall script will:
# - Rebuild node-pty native module
# - Copy PDF.js worker assets
```

### Development

```bash
npm run dev
```

This starts the Vite dev server with Electron HMR. The `predev` script automatically copies PDF.js assets.

### Configure AI

1. Open Settings (`Cmd/Ctrl+,`)
2. Go to **AI & Models > Providers & Models**
3. Add your API key for your preferred provider (Anthropic, OpenAI, DeepSeek, etc.)
4. Select a model in **Default Model Assignment**

---

## Build

```bash
# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for both platforms
npm run build:all
```

Output artifacts are in the `release/` directory.

### Common Commands

```bash
npm run dev              # Start dev server (Vite + Electron HMR)
npm run build            # Full build (tsc + vite + electron-builder)
npm run typecheck        # TypeScript type checking (no emit)
npm run lint             # Biome check
npm run format           # Biome format (auto-fix)
npm run postinstall      # Rebuild native modules + copy assets
```

---

## Project Structure

```
ipo-workbench/
├── electron/                     # Electron main process
│   ├── main/
│   │   ├── index.ts              # Entry point (CLI args, window creation)
│   │   ├── app-lifecycle.ts      # Startup chain (db → IPC → window → services)
│   │   ├── db/                   # libSQL + Drizzle ORM, migrations
│   │   ├── ipc/
│   │   │   ├── register.ts       # Central IPC registration (~150+ commands)
│   │   │   └── handlers/         # Domain handlers (49 files)
│   │   ├── llm/                  # Multi-provider LLM invocation layer
│   │   ├── http/                 # Embedded HTTP: Anthropic proxy + Clip service
│   │   ├── kb/                   # Knowledge base: FTS5 + vector embeddings
│   │   ├── reader/               # E-book parser (epub/pdf) + SRS scheduler
│   │   ├── services/             # 21 backend services
│   │   ├── remote-control/       # IM platform integrations
│   │   ├── cloud-node/           # Cloud relay client
│   │   ├── skills-marketplace/   # Agent skill marketplace
│   │   ├── tts/                  # Multi-provider TTS
│   │   ├── storage/              # Vault/file storage abstraction
│   │   ├── logging/              # Winston logger
│   │   └── windows/              # Window factory
│   ├── preload/                  # contextBridge → window.electronAPI
│   └── shared/
│       ├── ipc-schema.ts         # IPC type contract (3200+ lines, single source of truth)
│       └── preload-api.ts        # Preload API interface
├── src/                          # React renderer process
│   ├── main.tsx                  # Entry (hash-based routing: main app / pet)
│   ├── App.tsx                   # Three-panel layout shell
│   ├── components/
│   │   ├── layout/               # PanelShell, ResizeHandle, SidebarRail
│   │   ├── resource/             # Left sidebar views
│   │   ├── sandbox/              # Center: managed workspace + execution graph
│   │   ├── wiki/                 # Wiki editor, generator, knowledge graph
│   │   ├── Terminal/             # xterm.js terminal panel
│   │   ├── CopilotSidebar.tsx    # Right sidebar: AI chat
│   │   ├── chat/                 # Chat messages, input, tool call display
│   │   ├── agent/                # Agent runtime UI
│   │   ├── Settings/             # 5-category, 21-subtab settings panel
│   │   ├── CommandPalette/       # Cmd+K command palette
│   │   ├── reader/               # E-book reader overlay
│   │   ├── cards/                # Knowledge card library
│   │   ├── skills/               # Skill marketplace UI
│   │   ├── Mascot/               # Desktop pet onboarding + display
│   │   └── ui/                   # Base UI components
│   ├── lib/
│   │   ├── stores/               # Custom store system (useSyncExternalStore)
│   │   ├── agent/                # Agent SDK client, persistence, permissions
│   │   ├── api.ts                # Business API wrappers
│   │   ├── tauriCompat.ts        # invoke<T>(cmd, args) — IPC bridge
│   │   ├── tauriEventCompat.ts   # listen<T>(event, cb) — event bridge
│   │   └── config.ts             # Settings I/O
│   └── pet/                      # Desktop pet sub-app (#/pet route)
├── docs/                         # 70+ documentation files
├── cloud-relay/                  # Cloud relay service (independent sub-project)
├── scripts/                      # Build scripts
├── tailwind.config.js            # Tailwind + B.AI design tokens
├── biome.json                    # Biome formatter config
├── vite.config.ts                # Vite + electron plugin config
└── package.json                  # Dependencies and scripts
```

---

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

| Document | Description |
|---|---|
| [Architecture Guide](ARCHITECTURE.md) | Deep dive into the application architecture |
| [Feature Guide](FEATURES.md) | Detailed feature documentation |
| [Development Guide](DEVELOPMENT.md) | Guide for contributors and developers |
| [API Reference](API.md) | IPC command and HTTP API reference |
| [Changelog](docs/changelog.md) | Detailed development changelog |
| [UI Design Spec](docs/UI设计规范.md) | UI design specifications |
| [Frontend Design System](docs/frontend-design-system.md) | B.AI design system documentation |
| [Slash Commands](docs/slash-commands-reference.md) | Slash command reference |
| [TTS API](docs/TTS接口文档.md) | TTS IPC interface documentation |
| [WebDAV API](docs/webdav接口文档.md) | WebDAV backup/restore interface |
| [Reader API](docs/reader-api.md) | E-book reader IPC reference |
| [Backend API](docs/接口文档.md) | Complete backend API documentation |
| [Claude SDK Reference](docs/Claude_sdk.md) | Claude Agent SDK integration reference |

---

## Acknowledgements

IPO Workbench stands on the shoulders of giants. We owe our gratitude to the following open-source projects and technologies:

### Special Thanks

- **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** — Cherry Studio's elegant multi-model AI client design provided invaluable reference for our AI chat interface, provider management, and model selector patterns. Its thoughtful UI/UX approach significantly influenced IPO Workbench's user experience design.

- **[OpenClaw](https://github.com/openclaw)** — OpenClaw's IM platform integration architecture served as an important reference for our remote control system. Their work on multi-platform messaging bot frameworks informed our approach to Feishu, Telegram, Slack, and Discord integrations.

- **[Anthropic Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** — The Claude Agent SDK is the AI backbone of IPO Workbench. Its powerful tool-use, interactive permission system, multi-agent collaboration, and streaming event architecture enable the deep AI integration that defines our application. We are deeply grateful to the Anthropic team for building and open-sourcing this remarkable framework.

### Technologies We Build Upon

- [Electron](https://www.electronjs.org/) — Cross-platform desktop application framework
- [React](https://react.dev/) — UI component library
- [Vite](https://vite.dev/) — Next-generation frontend build tool
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS framework
- [libSQL](https://turso.tech/libsql) — Open-source SQLite fork with remote replication
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM for SQL databases
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code's editor component
- [xterm.js](https://xtermjs.org/) — Terminal emulator for the web
- [react-pdf](https://github.com/wojtekmaj/react-pdf) — PDF viewer component
- [XYFlow](https://reactflow.dev/) — Node-based graph visualization
- [D3.js](https://d3js.org/) — Data-driven visualization
- [Lucide](https://lucide.dev/) — Beautiful icon library
- [Biome](https://biomejs.dev/) — Fast code formatter and linter
- [node-pty](https://github.com/microsoft/node-pty) — Fork pseudo-terminals in Node.js
- [Shiki](https://shiki.matsu.io/) — Syntax highlighter
- [TanStack Query](https://tanstack.com/query) — Async state management
- [Winston](https://github.com/winstonjs/winston) — Logging library

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

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

## Disclaimer

**IPO Workbench is provided "as is" without warranty of any kind, express or implied.**

1. **AI-Generated Content**: IPO Workbench integrates AI models (Claude, GPT, DeepSeek, etc.) to generate text, code, images, and other content. All AI-generated content is for reference only and should not be considered professional advice. Users are responsible for verifying the accuracy and appropriateness of any AI-generated content before relying on it.

2. **Third-Party Services**: This application may connect to third-party AI providers, cloud services, and messaging platforms. Your use of such third-party services is subject to their respective terms of service and privacy policies. We are not responsible for the availability, accuracy, or practices of any third-party services.

3. **Data Privacy**: IPO Workbench stores all user data locally on your device. However, when using AI features, your prompts and conversation content will be sent to the configured AI provider(s). Please review your AI provider's privacy policy before use.

4. **No Liability**: In no event shall the IPO Workbench authors, contributors, or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

5. **Beta Software**: IPO Workbench is currently in active development (v0.1.0). Features may change, and bugs may exist. We recommend regularly backing up your data using the built-in WebDAV backup feature.

6. **Responsible Use**: Users must comply with all applicable laws and regulations when using this software. Do not use IPO Workbench for any illegal, harmful, or unethical purposes. The AI features should be used responsibly and in accordance with the terms of service of the respective AI providers.

---

<p align="center">
  Made with care by the IPO Workbench team.
  <br/>
  <sub>Built with Claude Agent SDK, React, and Electron.</sub>
</p>
