/**
 * MCP Resource handlers for OmniContext.
 *
 * Exposes project context data as MCP resources that AI agents can read:
 *   - context://instructions  → Behavioral contract for autonomous operation
 *   - context://active-task   → Current task.json content
 *   - context://rules         → Current rules.md content
 *   - context://log           → Recent activity log entries
 *   - context://history       → Completed task history
 *   - context://summary       → Handoff summary from the last agent session
 *   - context://status        → Structured status summary
 */

import {
  loadContext,
  loadRules,
  readLogEntries,
  getCurrentBranch,
  readHistory,
  loadSummary,
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
        'IMPORTANT: Read this first. System prompt that explains how to autonomously ' +
        'manage project context using OmniContext tools. Contains your behavioral contract.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://active-task',
      name: 'Active Task',
      description: 'Current task.json content including active task, status, and blockers',
      mimeType: 'application/json',
    },
    {
      uri: 'context://rules',
      name: 'Global Rules',
      description: 'Project-specific rules and instructions for AI agents (rules.md)',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://log',
      name: 'Activity Log',
      description: 'Recent activity log entries from CLI and agent interactions',
      mimeType: 'application/json',
    },
    {
      uri: 'context://history',
      name: 'Task History',
      description: 'Completed and replaced tasks — see what has been worked on before',
      mimeType: 'application/json',
    },
    {
      uri: 'context://summary',
      name: 'Handoff Summary',
      description: 'The last agent session summary — what was done, what is pending',
      mimeType: 'text/markdown',
    },
    {
      uri: 'context://status',
      name: 'Project Status',
      description: 'Structured summary: branch, task, blockers, history count, and metadata',
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

## Autonomous Workflow (follow these steps automatically)

### On Session Start
1. **Read \`context://summary\`** to see what the last agent accomplished and what is pending.
2. **Read \`context://active-task\`** to understand the current objective and any blockers.
3. **Read \`context://rules\`** to understand project-specific constraints.
4. **Read \`context://log\`** to review recent activity and decisions.
5. If there is **no active task**, use **\`set_task\`** to create one based on the user's request.
6. If there **is** an active task, continue working on it unless the user gives a new directive.

### While Working
- **\`set_task\`**: Call this to create or replace the active task whenever the user gives you a new goal. The old task is automatically archived.
- **\`update_blocker\`**: Call this immediately when you encounter an error, failed test, or unexpected behavior.
- **\`clear_blockers\`**: Call this after you resolve all blocking issues.
- **\`add_log_entry\`**: Call this to record important decisions, architecture changes, or progress notes.
- **\`update_rules\`**: Call this when you discover a project convention or constraint that future agents should know.
- **\`update_state\`**: Call this to refine the task title as your understanding evolves.

### On Session End
- Call **\`set_task_status\`** with \`"completed"\` if you finished (auto-archives the task).
- Call **\`set_task_status\`** with \`"blocked"\` if you are stuck, and ensure blockers are logged.
- Call **\`write_summary\`** with a brief handoff summary: what you did, what is pending, key decisions.
- Call **\`add_log_entry\`** with a one-line summary of your session.

## Key Principles
- **Never ask the user to manage tasks.** You create, update, and complete tasks autonomously.
- **Always log blockers.** The next agent needs to know what went wrong.
- **Always write a handoff summary.** This is the single most important thing for continuity.
- **Check history.** Use \`get_history\` to avoid re-doing work that a previous agent already completed.
- **Read rules first.** The rules file contains project-specific constraints you must follow.
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
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(context, null, 2),
      };
    }

    case 'context://rules': {
      const rules = loadRules(omniDir);
      return {
        uri,
        mimeType: 'text/markdown',
        text: rules,
      };
    }

    case 'context://log': {
      const entries = readLogEntries(omniDir, 50);
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(entries, null, 2),
      };
    }

    case 'context://history': {
      const history = readHistory(omniDir, 20);
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(history, null, 2),
      };
    }

    case 'context://summary': {
      const summary = loadSummary(omniDir);
      return {
        uri,
        mimeType: 'text/markdown',
        text: summary ?? '# No handoff summary yet\n\nThis is the first session. No previous agent has left a summary.',
      };
    }

    case 'context://status': {
      const context = loadContext(omniDir);
      const branch = getCurrentBranch(projectRoot);
      const recentLog = readLogEntries(omniDir, 5);
      const history = readHistory(omniDir);

      const status = {
        branch: branch ?? 'detached',
        version: context.version,
        hasActiveTask: !!context.activeTask,
        activeTask: context.activeTask
          ? {
              title: context.activeTask.title,
              status: context.activeTask.status,
              blockerCount: context.activeTask.blockers.length,
              updatedAt: context.activeTask.updatedAt,
            }
          : null,
        completedTaskCount: history.length,
        recentActivity: recentLog,
      };

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(status, null, 2),
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
