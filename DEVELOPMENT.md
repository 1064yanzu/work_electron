# IPO Workbench Development Guide

A comprehensive guide for developers contributing to IPO Workbench.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Architecture](#project-architecture)
- [Adding IPC Commands](#adding-ipc-commands)
- [Adding UI Components](#adding-ui-components)
- [Working with Stores](#working-with-stores)
- [Working with the Database](#working-with-the-database)
- [Working with the AI Agent](#working-with-the-ai-agent)
- [Styling Guide](#styling-guide)
- [Code Quality](#code-quality)
- [Build & Release](#build--release)
- [Common Pitfalls](#common-pitfalls)

---

## Prerequisites

- **Node.js** >= 18 (LTS recommended)
- **npm** >= 9
- **Git**
- **Xcode Command Line Tools** (macOS): `xcode-select --install`
- **Python 3** (for node-pty native compilation)

### Optional

- **Ollama** — For local LLM inference
- **WebDAV server** — For backup/sync testing

---

## Getting Started

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/ipo-workbench.git
cd ipo-workbench

# 2. Install dependencies
npm install
# This triggers postinstall which:
# - Rebuilds node-pty native module
# - Copies PDF.js worker assets

# 3. Start development
npm run dev
```

The dev server starts Vite with Electron HMR. Changes to renderer code hot-reload instantly; changes to main process code restart Electron automatically.

---

## Development Workflow

### Day-to-Day Commands

```bash
npm run dev              # Start dev server (Vite + Electron HMR)
npm run typecheck        # TypeScript type checking (no emit)
npm run lint             # Biome check (formatter only, linter disabled)
npm run format           # Biome format (auto-fix)
```

### Before Committing

Always run typecheck and format:

```bash
npm run typecheck && npm run format
```

### Build Testing

```bash
# Full build (typecheck + vite + electron-builder)
npm run build

# Platform-specific
npm run build:mac        # macOS only
npm run build:win        # Windows only
npm run build:all        # Both platforms
```

---

## Project Architecture

### Directory Layout

```
├── electron/                     # Main process (Node.js)
│   ├── main/
│   │   ├── index.ts              # Entry point
│   │   ├── app-lifecycle.ts      # Startup orchestration
│   │   ├── db/                   # Database (libSQL + Drizzle)
│   │   ├── ipc/                  # IPC command handlers
│   │   │   ├── register.ts       # Central registration
│   │   │   └── handlers/         # 49 domain handler files
│   │   ├── llm/                  # LLM invocation layer
│   │   ├── http/                 # HTTP servers
│   │   ├── services/             # Background services
│   │   └── ...
│   ├── preload/                  # contextBridge
│   └── shared/
│       └── ipc-schema.ts         # IPC type contract
├── src/                          # Renderer process (React)
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Three-panel shell
│   ├── components/               # UI components
│   ├── lib/                      # Stores, utilities, API
│   └── pet/                      # Desktop pet sub-app
├── docs/                         # Documentation
└── scripts/                      # Build scripts
```

### Key Conventions

1. **IPC is the bridge**: All communication between renderer and main goes through IPC commands defined in `ipc-schema.ts`.
2. **Handlers are factories**: Each handler file exports a factory function `createXxxHandlers(db)` that returns an object of handler functions.
3. **Stores are global**: Each store is a singleton module with `getState`, `setState`, and `subscribe`.
4. **Path alias**: `@/` maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`).
5. **Safe filesystem**: All file operations MUST use `*_safe` handlers with absolute paths.

---

## Adding IPC Commands

This is the most common extension pattern. Four files must be updated:

### Step 1: Define the Command

In `electron/shared/ipc-schema.ts`:

```typescript
export interface IpcSchema {
  // ... existing commands

  // Add your command
  my_new_command: {
    input: { name: string; options?: { verbose?: boolean } };
    output: { result: string; count: number };
  };
}
```

### Step 2: Implement the Handler

Create or update a handler file in `electron/main/ipc/handlers/`:

```typescript
// electron/main/ipc/handlers/myDomain.ts
import type { Database } from '../db/client';

export function createMyDomainHandlers(db: Database) {
  return {
    async myNewCommand(args: { name: string; options?: { verbose?: boolean } }) {
      // Implementation
      return { result: `Hello ${args.name}`, count: 42 };
    },
  };
}
```

### Step 3: Register in register.ts

In `electron/main/ipc/register.ts`:

```typescript
import { createMyDomainHandlers } from './handlers/myDomain';

// In the registration function:
const myDomainHandlers = createMyDomainHandlers(db);
ipcMain.handle('my_new_command', (_, args) => myDomainHandlers.myNewCommand(args));
```

### Step 4: Call from Renderer

```typescript
import { invoke } from '@/lib/tauriCompat';

const result = await invoke('my_new_command', {
  name: 'world',
  options: { verbose: true },
});
console.log(result.result, result.count);
```

### Optional: Add API Wrapper

In `src/lib/api.ts`:

```typescript
export async function myNewCommand(name: string, verbose?: boolean) {
  return invoke('my_new_command', { name, options: { verbose } });
}
```

---

## Adding UI Components

### Component Location

- **Shared UI**: `src/components/ui/` — Buttons, inputs, modals, toasts, etc.
- **Feature components**: `src/components/<feature>/` — Feature-specific components
- **Layout components**: `src/components/layout/` — Panel shells, resize handles

### Component Patterns

```tsx
// Functional component with typed props
interface MyComponentProps {
  title: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function MyComponent({ title, onSelect, className }: MyComponentProps) {
  // Use store hooks for global state
  const layout = useLayoutStore();

  // Use invoke for data fetching
  const [data, setData] = useState([]);
  useEffect(() => {
    invoke('list_items', {}).then(setData);
  }, []);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-sm font-medium text-t-primary">{title}</h3>
      {data.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="rounded-full px-3 py-1 text-xs bg-t-hover hover:bg-t-active"
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
```

### UI Component Library

Common base components in `src/components/ui/`:

- `Button` — Capsule-styled buttons with variants
- `Input` — Text inputs with warm styling
- `Modal` — Overlay modals with backdrop
- `Toast` — Notification toasts
- `ContextMenu` — Right-click context menus
- `Dropdown` — Dropdown menus
- `Tooltip` — Hover tooltips
- `ScrollArea` — Custom scroll containers
- `Select` — Select menus
- `Tabs` — Tab navigation
- `Switch` — Toggle switches
- `Badge` — Status badges

---

## Working with Stores

### Creating a New Store

```typescript
// src/lib/stores/myFeatureStore.ts
import { createStore, createUseStore, createUseStoreSelector } from './createStore';

interface MyFeatureState {
  items: string[];
  selectedId: string | null;
  isLoading: boolean;
}

const initialState: MyFeatureState = {
  items: [],
  selectedId: null,
  isLoading: false,
};

export const myFeatureStore = createStore(initialState);

// React hooks
export const useMyFeatureStore = createUseStore(myFeatureStore);
export const useMyFeatureSelector = createUseStoreSelector(myFeatureStore);

// Actions (exported as plain functions)
export function selectItem(id: string) {
  myFeatureStore.setState({ selectedId: id });
}

export async function loadItems() {
  myFeatureStore.setState({ isLoading: true });
  const items = await invoke('list_items', {});
  myFeatureStore.setState({ items, isLoading: false });
}
```

### Using Stores in Components

```tsx
// Full store subscription (re-renders on any change)
const state = useMyFeatureStore();

// Selector subscription (re-renders only when selected value changes)
const selectedId = useMyFeatureSelector((s) => s.selectedId);
```

### Registering in the Barrel Export

Add your store to `src/lib/stores/index.ts`:

```typescript
export { myFeatureStore, useMyFeatureStore, useMyFeatureSelector } from './myFeatureStore';
```

---

## Working with the Database

### Schema

Database schema is defined in `electron/main/db/migrations/initSql.ts` using raw SQL. To add a new table:

```typescript
// In initSql.ts, add to the migration array:
{
  name: '0020_add_my_table',
  sql: `
    CREATE TABLE IF NOT EXISTS my_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_my_table_name ON my_table(name);
  `,
}
```

### Using Drizzle ORM

```typescript
import { drizzle } from 'drizzle-orm/libsql';

// In your handler
const db = drizzle(client);

// Query
const items = await db.select().from(myTable).where(eq(myTable.name, 'test'));

// Insert
await db.insert(myTable).values({ id: generateId(), name: 'new item' });

// Update
await db.update(myTable).set({ name: 'updated' }).where(eq(myTable.id, id));

// Delete
await db.delete(myTable).where(eq(myTable.id, id));
```

---

## Working with the AI Agent

### Understanding the Agent SDK Flow

```
Renderer                    Main Process                  Claude Agent SDK
   │                            │                              │
   ├─ invoke('agent_sdk_start')─►                              │
   │                            ├─ Create Runner ──────────────►│
   │                            │                              │
   │                            ◄── events ────────────────────┤
   │                            ├─ Transform events            │
   │◄── 'agent:event' ──────────┤                              │
   │                            │                              │
   │  [Tool requires permission]│                              │
   │◄── 'agent:permission' ─────┤                              │
   │                            │                              │
   ├─ invoke('resolve')────────►├─ Resume ────────────────────►│
   │                            │                              │
   │◄── 'agent:complete' ───────┤◄── done ─────────────────────┤
```

### Adding a New Agent Tool

1. The tool must be available in the Claude Agent SDK's tool list
2. If it's a custom tool, implement it in the main process
3. Handle the tool call in the interaction broker
4. Return results through the SDK's tool result mechanism

---

## Styling Guide

### Tailwind CSS + B.AI Design System

IPO Workbench uses Tailwind CSS with a custom warm-tone design system.

#### CSS Variables (Design Tokens)

All design tokens are CSS custom properties prefixed with `--t-`:

```css
--t-bg-primary     /* Background: #FAF9F5 (warm cream) */
--t-text-primary    /* Text: #1A1A19 (near-black) */
--t-border          /* Border color */
--t-hover           /* Hover state background */
--t-active          /* Active/selected state background */
--t-accent-peach    /* Accent: peach */
--t-accent-mint     /* Accent: mint */
--t-accent-violet   /* Accent: violet */
```

#### Tailwind Classes

Use the custom `t-*` prefix for design token classes:

```tsx
<div className="bg-t-bg-primary text-t-text-primary border-t-border">
  <button className="bg-t-hover hover:bg-t-active rounded-full px-3 py-1">
    Click me
  </button>
</div>
```

#### Typography

```tsx
// Body text
<p className="font-sans text-sm text-t-text-primary">...</p>

// Code
<code className="font-mono text-xs bg-t-hover rounded px-1">...</code>

// Reading
<p className="font-serif text-base leading-relaxed">...</p>
```

#### Component Styling Patterns

```tsx
// Capsule buttons (primary pattern)
<button className="rounded-full bg-t-accent-peach px-4 py-1.5 text-sm font-medium text-white">
  Action
</button>

// Card
<div className="rounded-xl border border-t-border bg-t-bg-primary p-4 shadow-bai-card">
  Card content
</div>

// Popover
<div className="rounded-xl border border-t-border bg-t-bg-primary p-2 shadow-bai-pop">
  Popover content
</div>
```

#### Animations

Use the custom animations defined in `tailwind.config.js`:

```tsx
<div className="animate-fade-in">Fade in</div>
<div className="animate-scale-in">Scale in</div>
<div className="animate-slide-in-right">Slide from right</div>
<div className="animate-shimmer">Loading shimmer</div>
<div className="animate-thinking-dot">Thinking dots</div>
```

#### Dark Mode

Dark mode uses the `dark:` prefix with class-based toggling:

```tsx
<div className="bg-white dark:bg-gray-900">
  <p className="text-gray-900 dark:text-gray-100">Content</p>
</div>
```

---

## Code Quality

### Biome (Formatter)

Biome is configured in `biome.json`. Only the formatter is enabled (linter is disabled).

```bash
# Check formatting
npm run lint

# Auto-fix formatting
npm run format
```

### TypeScript

Strict TypeScript with `--noEmit` for type checking:

```bash
npm run typecheck
```

### Rules

1. **No `any`**: Use `unknown` and type guards instead.
2. **Prefer `const`**: Use `const` by default, `let` only when reassignment is needed.
3. **No unused imports**: Biome removes them automatically.
4. **Functional components**: Always use function components with typed props.
5. **No default exports**: Use named exports for better tree-shaking and refactoring.
6. **Path alias**: Always use `@/` prefix for imports from `src/`.

---

## Build & Release

### Electron Builder

Configured in `package.json` under `build`:

```json
{
  "build": {
    "appId": "com.ipo-workbench.app",
    "productName": "IPO Workbench",
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "build/icon.icns"
    },
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico"
    }
  }
}
```

### Build Process

```
npm run build
├── tsc                    # TypeScript compilation
├── vite build             # Bundle renderer
└── electron-builder       # Package Electron app
    ├── Bundle main process
    ├── Copy native modules
    ├── Create installer
    └── Output to release/
```

### CI/CD

GitHub Actions workflow for cross-platform builds:

- **macOS**: Build on `macos-latest`
- **Windows**: Build on `windows-latest`
- Artifacts uploaded to GitHub Releases

---

## Common Pitfalls

### 1. Forgetting `*_safe` Handlers

All filesystem operations MUST use `*_safe` handlers. Never use `fs.readFile` directly in IPC handlers.

```typescript
// WRONG
import { readFile } from 'fs/promises';
const content = await readFile(path, 'utf-8');

// CORRECT
const content = await invoke('read_file_safe', { path: absolutePath });
```

### 2. Not Using Absolute Paths

All `*_safe` handlers require absolute paths:

```typescript
// WRONG
await invoke('read_file_safe', { path: './config.json' });

// CORRECT
await invoke('read_file_safe', { path: '/Users/.../config.json' });
```

### 3. Not Updating `ipc-schema.ts`

Every new IPC command must be defined in `ipc-schema.ts`. The renderer-side `invoke` uses this type information.

### 4. Importing from Wrong Path

Always use the `@/` alias for renderer-side imports:

```typescript
// WRONG
import { invoke } from '../../../lib/tauriCompat';

// CORRECT
import { invoke } from '@/lib/tauriCompat';
```

### 5. Store Subscription Without Selector

Don't subscribe to the full store when you only need one value:

```typescript
// BAD (re-renders on any store change)
const state = useLayoutStore();

// GOOD (re-renders only when leftSidebarView changes)
const view = useLayoutStoreSelector((s) => s.leftSidebarView);
```

### 6. Direct Database Access in Handlers

Handlers receive `db` through factory injection, not global imports:

```typescript
// WRONG
import { getDb } from '../db/client';

// CORRECT
export function createMyHandlers(db: Database) {
  return { ... };
}
```

### 7. Not Updating Documentation

When adding or modifying IPC commands, update the relevant interface document:

- `docs/接口文档.md` — General backend API
- `docs/reader-api.md` — Reader commands
- `docs/TTS接口文档.md` — TTS commands
- `docs/webdav接口文档.md` — WebDAV commands

### 8. Breaking Existing Features

Every change must be backward-compatible. Test that existing features still work after your change. Use `npm run typecheck` to catch type regressions.
