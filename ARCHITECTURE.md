# IPO Workbench Architecture Guide

This document provides a deep technical dive into the architecture of IPO Workbench. It covers the overall system design, process model, data flow, key patterns, and extension points.

## Table of Contents

- [System Overview](#system-overview)
- [Process Model](#process-model)
- [Three-Panel UI Architecture](#three-panel-ui-architecture)
- [IPC Communication Layer](#ipc-communication-layer)
- [State Management](#state-management)
- [Database Layer](#database-layer)
- [AI Agent Architecture](#ai-agent-architecture)
- [LLM Multi-Provider Layer](#llm-multi-provider-layer)
- [Service Layer](#service-layer)
- [Startup Sequence](#startup-sequence)
- [Design System](#design-system)
- [Security Model](#security-model)

---

## System Overview

IPO Workbench follows the standard Electron multi-process architecture with a clear separation between:

1. **Main Process** (`electron/main/`) — Node.js runtime. Handles native APIs, database, IPC handlers, HTTP servers, terminal PTY, and all system-level operations.
2. **Renderer Process** (`src/`) — Chromium runtime. React 18 UI with Tailwind CSS styling.
3. **Preload Scripts** (`electron/preload/`) — Secure bridge between main and renderer via `contextBridge`.

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Database  │ │ IPC      │ │ Services │ │ HTTP       │ │
│  │ (libSQL)  │ │ Handlers │ │ (21+)    │ │ Servers    │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│       ▲              ▲             ▲            ▲        │
│       │              │             │            │        │
│  ┌────┴──────────────┴─────────────┴────────────┴─────┐ │
│  │              ipc-schema.ts (Type Contract)          │ │
│  └────────────────────┬───────────────────────────────┘ │
│                       │ contextBridge                    │
├───────────────────────┼─────────────────────────────────┤
│                       ▼                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │            Renderer Process (React 18)              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │ Resource  │  │ Sandbox  │  │  Copilot Sidebar │ │ │
│  │  │ Sidebar   │  │ Workspace│  │  (AI Chat)       │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Process Model

### Main Process (`electron/main/`)

The main process is responsible for:

- **Database Operations**: All CRUD operations go through Drizzle ORM → libSQL
- **IPC Command Handling**: 150+ commands registered via centralized `register.ts`
- **HTTP Services**: Express servers for Anthropic proxy (port 8765+) and Clip service (port 21064+)
- **Terminal Management**: node-pty process management with per-session PTY instances
- **File System**: Safe filesystem operations with path validation
- **LLM Invocation**: Multi-provider API calls with streaming support
- **Service Lifecycle**: Background services (WebDAV sync, remote control, cloud node, file watcher)

### Renderer Process (`src/`)

The renderer process handles:

- **UI Rendering**: React 18 with concurrent features
- **State Management**: Custom `useSyncExternalStore` stores
- **Event Listening**: `listen<T>(event, cb)` for main process push events
- **Command Dispatch**: `invoke<T>(command, args)` for IPC command calls

### Preload Bridge (`electron/preload/`)

The preload script exposes a minimal, typed API via `contextBridge`:

```typescript
window.electronAPI = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
}
```

---

## Three-Panel UI Architecture

The UI is a horizontal `PanelGroup` with three resizable panels:

```
┌──────────────┬──────────────────────────────┬───────────────┐
│ ResourceSide │ SandboxWorkspace / Browser   │ CopilotSidebar│
│ bar (left)   │ Panel / WikiGraphFullscreen  │ (right)       │
│              │  (switches by activeMainView) │               │
│ 15-50%       │  ──────────────────────────  │ Collapsible   │
│              │  TerminalPanel (bottom split) │ Cmd+L toggle  │
└──────────────┴──────────────────────────────┴───────────────┘
```

### Left Panel — Resource Sidebar

Controlled by `layoutStore.leftSidebarView`:

| View | Component | Description |
|------|-----------|-------------|
| `sources` | `SourceListView` | Knowledge sources/documents list |
| `research` | `ResearchView` | Research workspace |
| `detail` | `SourceDetailView` | Source detail view |
| `agent` | Agent threads | Agent conversation browser |
| `cards` | `CardsView` | Knowledge cards |
| `skills` | `SkillsView` | Agent skills management |
| `threads` | `ThreadsView` | Conversation threads |
| `files` | `ProjectFilesView` | File tree |
| `wiki` | Wiki view | Wiki pages |
| `websearch` | Web search | Browser-based search |

### Center Panel

Controlled by `layoutStore.activeMainView`:

| View | Component | Description |
|------|-----------|-------------|
| `editor` (default) | `SandboxWorkspace` | Managed mode workspace with execution graph |
| `browser` | `BrowserPanel` | Embedded web browser |
| `wiki-graph` | `WikiGraphFullscreen` | Interactive knowledge graph (D3 + XYFlow) |

The center panel has an optional bottom split for `TerminalPanel` (controlled by `terminalStore.isVisible`).

### Right Panel — Copilot Sidebar

`CopilotSidebar.tsx` hosts the AI chat interface. Key sub-components:

- `CopilotMessagePane` — Virtualized message list with sliding window
- `ChatInput` — Rich input with file drag-drop, slash commands, prompt library
- `PermissionCard` — Tool-call permission UI
- `AskUserQuestion` — Interactive agent clarification flow
- `PlanModeToggle` — Plan mode switch

### Global Overlays

These are rendered above the panels, controlled by stores:

- `SettingsModal` — Full settings panel (5 categories, 21 subtabs)
- `CommandPalette` — `Cmd+K` fuzzy command search
- `ReaderApp` — Full-screen e-book reader (triggered by `readerStore.openedBookId`)
- `KnowledgeCardsApp` — Full-screen card library (triggered by `cardLibraryStore.open`)
- `MascotOnboarding` — First-run pet introduction

---

## IPC Communication Layer

### Type-Safe Contract

All IPC commands are defined in `electron/shared/ipc-schema.ts` (3,200+ lines). This file is the **single source of truth** for:

- Command names (string literal unions)
- Input types (TypeScript interfaces)
- Output types (TypeScript interfaces)

```typescript
// Example from ipc-schema.ts
export interface IpcSchema {
  get_source: { input: { id: string }; output: Source | null };
  list_sources: { input: { project_id?: string }; output: Source[] };
  // ... 150+ more commands
}
```

### Registration Pattern

Commands are registered in `electron/main/ipc/register.ts`:

```typescript
// Handler factory pattern
const sourceHandlers = createSourceHandlers(db);
ipcMain.handle('list_sources', (_, args) => sourceHandlers.listSources(args));
ipcMain.handle('get_source', (_, args) => sourceHandlers.getSource(args));
```

### Renderer-Side Invocation

```typescript
import { invoke } from '@/lib/tauriCompat';

const sources = await invoke('list_sources', { project_id: undefined });
```

### Event Push (Main → Renderer)

```typescript
// Main process pushes events
mainWindow.webContents.send('agent:stream', { chunk: '...' });

// Renderer listens
import { listen } from '@/lib/tauriEventCompat';
const unlisten = await listen('agent:stream', (event) => {
  // handle event payload
});
```

### Handler Domain Organization

Handlers are organized by domain in `electron/main/ipc/handlers/`:

| Domain | File | Commands |
|--------|------|----------|
| Agent Runtime | `agent.ts` | Session/message CRUD |
| Agent SDK | `agentSdk.ts` | Claude Agent SDK runner (63KB) |
| Sources | `sources.ts` | Knowledge source management |
| Reader | `reader.ts` | E-book operations |
| TTS | `tts.ts` | Text-to-speech |
| Wiki | `wiki.ts` + `wikiGeneration.ts` | Wiki + knowledge graph |
| Files | `files.ts` + `fsSafe.ts` | Safe filesystem operations |
| MCP | `mcp.ts` | MCP server management |
| Remote Control | `remoteControl.ts` | IM platform integration |
| Cloud Node | `cloudNode.ts` | Cloud relay client |
| Skills | `skills.ts` + `skillsMarketplace.ts` | Skill management + marketplace |
| Config | `config.ts` | Settings CRUD |
| LLM | `providers.ts` | LLM provider management |
| Sync | `sync.ts` | WebDAV backup/restore |
| Terminal | `terminal.ts` | PTY management |
| ... and 30+ more | | |

---

## State Management

IPO Workbench uses a custom store system based on `useSyncExternalStore` (no Zustand, no Redux).

### Store Factory

```typescript
// src/lib/stores/createStore.ts
function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<() => void>();

  const getState = () => state;
  const setState = (updater: Partial<T> | ((prev: T) => Partial<T>)) => {
    const next = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

// React hook
function createUseStore(store) {
  return () => useSyncExternalStore(store.subscribe, store.getState);
}
```

### Store Map

| Store | Location | Responsibility |
|-------|----------|---------------|
| `layoutStore` | `src/lib/stores/` | Panel views, sidebar state, visibility |
| `researchStore` | `src/lib/stores/` | Research workspace state |
| `tabStore` | `src/lib/stores/` | Tab management |
| `terminalStore` | `src/lib/stores/` | Terminal visibility and PTY state |
| `diffStore` | `src/lib/stores/` | Code diff viewer |
| `readerStore` | `src/lib/stores/` | E-book reader state |
| `commandPaletteStore` | `src/lib/stores/` | Command palette visibility |
| `cardLibraryStore` | `src/lib/stores/` | Knowledge card library |
| `settingsStore` | `src/lib/` | Settings read/write |
| `workspaceStore` | `src/lib/` | Aggregated workspace (layout + research + tab) |
| `agentStore` | `src/lib/agent/` | Agent runtime state |
| `chatSettingsStore` | `src/lib/agent/` | Chat settings |
| `askUserQuestionStore` | `src/lib/agent/` | Agent interactive Q&A |
| `permissionStore` | `src/lib/agent/` | Tool permission state |
| `planModeStore` | `src/lib/agent/` | Plan mode toggle |
| `mascotStore` | `src/lib/` | Desktop pet state |
| `skillsStore` | `src/lib/` | Skills state |
| `skillsMarketplaceStore` | `src/lib/` | Marketplace state |
| `sandboxEditorStore` | `src/lib/` | Sandbox editor state |
| `previewServerStore` | `src/lib/` | Preview server state |
| `customPromptStore` | `src/lib/` | Custom prompt library |

---

## Database Layer

### Technology

- **Engine**: libSQL (open-source SQLite fork by Turso)
- **ORM**: Drizzle ORM with raw SQL migrations
- **Features**: FTS5 full-text search, JSON columns, WAL mode

### Schema

Database schema is defined in `electron/main/db/migrations/initSql.ts` using raw SQL. Key tables:

| Table | Purpose |
|-------|---------|
| `projects` | Project metadata |
| `sources` | Knowledge sources/documents |
| `notes` | User notes |
| `folders` | Folder hierarchy |
| `agent_sessions` | AI conversation sessions |
| `agent_messages` | Conversation messages |
| `agent_tasks` | Agent task tracking |
| `agent_tool_calls` | Tool call audit log |
| `agent_memories` | Persistent agent memory |
| `agent_checkpoints` | Session checkpoints for resume |
| `books` | E-book metadata |
| `highlights` | Reading highlights |
| `bookmarks` | Reading bookmarks |
| `srs_cards` | Spaced repetition cards |
| `knowledge_cards` | Knowledge card library |
| `wiki_pages` | Wiki content |
| `wiki_relations` | Knowledge graph edges |
| `skills` | Installed agent skills |
| `mcp_servers` | MCP server configurations |
| `providers` | LLM provider configurations |
| `configs` | Key-value configuration store |
| `output_assets` | AI-generated artifacts |
| `share_cards` | Shareable knowledge cards |
| `remote_pairings` | Remote control device pairings |
| `remote_sessions` | Remote control sessions |
| `backup_history` | Backup history |

### Data Scope

All data defaults to `scope: "global"`. The `project_id` foreign key is preserved for backward compatibility, but the UI no longer exposes a "project" concept. `list_sources` returns all sources when `project_id` is null.

---

## AI Agent Architecture

### Claude Agent SDK Integration

The agent system in `electron/main/ipc/handlers/agentSdk.ts` (63KB) wraps the Anthropic Claude Agent SDK with:

```
┌─────────────────────────────────────────────────┐
│                agent_sdk_start                    │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │   Config      │  │  Skill       │              │
│  │   Manager     │  │  Sync        │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                      │
│  ┌──────▼──────────────────▼───────┐             │
│  │     Claude Agent SDK Runner      │             │
│  │  ┌─────────┐  ┌──────────────┐  │             │
│  │  │ Event   │  │ Interaction  │  │             │
│  │  │Transform│  │ Broker       │  │             │
│  │  └────┬────┘  └──────┬───────┘  │             │
│  │       │               │          │             │
│  └───────┼───────────────┼──────────┘             │
│          │               │                        │
│    ┌─────▼─────┐  ┌──────▼───────┐               │
│    │ IPC Events │  │ Permission   │               │
│    │ (Renderer) │  │ UI (Renderer)│               │
│    └────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────┘
```

### Key Sub-Modules (`agentSdk/`)

| Module | Purpose |
|--------|---------|
| `interactionBroker` | Handles tool permission requests (allow/deny/modify) |
| `runRegistry` | Tracks active SDK runs by ID |
| `sessionId` | Generates and manages session identifiers |
| `configManager` | Resolves user path, normalizes settings, prepares isolated config |
| `eventTransformer` | Converts SDK events to renderer-friendly IPC events |
| `fileResolver` | Resolves file paths for tool inputs |
| `toolValidation` | Validates required tool parameters |
| `scenarioAgents` | Predefined agent scenarios (code review, research, etc.) |
| `multiAgentRuntime` | Sub-agent and teammate collaboration |
| `modelSettingsLoader` | Per-scenario model configuration |
| `localWebSearchMcp` | Built-in web search MCP server |

### Agent Lifecycle

1. **Start**: `agent_sdk_start` creates a new run with full config
2. **Stream**: Events flow from SDK → eventTransformer → IPC → renderer
3. **Interaction**: Tool calls requiring permission pause the run via interactionBroker
4. **Permission**: Renderer shows permission UI, user approves/denies
5. **Resume**: `agent_sdk_resolve_interaction` resumes the run
6. **Follow-up**: `agent_sdk_send_followup` sends additional user messages
7. **Abort**: `agent_sdk_abort` cleanly terminates the run
8. **Checkpoint**: `agent_checkpoint_save` persists session state for later resume

---

## LLM Multi-Provider Layer

The LLM layer in `electron/main/llm/` supports multiple providers through a unified interface:

### Supported Providers

| Provider | Backend |
|----------|---------|
| Anthropic | Direct Anthropic API |
| OpenAI | OpenAI-compatible API |
| DeepSeek | DeepSeek API (OpenAI-compatible) |
| Ollama | Local Ollama server |
| Dify | Dify platform API |
| Custom | Any OpenAI-compatible endpoint |

### Streaming

Streaming is managed by `streamRegistry.ts`:

```typescript
// Create a cancellable stream
const streamId = createStream();
const stream = await provider.chat.completions.create({ stream: true, ... });

// Push chunks to renderer
for await (const chunk of stream) {
  mainWindow.webContents.send('llm:stream', { streamId, chunk });
}

// Cancel from renderer
cancelStream(streamId);
```

### Anthropic Proxy

A local Express server (`electron/main/http/anthropicProxy/`) provides:

- Anthropic-compatible API endpoint for the Agent SDK
- Default port 8765 (probes 10 ports if busy)
- Request/response logging
- API key injection from settings

---

## Service Layer

21 background services in `electron/main/services/`:

| Service | Lifecycle | Purpose |
|---------|-----------|---------|
| `AutoSyncScheduler` | Background | Periodic WebDAV sync |
| `BackupManager` | On-demand | ZIP backup creation/restore |
| `BackupHistoryManager` | On-demand | Backup history tracking |
| `ConflictDetectionService` | Sync-time | Data conflict resolution |
| `CryptoService` | On-demand | Sensitive data encryption |
| `WebDavService` | On-demand | WebDAV client operations |
| `contentIngest` | On-demand | URL/file content extraction |
| `customMascotProtocol` | Startup | `mascot://` protocol registration |
| `customMascotService` | On-demand | Custom mascot management |
| `devServerProcessService` | On-demand | Dev server lifecycle |
| `fileWatcherService` | Background | Chokidar file watching |
| `imageGeneration` | On-demand | AI image generation |
| `mcpRuntimeService` | On-demand | MCP server process management |
| `petGlobalShortcut` | Startup | Ctrl+Alt+Space hotkey |
| `petWindowService` | Startup | Pet BrowserWindow lifecycle |
| `previewServerService` | On-demand | Frontend preview server |
| `previewWindowService` | On-demand | Preview window management |
| `terminalService` | On-demand | node-pty session management |
| `ttsService` | On-demand | Multi-provider TTS |
| `worktreeService` | On-demand | Git worktree management |

---

## Startup Sequence

Defined in `electron/main/app-lifecycle.ts`, the `bootstrapApp()` function follows this exact sequence:

```
1. Pre-ready
   ├── Register mascot:// protocol privileges
   └── app.whenReady()

2. Early Init
   ├── Ensure macOS Dock icon
   ├── Register mascot:// protocol handler
   └── Reconcile custom mascot index (async)

3. Core Init
   ├── Initialize libSQL/Drizzle database
   ├── Initialize remote control orchestrator
   ├── Initialize cloud node client
   └── Register all IPC handlers

4. Window Creation
   ├── Create main BrowserWindow
   ├── Initialize pet window service
   ├── Boot pet window
   └── Register pet global hotkey

5. Background Phase (async, non-blocking)
   ├── Start HTTP servers (Anthropic proxy + Clip)
   ├── Start remote control
   ├── Start cloud node client
   └── Start auto-sync scheduler

6. Cleanup (before-quit)
   ├── Stop auto-sync
   ├── Stop remote control
   ├── Stop cloud node
   ├── Stop pet window
   ├── Kill terminal processes
   ├── Stop file watchers
   └── Invalidate provider cache
```

---

## Design System

### B.AI Warm-Tone Design

The design system is inspired by Claude.ai and B.AI:

- **Background**: Warm cream (`#FAF9F5`)
- **Primary text**: Near-black (`#1A1A19`)
- **Accent colors**: Peach, mint, violet (used sparingly, ~1% of surface)
- **Color scale**: `cream-50` through `cream-900` via CSS custom properties (`--t-*`)
- **Semantic colors**: Error (`#b53333`), Focus (`#3898ec`), Success (`#4a7c59`)

### Typography

| Role | Font |
|------|------|
| Sans (body) | Inter |
| Serif (reading) | Merriweather |
| Mono (code) | JetBrains Mono |

### Component Patterns

- **Capsule-based**: Buttons, tags, badges use full-rounded capsule shapes
- **Subtle shadows**: `bai-card`, `bai-pop`, `bai-ring` — understated depth
- **Warm animations**: 14+ custom animations including `fade-in`, `scale-in`, `mascot-float`, `thinking-dot`, `shimmer`

### Dark Mode

Class-based dark mode (`darkMode: "class"`) with CSS variable swaps.

---

## Security Model

### Filesystem Safety

All file operations go through `*_safe` handlers:
- `read_file_safe`, `write_file_safe`, `list_files_safe`, `mkdir_safe`
- `copy_file_safe`, `move_file_safe`, `delete_file_safe`, `reveal_file_safe`
- All paths must be absolute
- Sandboxed to configured directories

### Agent Permissions

The agent permission system has three modes:
- **Ask** (default): Prompt user for each tool call
- **Allow**: Auto-approve specific tool categories
- **Deny**: Block specific tool categories

### Data Privacy

- All data stored locally in `app.getPath("userData")/db.sqlite`
- No telemetry or analytics
- API keys stored in local config, encrypted via `CryptoService`
- AI prompts sent only to configured provider endpoints
