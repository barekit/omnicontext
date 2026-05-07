# OmniContext

[![GitHub Repository](https://img.shields.io/badge/GitHub-barekit%2Fomnicontext-blue?logo=github)](https://github.com/barekit/omnicontext)
[![npm version](https://img.shields.io/npm/v/@omnicontext/cli.svg?style=flat)](https://www.npmjs.com/package/@omnicontext/cli)
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
│   Cursor     │     │ Claude Code │     │    Aider    │
│   (IDE)      │     │ (Terminal)  │     │  (Terminal) │
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
            │  └─ branches/  │
            └────────────────┘
```

## Quick Start

### 1. Initialize + Auto-Configure (one command)

```bash
npx @omnicontext/cli init --setup-mcp
```

This creates the `.omnicode/` directory **and** auto-configures MCP in any detected agents (Cursor, Claude Desktop, Windsurf).

**That's it.** No global install, no manual JSON editing. Your AI agents now have persistent project memory.

### Alternative: Step-by-Step

```bash
# Initialize .omnicode/ directory
npx @omnicontext/cli init

# Auto-configure all detected agents
npx @omnicontext/cli setup

# Or configure a specific agent
npx @omnicontext/cli setup cursor
```

### If you prefer a global install

```bash
npm install -g @omnicontext/cli
omni init --setup-mcp
```

## How Agents Use OmniContext (Autonomous)

After setup, **agents manage everything automatically**. You never need to set tasks or log blockers yourself:

```
┌────────────────────────────────────────────────────────────┐
│                  Agent Session Lifecycle                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. Agent reads context://summary (last session handoff)   │
│  2. Agent reads context://active-task (current goal)       │
│  3. Agent reads context://rules (project constraints)      │
│                                                            │
│  4. If no task → Agent calls set_task("User's request")    │
│  5. Agent works... logs blockers, progress, decisions      │
│  6. On error → Agent calls update_blocker()                │
│  7. On fix → Agent calls clear_blockers()                  │
│                                                            │
│  8. On completion → set_task_status("completed")           │
│  9. Agent calls write_summary() for next agent             │
│                                                            │
│  ✅ Task auto-archived to history.jsonl                    │
│  ✅ Next agent reads the summary and continues             │
└────────────────────────────────────────────────────────────┘
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `omni init` | Initialize `.omnicode/` in the current project |
| `omni init --setup-mcp` | Initialize + auto-configure agents |
| `omni init --force` | Re-initialize (overwrites existing state) |
| `omni setup [agent]` | Auto-configure MCP in Cursor, Claude Desktop, Windsurf |
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
| `omni status` | Dashboard summary of current state |
| `omni mcp start` | Start the MCP server |
| `omni mcp start --watch` | Start with git branch watching |

## MCP Resources & Tools

### Resources (read by agents)

| URI | Description |
|-----|-------------|
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

## Git-Aware Context Switching

When you start the MCP server with `--watch`, OmniContext monitors your `.git/HEAD` file. When you switch branches, it automatically:

1. Saves the current task/blockers under `.omnicode/branches/<old-branch>/`
2. Loads the saved context for the new branch (or creates a fresh one)

Each branch gets its own independent task and blocker state.

## The `.omnicode/` Standard

```
.omnicode/
├── task.json          # Active task, status, and blockers
├── rules.md           # Global rules for AI agents
├── log.jsonl          # Append-only activity log (auto-compacted at 200 entries)
├── log.archive.jsonl  # Archived log entries
├── history.jsonl      # Completed/replaced task history
├── summary.md         # Handoff summary from last agent session
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
| Claude Code (terminal) | Manual config | Supported |
| Aider | Manual config | Supported |

## Project Structure

```
omnicontext/
├── packages/core/     # Shared schemas, I/O, git watcher, MCP config
└── apps/cli/          # CLI + MCP server
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
