# OmniContext

[![GitHub Repository](https://img.shields.io/badge/GitHub-barekit%2Fomnicontext-blue?logo=github)](https://github.com/barekit/omnicontext)
[![npm version](https://img.shields.io/npm/v/@barekit/omnicontext.svg?style=flat)](https://www.npmjs.com/package/@barekit/omnicontext)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The open-source project memory layer for AI coding agents.**

OmniContext eliminates "context drift" when switching between AI coding assistants. It provides a standardized, local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that tracks your project's active task, blockers, and rules — so every AI tool picks up exactly where the last one left off.

---

## The Problem

You're working with Cursor on a database migration. It hits an error. You switch to Claude Code in your terminal — but Claude has no idea what you were doing or what went wrong. You waste 5 minutes re-explaining context.

**OmniContext fixes this.** Your task, blockers, and project rules persist locally in a `.omnicode/` directory and are served to any MCP-compatible agent automatically.

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cursor     │     │ Claude Code │     │  Antigravity│
│   (IDE)      │     │ (Terminal)  │     │    (IDE)    │
└──────┬───────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       └────────────┬───────┘────────────────────┘
                    │
            ┌───────▼────────┐
            │  OmniContext   │
            │  MCP Server    │
            │  (local stdio) │
            └───────┬────────┘
                    │
            ┌───────▼────────┐
            │  .omnicode/    │
            │  ├─ task.json  │
            │  ├─ rules.md   │
            │  ├─ log.jsonl  │
            │  ├─ history.jsonl│
            │  ├─ summary.md │
            │  ├─ map.json   │
            │  ├─ sessions/  │
            │  └─ branches/  │
            └────────────────┘
```

## Quick Start

### 1. Initialize + Auto-Configure (one command)

```bash
npx @barekit/omnicontext init --setup-mcp
```

This creates the `.omnicode/` directory, scaffolds agent rules files (`.cursorrules`, `.clinerules`, `CLAUDE.md`, `.windsurfrules`, `.agents/AGENTS.md`), **and** auto-configures MCP in any detected agents.

**That's it.** No global install, no manual JSON editing. Your AI agents now have persistent project memory.

### Alternative: Step-by-Step

```bash
# Initialize .omnicode/ directory
npx @barekit/omnicontext init

# Auto-configure all detected agents
npx @barekit/omnicontext setup

# Or configure a specific agent
npx @barekit/omnicontext setup cursor
```

### If you prefer a global install

```bash
npm install -g @barekit/omnicontext
omni init --setup-mcp
```

## How Agents Use OmniContext (Autonomous)

After setup, **agents manage everything automatically**. You never need to set tasks or log blockers yourself:

```
┌────────────────────────────────────────────────────────────┐
│                  Agent Session Lifecycle                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. Agent registers session & checks multi-chat locks      │
│  2. Agent calls get_context (task, rules, log, map)       │
│                                                            │
│  3. If no task → Agent calls set_task("User's request")    │
│  4. Agent works... logs blockers, progress, decisions      │
│  5. On error → Agent calls update_blocker()                │
│  6. On fix → Agent calls clear_blockers()                  │
│                                                            │
│  7. On completion → set_task_status("completed")           │
│  8. Agent calls write_summary() for next agent             │
│                                                            │
│  ✅ Task auto-archived to history.jsonl                    │
│  ✅ Next agent reads summary + map and continues seamlessly│
└────────────────────────────────────────────────────────────┘
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `omni init` | Initialize `.omnicode/` in the current project |
| `omni init --setup-mcp` | Initialize + auto-configure agents |
| `omni init --force` | Re-initialize (overwrites existing state) |
| `omni setup [agent]` | Auto-configure MCP in Cursor, Claude, Windsurf, etc. |
| `omni task set <title>` | Set the active task |
| `omni task get` | Print the current active task |
| `omni task clear` | Remove the active task |
| `omni task blocker <msg>` | Add a blocker to the active task |
| `omni log [message]` | View or append to the activity log |
| `omni log -n 50` | Show last 50 log entries |
| `omni history` | View completed task history |
| `omni history -n 25` | Show last 25 tasks |
| `omni rules` | Print global project rules |
| `omni rules append <rule>` | Add a new rule |
| `omni rules edit` | Open rules.md in `$EDITOR` |
| `omni clean` | Run storage maintenance, compact logs, prune orphaned branches |
| `omni clean --dry-run` | Inspect disk usage and health report |
| `omni map` | Generate and display codebase tree map & symbol index |
| `omni config` | View current project configuration (`.omnicode/config.json`) |
| `omni config set <key> <val>` | Set a config property (e.g. `omni config set autoSummary false`) |
| `omni config reset` | Reset configuration to defaults |
| `omni status` | Dashboard summary of current state |
| `omni mcp start` | Start the MCP server |
| `omni mcp start --watch` | Start with git branch watching |

## MCP Resources & Tools

### Resources (read by agents)

| URI | Description |
|-----|-------------|
| `context://boot` | Complete compact boot context (for auto-attachment) |
| `context://sessions` | Active multi-chat agent session locks |
| `context://instructions` | Behavioral contract — how agents should use OmniContext |
| `context://active-task` | Current task.json content |
| `context://rules` | Project rules (rules.md) |
| `context://log` | Recent activity log entries |
| `context://history` | Completed task history |
| `context://summary` | Handoff summary from last agent session |
| `context://status` | Structured status summary |

### Tools (called by agents)

| Tool | Description |
|------|-------------|
| `get_context` | ⚡ One-call boot: task, rules, activity, map, and handoff (~200 tokens) |
| `register_session` | Register session & detect multi-chat collisions on branch |
| `end_session` | Unregister active agent session lock |
| `get_codebase_map` | Get structured codebase tree map & symbol exports |
| `set_task` | Create or replace the active task (auto-archives old task) |
| `update_blocker` | Log an error or blocker (auto-creates task if needed) |
| `set_task_status` | Mark task as `active`, `completed`, or `blocked` |
| `update_state` | Update task title and/or status |
| `update_rules` | Append a rule to rules.md |
| `add_log_entry` | Write to the activity log |
| `clear_blockers` | Remove all blockers from the active task |
| `get_task` | Read the current active task |
| `get_history` | Read completed task history |
| `write_summary` | Write a handoff summary for the next agent |

## Multi-Chat Session Coordination

When running multiple AI chat threads in the same project:
* OmniContext registers process session locks under `.omnicode/sessions/`.
* `get_context` automatically warns if another agent chat is currently working on the same branch.
* Expired sessions (>30 min inactive) are automatically cleaned up in the background.

## The `.omnicode/` Standard

```
.omnicode/
├── task.json          # Active task, status, and blockers
├── rules.md           # Global rules for AI agents
├── log.jsonl          # Append-only activity log (auto-compacted at 200 entries)
├── log.archive.jsonl  # Archived log entries
├── history.jsonl      # Completed/replaced task history
├── history.archive.jsonl # Archived task history
├── summary.md         # Handoff summary from last agent session
├── map.json           # Cached codebase file map & symbol index
├── sessions/          # Active multi-chat agent session locks
└── branches/          # Per-branch context snapshots
    ├── main/
    │   └── task.json
    └── feature__auth/
        └── task.json
```

## Supported Agents

| Agent | Auto-Setup | Status |
|-------|-----------|--------|
| Cursor | ✅ `omni setup cursor` | Supported |
| Claude Desktop | ✅ `omni setup claude-desktop` | Supported |
| Windsurf | ✅ `omni setup windsurf` | Supported |
| Antigravity | ✅ `omni setup antigravity` | Supported |
| Cline (VS Code) | ✅ `omni setup cline` | Supported |
| Roo Code (VS Code) | ✅ `omni setup roo-code` | Supported |
| Claude Code (terminal) | ✅ `omni setup claude-code` | Supported |
| VS Code (Native MCP) | ✅ `omni setup vscode` | Supported |
| Aider | Manual config | Supported |

## Project Structure

```
omnicontext/
├── packages/core/     # Shared schemas, I/O, codebase map, session registry, git watcher
└── apps/cli/          # CLI + MCP server
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
