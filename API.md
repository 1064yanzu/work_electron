# IPO Workbench API Reference

An overview of all APIs and IPC commands available in IPO Workbench.

## Table of Contents

- [IPC Communication Model](#ipc-communication-model)
- [Command Categories](#command-categories)
- [System Commands](#system-commands)
- [Content Ingest](#content-ingest)
- [Safe Filesystem](#safe-filesystem)
- [Projects & Folders](#projects--folders)
- [Sources & Notes](#sources--notes)
- [Knowledge Base](#knowledge-base)
- [Agent Runtime](#agent-runtime)
- [Agent SDK Runner](#agent-sdk-runner)
- [Agent Memory](#agent-memory)
- [Agent Skills](#agent-skills)
- [Skills Marketplace](#skills-marketplace)
- [LLM Providers](#llm-providers)
- [LLM Invocation](#llm-invocation)
- [Configuration](#configuration)
- [E-Book Reader](#e-book-reader)
- [Wiki](#wiki)
- [TTS (Text-to-Speech)](#tts-text-to-speech)
- [MCP Servers](#mcp-servers)
- [Remote Control](#remote-control)
- [Cloud Node](#cloud-node)
- [Cards & Artifacts](#cards--artifacts)
- [Storage & Backup](#storage--backup)
- [Terminal](#terminal)
- [Desktop Pet](#desktop-pet)
- [Image Generation](#image-generation)
- [Slash Commands](#slash-commands)
- [Preview Server](#preview-server)
- [Events (Main → Renderer)](#events-main--renderer)

---

## IPC Communication Model

All communication between the renderer process and main process uses Electron's `ipcMain.handle` / `ipcRenderer.invoke` pattern with full TypeScript type safety.

### Sending a Command (Renderer)

```typescript
import { invoke } from '@/lib/tauriCompat';

// TypeScript knows the input and output types from ipc-schema.ts
const source = await invoke('get_source', { id: 'abc123' });
```

### Listening for Events (Renderer)

```typescript
import { listen } from '@/lib/tauriEventCompat';

const unlisten = await listen('agent:stream', (event) => {
  console.log(event.payload);
});

// Cleanup
unlisten();
```

### Type Contract

All command types are defined in `electron/shared/ipc-schema.ts`:

```typescript
interface IpcSchema {
  [command: string]: {
    input: any;    // Command arguments
    output: any;   // Return value
  };
}
```

---

## Command Categories

| Category | Commands | Handler File |
|----------|----------|--------------|
| System | ~10 | `system.ts` |
| Content Ingest | 3 | `contentIngest.ts` |
| Safe Filesystem | 10 | `fsSafe.ts` |
| Projects | 7 | `projects.ts` |
| Folders | 5 | `folders.ts` |
| Sources | 7 | `sources.ts` |
| Notes | 4 | `notes.ts` |
| Knowledge Base | 4 | `kbEmbeddings.ts` |
| Agent Runtime | 7 | `agent.ts` |
| Agent SDK | 6 | `agentSdk.ts` |
| Agent Checkpoints | 4 | `agentCheckpoint.ts` |
| Agent Memory | 10 | `agent.ts` (memory section) |
| Agent Skills | 4 | `skills.ts` |
| Skills Marketplace | 8 | `skillsMarketplace.ts` |
| LLM Providers | 6 | `providers.ts` |
| LLM Invocation | 4 | `llm.ts` |
| Configuration | 5 | `config.ts` |
| Reader | 21 | `reader.ts` |
| Wiki | ~10 | `wiki.ts` + `wikiGeneration.ts` |
| TTS | 11 | `tts.ts` |
| MCP Servers | 10 | `mcp.ts` |
| Remote Control | 15 | `remoteControl.ts` |
| Cloud Node | 4 | `cloudNode.ts` |
| Cards | 4 | `cards.ts` |
| Artifacts | 7 | `artifacts.ts` |
| Storage | 10+ | `storage.ts` |
| Backup/Sync | 5 | `sync.ts` |
| Terminal | 5 | `terminal.ts` |
| Desktop Pet | 5+ | `petWindow.ts` |
| Image Generation | 3 | `imageGen.ts` |
| Slash Commands | 6 | `slashCommands.ts` |
| Preview Server | 5+ | `previewServer.ts` |
| Documents | 1 | `documents.ts` |
| Browser Search | 3 | `browserSearch.ts` |
| **Total** | **~150+** | **49 handler files** |

---

## System Commands

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `app_get_version` | `{}` | `string` | Get app version |
| `health_ping` | `{}` | `{ status: string }` | Health check |
| `system_get_user_info` | `{}` | `UserInfo` | Get system user info |
| `http_get_status` | `{}` | `HttpStatus` | Get HTTP server status |
| `open_browser_window` | `{ url: string }` | `void` | Open URL in system browser |
| `fetch_page_content` | `{ url: string }` | `PageContent` | Fetch and parse page |
| `browser_search` | `{ query: string }` | `SearchResult[]` | Web search |
| `exa_mcp_search` | `{ query: string }` | `SearchResult[]` | Exa MCP search |
| `open_external_url` | `{ url: string }` | `void` | Open external URL |

---

## Content Ingest

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `fetch_url_content` | `{ url: string }` | `ContentResult` | Fetch and extract URL content |
| `upload_file_content` | `{ path: string }` | `ContentResult` | Extract file content |
| `import_local_files` | `{ paths: string[] }` | `ImportResult[]` | Import local files as sources |

---

## Safe Filesystem

All filesystem operations require absolute paths and are sandboxed to configured directories.

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `read_file_safe` | `{ path: string }` | `string` | Read file content |
| `write_file_safe` | `{ path: string; content: string }` | `void` | Write file content |
| `list_files_safe` | `{ path: string }` | `FileEntry[]` | List directory contents |
| `mkdir_safe` | `{ path: string }` | `void` | Create directory |
| `copy_file_safe` | `{ src: string; dest: string }` | `void` | Copy file |
| `move_file_safe` | `{ src: string; dest: string }` | `void` | Move file |
| `delete_file_safe` | `{ path: string }` | `void` | Delete file/directory |
| `reveal_file_safe` | `{ path: string }` | `void` | Reveal in file manager |
| `save_temp_file` | `{ name: string; content: string }` | `string` | Save to temp, return path |
| `agent_get_sandbox_dir` | `{}` | `string` | Get agent sandbox directory |

---

## Projects & Folders

### Projects

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_projects` | `{}` | `Project[]` | List all projects |
| `get_project` | `{ id: string }` | `Project` | Get project by ID |
| `create_project` | `ProjectInput` | `Project` | Create project |
| `update_project` | `{ id, ...updates }` | `Project` | Update project |
| `delete_project` | `{ id: string }` | `void` | Delete project |
| `get_recent_projects` | `{ limit?: number }` | `Project[]` | Get recent projects |
| `record_project_visit` | `{ id: string }` | `void` | Record project visit |

### Folders

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_folders` | `{ project_id?: string }` | `Folder[]` | List folders |
| `create_folder` | `FolderInput` | `Folder` | Create folder |
| `update_folder` | `{ id, ...updates }` | `Folder` | Update folder |
| `delete_folder` | `{ id: string }` | `void` | Delete folder |
| `move_sources_to_folder` | `{ source_ids, folder_id }` | `void` | Move sources to folder |

---

## Sources & Notes

### Sources

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_sources` | `{ project_id?, folder_id? }` | `Source[]` | List sources |
| `get_source` | `{ id: string }` | `Source` | Get source by ID |
| `get_source_detail` | `{ id: string }` | `SourceDetail` | Get source with chunks |
| `create_source` | `SourceInput` | `Source` | Create source |
| `update_source` | `{ id, ...updates }` | `Source` | Update source |
| `delete_source` | `{ id: string }` | `void` | Delete source |
| `search_sources` | `{ query: string }` | `Source[]` | Full-text search sources |

### Notes

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_notes` | `{ project_id?: string }` | `Note[]` | List notes |
| `create_note` | `NoteInput` | `Note` | Create note |
| `update_note` | `{ id, ...updates }` | `Note` | Update note |
| `delete_note` | `{ id: string }` | `void` | Delete note |

---

## Knowledge Base

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `kb_search_chunks` | `{ query, limit? }` | `Chunk[]` | Search chunks (FTS5 + vector) |
| `kb_chunk_rebuild` | `{ source_id: string }` | `void` | Rebuild source chunks |
| `kb_get_embedding_stats` | `{}` | `EmbeddingStats` | Get embedding statistics |
| `kb_embeddings_rebuild` | `{}` | `void` | Rebuild all embeddings |

---

## Agent Runtime

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `agent_create_session` | `SessionInput` | `Session` | Create conversation session |
| `agent_get_session` | `{ id: string }` | `Session` | Get session by ID |
| `agent_list_sessions` | `ListOptions` | `Session[]` | List sessions |
| `agent_update_session` | `{ id, ...updates }` | `Session` | Update session |
| `agent_delete_session` | `{ id: string }` | `void` | Delete session |
| `agent_create_message` | `MessageInput` | `Message` | Create message in session |
| `agent_list_messages` | `{ session_id }` | `Message[]` | List session messages |

---

## Agent SDK Runner

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `agent_sdk_start` | `AgentStartConfig` | `AgentStartResult` | Start agent run |
| `agent_sdk_abort` | `{ run_id: string }` | `void` | Abort agent run |
| `agent_sdk_resolve_interaction` | `ResolveConfig` | `void` | Resolve permission request |
| `agent_sdk_control` | `ControlConfig` | `void` | Send control signal |
| `agent_sdk_send_followup` | `FollowupConfig` | `void` | Send follow-up message |
| `agent_sdk_check_alive` | `{ run_id: string }` | `boolean` | Check if run is active |

### AgentStartConfig

```typescript
interface AgentStartConfig {
  prompt: string;
  model?: string;
  cwd?: string;
  resume_session_id?: string;
  mcp_servers?: McpServerConfig[];
  permission_mode?: 'ask' | 'allow' | 'deny';
  allowed_tools?: string[];
  system_prompt?: string;
  skills?: string[];
  additional_dirs?: string[];
  plugins?: PluginConfig[];
  sandbox?: SandboxConfig;
  interactive_approval?: boolean;
  multi_agent?: MultiAgentConfig;
  context_budget?: ContextBudgetConfig;
}
```

---

## Agent Memory

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `search_agent_memories` | `{ query, limit? }` | `Memory[]` | Search memories |
| `create_agent_memory` | `MemoryInput` | `Memory` | Create memory |
| `update_agent_memory` | `{ id, ...updates }` | `Memory` | Update memory |
| `delete_agent_memory` | `{ id: string }` | `void` | Delete memory |
| `get_agent_memory_by_key` | `{ key: string }` | `Memory` | Get memory by key |
| `update_agent_memory_access_time` | `{ id: string }` | `void` | Touch access time |
| `agent_get_memory_context` | `{}` | `string` | Get memory context for agent |
| `agent_extract_memories` | `{ text: string }` | `Memory[]` | Extract memories from text |
| `agent_clear_all_memories` | `{}` | `void` | Clear all memories |
| `agent_get_memory_stats` | `{}` | `MemoryStats` | Get memory statistics |

---

## Agent Skills

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_skills` | `{}` | `Skill[]` | List installed skills |
| `import_skill` | `{ path: string }` | `Skill` | Import skill from file |
| `delete_skill` | `{ id: string }` | `void` | Delete skill |
| `set_skill_enabled` | `{ id, enabled }` | `void` | Enable/disable skill |

---

## Skills Marketplace

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `skills_marketplace_list_sources` | `{}` | `MarketplaceSource[]` | List marketplace mirrors |
| `skills_marketplace_set_sources` | `{ sources }` | `void` | Set marketplace sources |
| `skills_marketplace_search` | `{ query }` | `MarketplaceSkill[]` | Search marketplace |
| `skills_marketplace_install` | `{ skill_id }` | `void` | Install skill |
| `skills_marketplace_uninstall` | `{ skill_id }` | `void` | Uninstall skill |
| `skills_marketplace_check_updates` | `{}` | `UpdateInfo[]` | Check for updates |
| `skills_marketplace_test_mirror` | `{ url }` | `TestResult` | Test mirror connectivity |
| `skills_marketplace_preview` | `{ skill_id }` | `SkillPreview` | Preview skill details |

---

## LLM Providers

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_providers` | `{}` | `Provider[]` | List all providers |
| `upsert_provider` | `ProviderInput` | `Provider` | Create/update provider |
| `delete_provider` | `{ id: string }` | `void` | Delete provider |
| `check_provider_api_key` | `{ id: string }` | `KeyCheckResult` | Validate API key |
| `reset_core_providers` | `{}` | `void` | Reset to default providers |
| `provider_fetch_models` | `{ id: string }` | `Model[]` | Fetch available models |

### Supported Provider Types

| Type | API Format |
|------|-----------|
| `anthropic` | Anthropic Messages API |
| `openai` | OpenAI Chat Completions |
| `deepseek` | OpenAI-compatible |
| `ollama` | Ollama local API |
| `dify` | Dify platform API |
| `custom` | Any OpenAI-compatible endpoint |

---

## LLM Invocation

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `invoke_llm` | `LlmRequest` | `LlmResponse` | Non-streaming LLM call |
| `invoke_llm_stream` | `LlmRequest` | `StreamId` | Start streaming LLM call |
| `invoke_llm_stream_cancel` | `{ stream_id }` | `void` | Cancel streaming call |
| `invoke_image_generation` | `ImageRequest` | `ImageResult` | Generate image |

---

## Configuration

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `get_config` | `{ key: string }` | `string | null` | Get config value |
| `set_config` | `{ key, value }` | `void` | Set config value |
| `get_all_configs` | `{}` | `Record<string, string>` | Get all config values |
| `get_active_model` | `{}` | `ModelConfig` | Get active model config |
| `set_active_model` | `ModelConfig` | `void` | Set active model |

---

## E-Book Reader

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `reader_import_files` | `{ paths: string[] }` | `Book[]` | Import book files |
| `reader_list_books` | `{}` | `Book[]` | List all books |
| `reader_get_book` | `{ id: string }` | `Book` | Get book details |
| `reader_open_book` | `{ id: string }` | `BookContent` | Open book for reading |
| `reader_delete_book` | `{ id: string }` | `void` | Delete book |
| `reader_get_chapter` | `{ book_id, chapter_id }` | `Chapter` | Get chapter content |
| `reader_save_progress` | `{ book_id, progress }` | `void` | Save reading progress |
| `reader_search_in_book` | `{ book_id, query }` | `SearchResult[]` | Search within book |
| `reader_search_global` | `{ query }` | `SearchResult[]` | Search across all books |
| `reader_list_highlights` | `{ book_id }` | `Highlight[]` | List highlights |
| `reader_create_highlight` | `HighlightInput` | `Highlight` | Create highlight |
| `reader_update_highlight` | `{ id, ...updates }` | `Highlight` | Update highlight |
| `reader_delete_highlight` | `{ id: string }` | `void` | Delete highlight |
| `reader_list_bookmarks` | `{ book_id }` | `Bookmark[]` | List bookmarks |
| `reader_create_bookmark` | `BookmarkInput` | `Bookmark` | Create bookmark |
| `reader_delete_bookmark` | `{ id: string }` | `void` | Delete bookmark |
| `reader_session_start` | `{ book_id }` | `ReadingSession` | Start reading session |
| `reader_session_end` | `{ session_id }` | `void` | End reading session |
| `reader_list_sessions` | `{ book_id }` | `ReadingSession[]` | List reading sessions |
| `reader_export_highlights` | `{ book_id, format }` | `string` | Export highlights |
| `reader_get_settings` | `{}` | `ReaderSettings` | Get reader settings |
| `reader_update_settings` | `ReaderSettings` | `void` | Update reader settings |

---

## Wiki

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `wiki_list_pages` | `{}` | `WikiPage[]` | List wiki pages |
| `wiki_get_page` | `{ id: string }` | `WikiPage` | Get wiki page |
| `wiki_create_page` | `WikiPageInput` | `WikiPage` | Create wiki page |
| `wiki_update_page` | `{ id, ...updates }` | `WikiPage` | Update wiki page |
| `wiki_delete_page` | `{ id: string }` | `void` | Delete wiki page |
| `wiki_get_relations` | `{ page_id? }` | `WikiRelation[]` | Get graph relations |
| `wiki_create_relation` | `RelationInput` | `WikiRelation` | Create relation |
| `wiki_delete_relation` | `{ id: string }` | `void` | Delete relation |
| `wiki_generate_page` | `{ topic, sources? }` | `WikiPage` | AI-generate wiki page |
| `wiki_search` | `{ query }` | `WikiPage[]` | Search wiki pages |

---

## TTS (Text-to-Speech)

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `tts_settings_get` | `{}` | `TtsSettings` | Get TTS settings |
| `tts_settings_update` | `TtsSettings` | `void` | Update TTS settings |
| `tts_list_voices` | `{ provider? }` | `Voice[]` | List available voices |
| `tts_voice_preview` | `{ voice_id }` | `AudioData` | Preview voice |
| `tts_clone_voice` | `{ name, samples }` | `Voice` | Clone voice from samples |
| `tts_delete_voice` | `{ voice_id }` | `void` | Delete cloned voice |
| `tts_capabilities` | `{}` | `TtsCapabilities` | Get TTS capabilities |
| `tts_synthesize` | `SynthesizeRequest` | `AudioData` | Synthesize speech |
| `tts_synthesize_stream` | `SynthesizeRequest` | `StreamId` | Stream synthesis |
| `tts_cancel` | `{ stream_id }` | `void` | Cancel synthesis |
| `tts_test` | `{}` | `void` | Test TTS with sample text |
| `pet_speak` | `{ text }` | `void` | Make pet speak text |
| `pet_generate_line` | `{ context? }` | `string` | Generate pet dialogue |

### TTS Providers

| Provider | Key Features |
|----------|-------------|
| `system` | OS-native, no API key |
| `openai` | OpenAI-compatible TTS API |
| `elevenlabs` | Premium quality, voice cloning |
| `volcano` | ByteDance Volcano Engine |
| `mimo` | Fast, lightweight |
| `custom` | User-configured endpoint |

---

## MCP Servers

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_mcp_servers` | `{}` | `McpServer[]` | List configured servers |
| `get_mcp_server` | `{ id: string } | `McpServer` | Get server details |
| `create_mcp_server` | `McpServerInput` | `McpServer` | Create server config |
| `update_mcp_server` | `{ id, ...updates }` | `McpServer` | Update server config |
| `delete_mcp_server` | `{ id: string }` | `void` | Delete server config |
| `toggle_mcp_server` | `{ id, enabled }` | `void` | Enable/disable server |
| `mcp_check_env` | `{ id: string }` | `EnvCheckResult` | Check environment |
| `mcp_list_tools` | `{ id: string }` | `Tool[]` | List server tools |
| `mcp_call_tool` | `{ id, tool, args }` | `ToolResult` | Call tool on server |
| `mcp_stop_server` | `{ id: string }` | `void` | Stop server process |

---

## Remote Control

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `get_remote_control_config` | `{}` | `RemoteConfig` | Get remote control config |
| `set_remote_control_config` | `RemoteConfig` | `void` | Set remote control config |
| `get_remote_control_runtime_status` | `{}` | `RuntimeStatus` | Get runtime status |
| `list_remote_channels` | `{}` | `Channel[]` | List available channels |
| `list_remote_channel_capabilities` | `{ channel }` | `Capability[]` | List channel capabilities |
| `list_remote_pairings` | `{}` | `Pairing[]` | List device pairings |
| `approve_remote_pairing` | `{ id: string }` | `void` | Approve pairing request |
| `reject_remote_pairing` | `{ id: string }` | `void` | Reject pairing request |
| `revoke_remote_pairing` | `{ id: string }` | `void` | Revoke approved pairing |
| `list_remote_sessions` | `{}` | `RemoteSession[]` | List remote sessions |
| `terminate_remote_session` | `{ id: string }` | `void` | Terminate session |
| `test_remote_channel` | `{ channel }` | `TestResult` | Test channel connectivity |
| `list_remote_event_logs` | `{ limit? }` | `EventLog[]` | List event logs |
| `feishu_begin_app_registration` | `{}` | `RegistrationFlow` | Start Feishu app registration |
| `feishu_poll_app_registration` | `{ flow_id }` | `RegistrationResult` | Poll registration status |

### Supported Channels

| Channel | SDK |
|---------|-----|
| `feishu` | `@larksuiteoapi/node-sdk` |
| `telegram` | `grammy` |
| `slack` | `@slack/bolt` + `@slack/web-api` |
| `discord` | `discord.js` |
| `qq` | QQ Bot API |
| `wechat` | Experimental |
| `webhook` | Generic HTTP |

---

## Cloud Node

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `cloud_node_get_status` | `{}` | `CloudNodeStatus` | Get cloud node status |
| `cloud_node_set_config` | `CloudNodeConfig` | `void` | Set cloud node config |
| `cloud_node_bind` | `{ token: string }` | `void` | Bind to cloud relay |
| `cloud_node_unbind` | `{}` | `void` | Unbind from cloud relay |

---

## Cards & Artifacts

### Share Cards

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `list_cards` | `{}` | `Card[]` | List share cards |
| `get_card` | `{ id: string }` | `Card` | Get card details |
| `delete_card` | `{ id: string }` | `void` | Delete card |
| `get_card_image_path` | `{ id: string }` | `string` | Get card image path |

### Artifacts

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `artifact_save` | `ArtifactInput` | `Artifact` | Save artifact |
| `artifact_list` | `ListOptions` | `Artifact[]` | List artifacts |
| `artifact_get` | `{ id: string }` | `Artifact` | Get artifact |
| `artifact_delete` | `{ id: string }` | `void` | Delete artifact |
| `artifact_cleanup` | `{}` | `CleanupResult` | Cleanup old artifacts |
| `artifact_update_settings` | `ArtifactSettings` | `void` | Update artifact settings |
| `artifact_get_settings` | `{}` | `ArtifactSettings` | Get artifact settings |

---

## Storage & Backup

### Storage

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `storage_get_settings` | `{}` | `StorageSettings` | Get storage settings |
| `storage_update_settings` | `StorageSettings` | `void` | Update storage settings |
| `storage_pick_directory` | `{}` | `string` | Open directory picker |
| `storage_reveal_vault_root` | `{}` | `void` | Reveal vault in file manager |

### WebDAV Backup

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `test_webdav_connection` | `WebDavConfig` | `TestResult` | Test WebDAV connection |
| `backup_to_webdav` | `{}` | `BackupResult` | Backup to WebDAV |
| `restore_from_webdav` | `{ backup_id }` | `RestoreResult` | Restore from WebDAV |
| `list_webdav_backups` | `{}` | `Backup[]` | List available backups |
| `delete_webdav_backup` | `{ backup_id }` | `void` | Delete backup |

---

## Terminal

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `terminal_create` | `TerminalConfig` | `TerminalSession` | Create PTY session |
| `terminal_write` | `{ session_id, data }` | `void` | Write to PTY |
| `terminal_resize` | `{ session_id, cols, rows }` | `void` | Resize PTY |
| `terminal_kill` | `{ session_id }` | `void` | Kill PTY session |
| `terminal_list` | `{}` | `TerminalSession[]` | List active sessions |

---

## Desktop Pet

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `pet_window_get_state` | `{}` | `PetState` | Get pet window state |
| `pet_window_set_global_shortcut_enabled` | `{ enabled }` | `void` | Toggle global hotkey |
| `pet_speak` | `{ text: string }` | `void` | Pet speaks text |
| `pet_generate_line` | `{ context? }` | `string` | Generate pet dialogue |

---

## Image Generation

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `get_image_gen_config` | `{}` | `ImageGenConfig` | Get image gen config |
| `set_image_gen_config` | `ImageGenConfig` | `void` | Set image gen config |
| `generate_image_for_text` | `GenerateRequest` | `ImageResult` | Generate image |

---

## Slash Commands

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `slash_commands_scan` | `{}` | `Command[]` | Scan available commands |
| `slash_commands_git_diff` | `{ cwd? }` | `string` | Get git diff |
| `slash_commands_write_init` | `{ cwd, content }` | `void` | Write CLAUDE.md |
| `slash_commands_pick_directory` | `{}` | `string` | Open directory picker |
| `slash_commands_save_dialog` | `{ defaultName }` | `string` | Open save dialog |
| `slash_commands_export_session_md` | `{ session_id }` | `string` | Export session as markdown |

---

## Preview Server

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `preview_server_start` | `{ cwd, framework? }` | `ServerInfo` | Start dev server |
| `preview_server_stop` | `{}` | `void` | Stop dev server |
| `preview_server_status` | `{}` | `ServerStatus` | Get server status |
| `preview_server_open_window` | `{ url }` | `void` | Open preview window |
| `preview_server_close_window` | `{}` | `void` | Close preview window |

---

## Events (Main → Renderer)

These events are pushed from the main process to the renderer via `webContents.send()`.

### Agent Events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:stream` | `{ chunk: string }` | Streaming text chunk |
| `agent:tool_use` | `{ tool, input }` | Tool use notification |
| `agent:tool_result` | `{ tool, output }` | Tool result |
| `agent:permission` | `{ tool, input, requestId }` | Permission request |
| `agent:complete` | `{ result }` | Agent run complete |
| `agent:error` | `{ error: string }` | Agent error |
| `agent:status` | `{ status: string }` | Status change |

### LLM Events

| Event | Payload | Description |
|-------|---------|-------------|
| `llm:stream` | `{ streamId, chunk }` | LLM streaming chunk |
| `llm:stream_end` | `{ streamId }` | Stream ended |
| `llm:stream_error` | `{ streamId, error }` | Stream error |

### TTS Events

| Event | Payload | Description |
|-------|---------|-------------|
| `tts:audio_chunk` | `{ streamId, data }` | TTS audio chunk |
| `tts:audio_end` | `{ streamId }` | TTS synthesis complete |
| `tts:audio_error` | `{ streamId, error }` | TTS error |

### Terminal Events

| Event | Payload | Description |
|-------|---------|-------------|
| `terminal:data` | `{ session_id, data }` | Terminal output |
| `terminal:exit` | `{ session_id, code }` | Terminal process exit |

### Remote Control Events

| Event | Payload | Description |
|-------|---------|-------------|
| `remote:message` | `{ channel, message }` | Incoming remote message |
| `remote:pairing_request` | `{ id, channel }` | New pairing request |
| `remote:session_update` | `{ session }` | Session state change |

### System Events

| Event | Payload | Description |
|-------|---------|-------------|
| `system:update_available` | `{ version }` | App update available |
| `system:sync_complete` | `{ result }` | Sync completed |
| `system:sync_error` | `{ error }` | Sync error |
