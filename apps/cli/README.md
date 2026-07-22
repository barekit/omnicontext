# OmniContext

[![GitHub Repository](https://img.shields.io/badge/GitHub-barekit%2Fomnicontext-blue?logo=github)](https://github.com/barekit/omnicontext)
[![npm version](https://img.shields.io/npm/v/@barekit/omnicontext.svg?style=flat)](https://www.npmjs.com/package/@barekit/omnicontext)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The open-source project memory layer for AI coding agents.**

OmniContext eliminates "context drift" when switching between AI coding assistants. It provides a standardized, local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that tracks your project's active task, blockers, and rules — so every AI tool picks up exactly where the last one left off.

---

## Quick Start

### 1. Initialize + Auto-Configure (one command)

```bash
npx @barekit/omnicontext init --setup-mcp
```

This creates the `.omnicode/` directory, scaffolds agent rules files (`.cursorrules`, `.clinerules`, `CLAUDE.md`, `.windsurfrules`, `.agents/AGENTS.md`), **and** auto-configures MCP in any detected agents.

### Alternative: Step-by-Step

```bash
# Initialize .omnicode/ directory
npx @barekit/omnicontext init

# Auto-configure all detected agents
npx @barekit/omnicontext setup
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `omni init` | Initialize `.omnicode/` in current project |
| `omni init --setup-mcp` | Initialize + auto-configure agents |
| `omni setup [agent]` | Auto-configure MCP in Cursor, Claude, Windsurf, etc. |
| `omni task set <title>` | Set active task |
| `omni task get` | Print active task |
| `omni task clear` | Remove active task |
| `omni task blocker <msg>` | Add blocker |
| `omni log [message]` | View/append to log |
| `omni history` | View completed task history |
| `omni rules` | View project rules |
| `omni clean` | Storage maintenance, log compaction, branch pruning |
| `omni clean --dry-run` | Inspect disk usage and health report |
| `omni map` | Generate/display codebase tree map & symbol index |
| `omni config` | View/set project configuration (`config.json`) |
| `omni status` | Dashboard summary |
| `omni mcp start` | Start MCP server |
| `omni mcp start --watch` | Start with git branch watching |

## MCP Resources & Tools

### Resources

| URI | Description |
|-----|-------------|
| `context://boot` | Complete compact boot context |
| `context://sessions` | Active multi-chat agent session locks |
| `context://instructions` | Agent behavioral instructions |
| `context://active-task` | Current task.json content |
| `context://rules` | Project rules (rules.md) |
| `context://log` | Recent activity log |
| `context://history` | Completed task history |
| `context://summary` | Handoff summary |
| `context://status` | Structured status summary |

### Tools

| Tool | Description |
|------|-------------|
| `get_context` | ⚡ One-call boot: task, rules, activity, map, handoff (~200 tokens) |
| `register_session` | Register session & detect multi-chat collisions |
| `end_session` | Unregister active agent session lock |
| `get_codebase_map` | Get structured codebase map & symbol exports |
| `set_task` | Create or replace active task |
| `update_blocker` | Log error/blocker |
| `set_task_status` | Mark task active, completed, or blocked |
| `update_rules` | Add rule to rules.md |
| `add_log_entry` | Write to activity log |
| `clear_blockers` | Remove blockers |
| `write_summary` | Write handoff summary |

## License

[MIT](./LICENSE)
