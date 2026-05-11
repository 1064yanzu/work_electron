# IPO Workbench Feature Guide

A comprehensive guide to every feature in IPO Workbench.

## Table of Contents

- [AI Agent Chat (Copilot)](#ai-agent-chat-copilot)
- [Knowledge Management](#knowledge-management)
- [E-Book Reader](#e-book-reader)
- [Code Sandbox](#code-sandbox)
- [Wiki & Knowledge Graph](#wiki--knowledge-graph)
- [Text-to-Speech (TTS)](#text-to-speech-tts)
- [Desktop Pet (Mascot)](#desktop-pet-mascot)
- [Remote Control](#remote-control)
- [Browser & Content Clipping](#browser--content-clipping)
- [AI Image Generation](#ai-image-generation)
- [Skills Marketplace](#skills-marketplace)
- [MCP Server Management](#mcp-server-management)
- [Command Palette](#command-palette)
- [Backup & Sync](#backup--sync)
- [Settings Panel](#settings-panel)

---

## AI Agent Chat (Copilot)

The Copilot is the core of IPO Workbench — an AI assistant powered by the **Anthropic Claude Agent SDK** with real tool-use capabilities.

### Chat Interface

Located in the right panel (`CopilotSidebar.tsx`), the chat interface supports:

- **Rich Message Display**: Markdown rendering with syntax highlighting (Shiki), code blocks, tables, lists
- **Virtualized Scrolling**: Sliding window of messages for smooth performance with long conversations
- **File Drag & Drop**: Drop files directly into the chat input for context
- **Prompt Library**: Save and reuse frequently used prompts
- **Session Auto-Title**: AI automatically generates session titles from conversation content

### Tool-Use Agent

The AI assistant can use tools to interact with your system:

| Category | Tools |
|----------|-------|
| **File Operations** | Read, write, list, create, copy, move, delete files |
| **Terminal** | Execute shell commands, manage processes |
| **Knowledge Base** | Search sources, manage notes, query embeddings |
| **Web Search** | Search the web via Exa MCP or built-in search |
| **Image Generation** | Generate images from text descriptions |
| **Reader** | Search books, manage highlights, create cards |
| **Wiki** | Create/edit wiki pages, manage knowledge graph |
| **TTS** | Synthesize speech, manage voices |
| **MCP Tools** | Any connected MCP server's tools |

### Plan Mode

Toggle plan mode to make the AI think step-by-step before acting:

- The AI breaks down complex tasks into steps
- Presents a plan for your approval before execution
- Useful for multi-step file operations, refactoring, or research

### Slash Commands

20+ built-in slash commands accessible via `/` in the chat input:

| Command | Description |
|---------|-------------|
| `/compact` | Compress conversation context to save tokens |
| `/init` | Initialize project documentation |
| `/review` | Review code changes |
| `/help` | Show available commands |
| `/cost` | Show token usage and cost |
| `/agents` | List active agent sessions |
| `/permissions` | Manage tool permissions |
| `/hooks` | Manage event hooks |
| `/add-dir` | Add directory to agent context |
| `/security-review` | Security audit of current changes |
| `/export` | Export session as markdown |
| `/doctor` | Run diagnostics |
| `/release-notes` | Show release notes |
| `/todos` | Show task list |
| `/feedback` | Send feedback |
| `/output-style` | Change output formatting |
| `/rename` | Rename current session |
| `/clear` | Clear conversation |
| `/settings` | Open settings |

### Agent Memory

The persistent memory system allows the AI to remember across sessions:

- **Auto-Extraction**: The AI automatically extracts important facts from conversations
- **Memory Search**: Semantic search across all stored memories
- **Memory Types**: User preferences, project context, feedback, references
- **Memory Management**: Create, update, delete, and clear memories via settings

### Multi-Agent Collaboration

Support for complex multi-agent workflows:

- **Sub-Agents**: Spawn specialized sub-agents for parallel tasks
- **Teammate Mode**: Multiple agents collaborate on a shared task
- **Role Assignment**: Assign specific roles/expertise to each agent

### Session Management

- **Persistent History**: All conversations saved to database
- **Session Resume**: Resume any past conversation from where you left off
- **Checkpoints**: Save agent state at any point for later restoration
- **Export**: Export sessions as markdown files

---

## Knowledge Management

A complete knowledge lifecycle from ingestion to retrieval to creation.

### Sources

Import knowledge from multiple sources:

- **URL**: Paste a URL and the system extracts the content automatically
- **File Upload**: Upload documents (PDF, DOCX, TXT, MD, HTML, EPUB)
- **Direct Paste**: Paste text directly into a new source
- **Browser Clip**: Clip content from the built-in browser
- **File Import**: Import local files from the filesystem

Each source goes through:
1. Content extraction (HTML → plain text, PDF → text, etc.)
2. Automatic chunking for knowledge base indexing
3. Optional vector embedding generation
4. Metadata extraction (title, author, date, tags)

### Organization

- **Folders**: Hierarchical folder structure with drag-and-drop
- **Tags**: Flexible tagging system
- **Scope**: Global or project-scoped organization
- **Search**: FTS5 full-text search across all sources

### Knowledge Base Search

Two search modes:

1. **Full-Text Search (FTS5)**: Fast keyword-based search using SQLite FTS5
2. **Vector Search**: Semantic search via embedding-based chunk retrieval

### Notes

Rich note-taking integrated with the knowledge base:

- Markdown editing
- Auto-save
- Link to sources
- Searchable via FTS5

### Knowledge Cards

Flashcard system with spaced repetition (SRS):

- Create cards from highlights, notes, or manually
- SRS algorithm schedules reviews at optimal intervals
- Track review history and mastery levels
- Full-screen card library view (`KnowledgeCardsApp`)

---

## E-Book Reader

A full-featured e-book reading experience.

### Supported Formats

| Format | Extension | Engine |
|--------|-----------|--------|
| PDF | `.pdf` | react-pdf + pdf-parse |
| EPUB | `.epub` | epub.js |
| MOBI | `.mobi` | node-stream-zip parsing |
| AZW3 | `.azw3` | node-stream-zip parsing |
| Text | `.txt` | Native |
| HTML | `.html` | Mozilla Readability |
| Markdown | `.md` | react-markdown |
| DOCX | `.docx` | mammoth.js |
| CBZ | `.cbz` | Image archive viewer |

### Reading Features

- **Progress Tracking**: Automatic reading progress saved per book
- **Font Settings**: Adjustable font size, family, line height, margins
- **Theme**: Light/dark/sepia reading themes
- **Table of Contents**: Navigate chapters via sidebar TOC
- **Full-Screen Mode**: Distraction-free reading overlay

### Annotations

- **Highlights**: Select text to create color-coded highlights
- **Notes**: Attach notes to highlights
- **Bookmarks**: Quick-access bookmarks per book
- **Export**: Export all highlights and notes

### Knowledge Card Generation

Convert highlights into spaced-repetition flashcards:

1. Select text in the reader
2. Create highlight with optional note
3. Generate knowledge card from highlight
4. Card enters SRS review queue

### Reading Sessions

Track reading habits:

- Session start/end times
- Pages read per session
- Total reading time per book
- Reading streak tracking

---

## Code Sandbox

A managed coding environment in the center panel.

### Terminal

- **Full PTY**: node-pty backend with full terminal emulation
- **xterm.js**: Feature-rich terminal frontend (256 colors, Unicode, mouse events)
- **Multiple Sessions**: Create and manage multiple terminal tabs
- **Resize**: Responsive terminal resizing

### File Operations

Safe filesystem operations through IPC:

- Read/write files
- List directories
- Create/delete directories
- Copy/move files
- Reveal in system file manager

All operations are sandboxed to configured directories with absolute path validation.

### Execution Graph

Visual representation of code execution flow:

- **XYFlow**: React-based node graph visualization
- **DAG Layout**: Directed acyclic graph of execution steps
- **Real-Time Updates**: Live updates as code executes
- **Node Types**: Input, process, output, decision nodes

### Preview Server

Built-in development server for frontend projects:

- Auto-detect project type (Vite, Next.js, etc.)
- Start/stop dev server
- Embedded preview in browser panel
- Port management

### Git Worktree

Isolated git worktree management:

- Create worktrees for parallel development
- Switch between worktrees
- Automatic branch management

---

## Wiki & Knowledge Graph

Visual knowledge exploration and documentation.

### Wiki Pages

- Create and edit wiki pages with rich markdown content
- AI-assisted page generation from knowledge sources
- Cross-linking between pages
- Version history

### Knowledge Graph

Interactive visualization of knowledge relationships:

- **D3 + XYFlow**: Powerful graph rendering
- **Node Types**: Pages, sources, concepts, people
- **Edge Types**: References, dependencies, related topics
- **Interactive**: Pan, zoom, click to navigate
- **Filtering**: Filter by node type, date, relevance
- **Layouts**: Force-directed, hierarchical, circular

### Full-Screen Mode

The knowledge graph can take over the entire center panel (`activeMainView: "wiki-graph"`) for deep exploration.

---

## Text-to-Speech (TTS)

Multi-provider text-to-speech system.

### Providers

| Provider | Description | Features |
|----------|-------------|----------|
| **System** | OS-native TTS | Basic, no API key needed |
| **OpenAI Compatible** | Any OpenAI TTS endpoint | Multiple voices, high quality |
| **ElevenLabs** | ElevenLabs API | Premium quality, voice cloning |
| **Volcano Engine** | ByteDance TTS | Chinese language optimized |
| **MiMo** | MiMo TTS | Fast, lightweight |
| **Custom** | User-configured endpoint | Flexible |

### Voice Cloning

Clone custom voices from audio samples:

1. Upload audio samples (3-10 minutes recommended)
2. System creates a voice clone
3. Use cloned voice for synthesis
4. Manage cloned voices in settings

### Streaming

Real-time streaming audio output:

- Audio starts playing before full synthesis completes
- Low-latency playback
- Cancel in-progress synthesis

### Pet Integration

The desktop pet can speak synthesized text:

- TTS audio plays while text appears in speech bubble
- Automatic lip-sync timing
- Pet animation syncs with speech

---

## Desktop Pet (Mascot)

An animated desktop companion.

### Animations

6 motion states with hand-crafted sprites:

| State | Description |
|-------|-------------|
| **Idle** | Default resting animation |
| **Thinking** | Appears when AI is processing |
| **Greet** | Welcoming gesture |
| **Done** | Celebration when task completes |
| **Sad** | Reaction to errors or rejection |
| **Sleepy** | Low-activity state |

### Features

- **Mouse Gaze**: The pet's eyes follow your cursor
- **Speech Bubbles**: Text bubbles appear when the pet speaks
- **Global Hotkey**: `Ctrl+Alt+Space` summons the pet from anywhere
- **Drag & Drop**: Reposition the pet on screen
- **Opacity Control**: Adjust pet transparency
- **Click Interactions**: Click the pet for reactions

### Custom Mascot Packs

Import community-created mascot packs:

- `mascot://` protocol for one-click import
- Custom sprite atlases (8 columns × 6 rows × 512×512 cells)
- Per-row animation duration manifest
- Preview before applying

### Onboarding

First-run guided introduction:

- Introduces the pet character
- Explains basic interactions
- Customizable personality and catchphrases

---

## Remote Control

Control IPO Workbench from messaging platforms.

### Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **Feishu/Lark** | Stable | Bot, messages, cards |
| **Telegram** | Stable | Bot, commands, inline |
| **Slack** | Stable | Bolt app, slash commands |
| **Discord** | Stable | Bot, slash commands, embeds |
| **QQ Bot** | Beta | Basic messaging |
| **WeChat** | Experimental | Limited support |
| **Webhook** | Stable | Generic HTTP webhook |

### Pairing Security

Secure device pairing workflow:

1. Enable remote control in settings
2. Configure platform credentials
3. Send pairing request from messaging platform
4. Approve pairing in IPO Workbench
5. Secure session established

### Agent Binding

Bind an AI agent session to a remote channel:

- Messages from the remote platform become AI prompts
- AI responses are forwarded to the remote channel
- Support for tool use and interactive permissions
- Session management (create, terminate, list)

### Capabilities

Each platform integration supports:

- Text message relay
- Command handling
- Rich message formatting
- File sharing (where supported)
- Typing indicators

---

## Browser & Content Clipping

### Built-in Browser

An embedded web browser in the center panel:

- URL navigation
- Page content extraction
- Search integration
- Bookmark support

### Content Clipping

Clip web content into your knowledge base:

- **URL Fetch**: Fetch and extract content from any URL
- **Page Parse**: Mozilla Readability-based content extraction
- **Exa MCP Search**: AI-powered web search via Exa
- **Auto-Import**: Clipped content auto-imported as a source

### Clip HTTP Service

Local HTTP service for browser extension integration:

- Default port 21064 (probes 10 ports)
- RESTful API for content submission
- Compatible with browser clipper extensions

---

## AI Image Generation

Multi-provider image generation from text prompts.

### Supported Providers

- DALL-E (OpenAI)
- Stable Diffusion
- Custom endpoints (OpenAI-compatible API)

### Features

- Text-to-image generation
- Style presets
- Resolution options
- Batch generation
- Output asset management (save, list, delete)

---

## Skills Marketplace

Discover, install, and manage agent skills.

### Skills

Agent skills extend the AI's capabilities:

- Custom tool definitions
- System prompt templates
- Workflow automations
- Domain-specific knowledge

### Marketplace

Multi-source marketplace for community skills:

- **Mirror Sources**: Multiple marketplace mirrors for reliability
- **Search**: Search skills by name, description, or tags
- **Install/Uninstall**: One-click skill installation
- **Updates**: Automatic update checking
- **Preview**: Preview skill details before installing

### Skill Management

- Enable/disable installed skills
- Import skills from local files
- Skill version tracking
- Skill configuration

---

## MCP Server Management

Model Context Protocol (MCP) server integration.

### Features

- **Server CRUD**: Create, read, update, delete MCP server configurations
- **Environment Check**: Verify server environment requirements
- **Tool Discovery**: List available tools from connected servers
- **Tool Invocation**: Call MCP tools from the AI agent
- **Server Lifecycle**: Start/stop MCP server processes
- **Toggle**: Enable/disable individual servers

---

## Command Palette

Quick access to any command via `Cmd/Ctrl+K`.

### Features

- **Fuzzy Search**: Type to search commands, settings, files, and more
- **Categories**: Commands grouped by category
- **Keyboard Navigation**: Full keyboard support
- **Recent Commands**: Quick access to recently used commands
- **Context-Aware**: Available commands change based on current view

---

## Backup & Sync

### WebDAV Backup

Full data backup to WebDAV-compatible cloud storage:

- **One-Click Backup**: Backup all data (database, sources, settings) to WebDAV
- **Restore**: Restore from any previous backup
- **Backup History**: Track all backup operations
- **Auto-Sync**: Scheduled automatic backups
- **Conflict Detection**: Detect and resolve data conflicts

### Supported WebDAV Services

Any WebDAV-compatible service:

- Nextcloud
- ownCloud
- Synology
- QNAP
- Generic WebDAV servers

---

## Settings Panel

A comprehensive 5-category, 21-subtab settings system.

### General

| Subtab | Settings |
|--------|----------|
| **Appearance & Theme** | Light/dark mode, font size, language |
| **Shortcuts** | Keyboard shortcut customization |
| **About & Updates** | Version info, update checking |

### AI & Models

| Subtab | Settings |
|--------|----------|
| **Providers & Models** | API keys, model selection, provider config |
| **Agent Runtime** | Permission modes, tool settings, sandbox config |
| **Agent Memory** | Memory management, extraction rules |
| **Prompt Templates** | System prompts, custom prompt library |
| **Default Model Assignment** | Per-scenario model assignment |

### Workshop

| Subtab | Settings |
|--------|----------|
| **AI Image Generation** | Provider selection, default settings |
| **Reader** | Font, theme, margin, progress settings |
| **TTS (Voice)** | Provider, voice selection, speed, volume |
| **Desktop Pet (Mascot)** | Enable/disable, opacity, hotkey, custom packs |
| **Workspace Layout** | Panel sizes, default views |

### Integrations

| Subtab | Settings |
|--------|----------|
| **MCP Servers** | Server management, tool discovery |
| **Remote Control** | Platform credentials, pairing, sessions |

### Data & Storage

| Subtab | Settings |
|--------|----------|
| **Usage Stats** | Token usage, API costs, activity history |
| **Storage Directory** | Data location, vault path |
| **Backup & Sync** | WebDAV config, auto-sync schedule |
| **Artifact Management** | Artifact storage, cleanup rules |
| **Performance** | Memory limits, cache settings |
| **Danger Zone** | Data reset, factory settings |
