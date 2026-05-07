/**
 * MCP Resource handlers for OmniContext.
 *
 * Exposes project context data as MCP resources that AI agents can read.
 * Most agents should use the `get_context` tool instead of reading resources
 * individually — it's faster and uses far fewer tokens.
 *
 * Resources:
 *   - context://instructions   → Behavioral contract for autonomous operation
 *   - context://active-task    → Current task.json content
 *   - context://rules          → Current rules.md content
 *   - context://log            → Recent activity log entries
 *   - context://history        → Completed task history
 *   - context://summary        → Handoff summary from the last agent session
 *   - context://architecture   → Auto-detected project structure
 *   - context://status         → Structured status summary
 */

import {
  loadContext,
  loadRules,
  readLogEntries,
  getCurrentBranch,
  readHistory,
  loadSummary,
  detectArchitecture,
  formatArchitectureCompact,
} from '@omnicontext/core';

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** All resources exposed by the OmniContext MCP server. */
export function listResources(): ResourceDefinition[] {
  return [
    {
      uri: 'context://instructions',
      name: 'Agent Instructions',
      description:
        'IMPORTANT: Read this first. Behavioral contract for autonomous context management.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://active-task',
      name: 'Active Task',
      description: 'Current task, status, and blockers (JSON)',
      mimeType: 'application/json',
    },
    {
      uri: 'context://rules',
      name: 'Global Rules',
      description: 'Project-specific rules for AI agents (rules.md)',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://log',
      name: 'Activity Log',
      description: 'Recent activity log entries',
      mimeType: 'application/json',
    },
    {
      uri: 'context://history',
      name: 'Task History',
      description: 'Completed and replaced tasks',
      mimeType: 'application/json',
    },
    {
      uri: 'context://summary',
      name: 'Handoff Summary',
      description: 'Last agent session summary — what was done, what is pending',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://architecture',
      name: 'Project Architecture',
      description: 'Auto-detected project structure: language, framework, dependencies, conventions',
      mimeType: 'text/plain',
    },
    {
      uri: 'context://status',
      name: 'Project Status',
      description: 'Structured summary: branch, task, blockers, history count',
      mimeType: 'application/json',
    },
  ];
}

// ---------------------------------------------------------------------------
// Agent instructions — the behavioral contract for autonomous operation
// ---------------------------------------------------------------------------

const AGENT_INSTRUCTIONS = `# OmniContext — Agent Instructions

You are connected to an OmniContext MCP server that provides persistent project memory.
This allows you to pick up exactly where the previous agent (or session) left off.
**You must manage all context autonomously — never ask the user to set tasks or log blockers.**

## Token-Efficient Workflow

### On Session Start (ONE call)
1. Call **\`get_context\`** — this returns everything you need in ~200 tokens:
   task, rules, recent activity, project architecture, and last handoff summary.
   **Do NOT read resources individually** unless you need more detail.

2. If there is **no active task**, use **\`set_task\`** based on the user's request.
3. If there **is** an active task, continue working on it unless the user gives a new directive.

### While Working
- **\`set_task\`**: Replace the active task when the user gives a new goal.
- **\`update_blocker\`**: Log errors, test failures, or unexpected behavior immediately.
- **\`clear_blockers\`**: Clear after resolving all issues.
- **\`add_log_entry\`**: Record important decisions or progress notes.
- **\`update_rules\`**: Record project conventions for future agents.

### On Session End
- **\`set_task_status("completed")\`** if finished (auto-archives).
- **\`set_task_status("blocked")\`** if stuck (ensure blockers are logged).
- **\`write_summary\`** with what you did, what is pending, key decisions.

## Key Principles
- **One call to boot.** Use \`get_context\` instead of reading 4+ resources.
- **Never ask the user to manage tasks.** You handle everything.
- **Always write a handoff summary.** This is critical for continuity.
- **Use \`get_history\` before starting** to avoid re-doing completed work.
`;

/** Read a specific resource by URI. */
export function readResource(
  uri: string,
  omniDir: string,
  projectRoot: string,
): { uri: string; mimeType: string; text: string } {

  switch (uri) {
    case 'context://instructions': {
      return {
        uri,
        mimeType: 'text/markdown',
        text: AGENT_INSTRUCTIONS,
      };
    }

    case 'context://active-task': {
      const context = loadContext(omniDir);
      // Compact JSON — no pretty-printing
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(context),
      };
    }

    case 'context://rules': {
      const rules = loadRules(omniDir);
      return { uri, mimeType: 'text/markdown', text: rules };
    }

    case 'context://log': {
      // Only last 20 entries, compact JSON
      const entries = readLogEntries(omniDir, 20);
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(entries),
      };
    }

    case 'context://history': {
      // Only last 10, compact JSON
      const history = readHistory(omniDir, 10);
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(history),
      };
    }

    case 'context://summary': {
      const summary = loadSummary(omniDir);
      return {
        uri,
        mimeType: 'text/markdown',
        text: summary ?? 'No handoff summary yet. This is the first session.',
      };
    }

    case 'context://architecture': {
      const arch = detectArchitecture(projectRoot);
      const compact = formatArchitectureCompact(arch);
      return {
        uri,
        mimeType: 'text/plain',
        text: compact,
      };
    }

    case 'context://status': {
      const context = loadContext(omniDir);
      const branch = getCurrentBranch(projectRoot);
      const history = readHistory(omniDir);

      // Ultra-compact status — one line
      const task = context.activeTask;
      const status = task
        ? `${task.title} [${task.status}] ${task.blockers.length} blockers`
        : 'No active task';

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          branch: branch ?? 'detached',
          task: status,
          completedTasks: history.length,
        }),
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
