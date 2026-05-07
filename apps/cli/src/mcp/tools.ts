/**
 * MCP Tool handlers for OmniContext.
 *
 * These tools allow AI agents to **autonomously** manage project context.
 * The design principle is zero-friction: agents should be able to create,
 * update, and complete tasks without any manual user intervention after
 * the initial `omni init`.
 *
 * Tools:
 *   - set_task             Create or replace the active task (auto-archives old task)
 *   - update_blocker       Append a blocker (auto-creates task if needed)
 *   - set_task_status      Update task status (auto-archives on completion)
 *   - update_state         Generic task title/status update
 *   - update_rules         Append a rule to rules.md
 *   - add_log_entry        Write to the activity log
 *   - clear_blockers       Remove all blockers from the active task
 *   - get_task             Read the current active task
 *   - get_history          Read completed task history
 *   - write_summary        Write a handoff summary for the next agent
 */

import { randomUUID } from 'node:crypto';
import {
  type Blocker,
  type Task,
  type TaskStatus,
  loadContext,
  saveContext,
  loadRules,
  saveRules,
  appendLogEntry,
  getCurrentBranch,
  appendHistory,
  readHistory,
  saveSummary,
  loadSummary,
} from '@omnicontext/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a task exists in the context. If no active task is set,
 * auto-create one with a default title so agents can immediately
 * begin logging blockers and progress without user intervention.
 */
function ensureActiveTask(omniDir: string, fallbackTitle: string = 'Untitled task'): Task {
  const context = loadContext(omniDir);
  if (context.activeTask) {
    return context.activeTask;
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: randomUUID(),
    title: fallbackTitle,
    status: 'active',
    blockers: [],
    updatedAt: now,
  };

  context.activeTask = task;
  saveContext(omniDir, context);
  return task;
}

/**
 * Archive the current active task to history.jsonl.
 * Called when a task is completed, replaced, or cleared.
 */
function archiveCurrentTask(
  omniDir: string,
  reason: 'completed' | 'replaced' | 'cleared',
  projectRoot: string,
): void {
  const context = loadContext(omniDir);
  if (!context.activeTask) return;

  const branch = getCurrentBranch(projectRoot);
  appendHistory(omniDir, {
    task: context.activeTask,
    reason,
    archivedAt: new Date().toISOString(),
    branch: branch ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for MCP)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function listTools(): ToolDefinition[] {
  return [
    {
      name: 'set_task',
      description:
        'Create or replace the active task. You MUST call this at the start of every new ' +
        'coding session to define what you are working on. If a task already exists, it will ' +
        'be archived to history and replaced. This is the primary way to track what you are doing.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A short, clear description of the goal (e.g. "Add Zod validation to all API routes")',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'update_blocker',
      description:
        'Log an error or blocker against the active task. Call this whenever you encounter ' +
        'an error, test failure, or unexpected behavior. If no task exists, one will be ' +
        'auto-created. This builds a traceable history for the next agent.',
      inputSchema: {
        type: 'object',
        properties: {
          blocker: { type: 'string', description: 'Description of the blocker or error' },
          source: {
            type: 'string',
            description: 'Your agent identifier (e.g. "cursor", "claude-code")',
            default: 'agent',
          },
        },
        required: ['blocker'],
      },
    },
    {
      name: 'set_task_status',
      description:
        'Update the active task lifecycle status. Call this when: ' +
        '(1) you finish the task → "completed" (auto-archives to history), ' +
        '(2) you are stuck → "blocked", ' +
        '(3) you resume work → "active". ' +
        'If no task exists, one will be auto-created.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'completed', 'blocked'],
            description: 'New task status',
          },
        },
        required: ['status'],
      },
    },
    {
      name: 'update_state',
      description:
        'Modify the active task title and/or status in a single call. ' +
        'Use this to refine the task description as your understanding evolves. ' +
        'If no task exists, one will be auto-created.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'New task title (optional)' },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'blocked'],
            description: 'New task status (optional)',
          },
        },
      },
    },
    {
      name: 'update_rules',
      description:
        'Append a new rule or instruction to the project rules.md. Use this to record ' +
        'coding standards, architecture decisions, or constraints that future agents should follow.',
      inputSchema: {
        type: 'object',
        properties: {
          rule: { type: 'string', description: 'The rule to add' },
        },
        required: ['rule'],
      },
    },
    {
      name: 'add_log_entry',
      description:
        'Write an entry to the project activity log. Call this to record important ' +
        'decisions, architecture changes, progress milestones, or anything the next agent ' +
        'should know about. This is your primary communication channel with future agents.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Log message' },
        },
        required: ['message'],
      },
    },
    {
      name: 'clear_blockers',
      description:
        'Remove all blockers from the active task. Call this after you have resolved ' +
        'all blocking issues so the next agent sees a clean state.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_task',
      description:
        'Read the current active task, including title, status, and blockers. ' +
        'Call this at the start of a session to understand the current objective ' +
        'and any blockers left by the previous agent.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_history',
      description:
        'Read the history of completed and replaced tasks. Use this to understand ' +
        'what has been worked on before and avoid duplicating effort.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of history entries to return (default: 10)',
          },
        },
      },
    },
    {
      name: 'write_summary',
      description:
        'Write a handoff summary for the next agent. Call this when you finish a session ' +
        'to leave a clear, structured summary of what you accomplished, what is still pending, ' +
        'and any important context. This is the most important thing you can do for the next agent.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Markdown-formatted summary of your session: what you did, what is pending, and key context',
          },
        },
        required: ['summary'],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

export function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  omniDir: string,
  projectRoot: string,
): ToolResult {
  const text = (msg: string): ToolResult => ({
    content: [{ type: 'text', text: msg }],
  });

  const branch = getCurrentBranch(projectRoot);

  switch (toolName) {
    // ------------------------------------------------------------------
    // CREATE / REPLACE task (auto-archives the old one)
    // ------------------------------------------------------------------
    case 'set_task': {
      const title = String(args.title);
      const now = new Date().toISOString();

      // Archive the current task before replacing
      archiveCurrentTask(omniDir, 'replaced', projectRoot);

      const context = loadContext(omniDir);
      context.activeTask = {
        id: randomUUID(),
        title,
        status: 'active',
        blockers: [],
        updatedAt: now,
      };
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: now,
        source: 'mcp',
        message: `Task created: "${title}"`,
        branch: branch ?? undefined,
      });

      return text(`Task created: "${title}" (id: ${context.activeTask.id})`);
    }

    // ------------------------------------------------------------------
    case 'update_blocker': {
      ensureActiveTask(omniDir, 'Auto-created task (from blocker)');
      const context = loadContext(omniDir);

      const blocker: Blocker = {
        message: String(args.blocker),
        createdAt: new Date().toISOString(),
        source: String(args.source ?? 'agent'),
      };
      context.activeTask!.blockers.push(blocker);
      context.activeTask!.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: `Blocker added by ${blocker.source}: "${blocker.message}"`,
        branch: branch ?? undefined,
      });

      return text(`Blocker added: "${blocker.message}" (total: ${context.activeTask!.blockers.length})`);
    }

    // ------------------------------------------------------------------
    case 'set_task_status': {
      ensureActiveTask(omniDir);
      const context = loadContext(omniDir);

      const status = String(args.status) as TaskStatus;
      context.activeTask!.status = status;
      context.activeTask!.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: `Task status changed to: ${status}`,
        branch: branch ?? undefined,
      });

      // Auto-archive completed tasks
      if (status === 'completed') {
        archiveCurrentTask(omniDir, 'completed', projectRoot);
        // Clear the active task after archiving
        context.activeTask = undefined;
        saveContext(omniDir, context);

        appendLogEntry(omniDir, {
          timestamp: new Date().toISOString(),
          source: 'mcp',
          message: 'Task archived to history (completed)',
          branch: branch ?? undefined,
        });
      }

      return text(`Task status updated to: ${status}`);
    }

    // ------------------------------------------------------------------
    case 'update_state': {
      ensureActiveTask(omniDir);
      const context = loadContext(omniDir);

      const changes: string[] = [];
      if (args.title) {
        context.activeTask!.title = String(args.title);
        changes.push(`title="${args.title}"`);
      }
      if (args.status) {
        context.activeTask!.status = String(args.status) as TaskStatus;
        changes.push(`status=${args.status}`);
      }
      context.activeTask!.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: `State updated: ${changes.join(', ')}`,
        branch: branch ?? undefined,
      });

      return text(`State updated: ${changes.join(', ')}`);
    }

    // ------------------------------------------------------------------
    case 'update_rules': {
      const current = loadRules(omniDir);
      const rule = String(args.rule);
      const updated = current.trimEnd() + `\n- ${rule}\n`;
      saveRules(omniDir, updated);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: `Rule added: "${rule}"`,
        branch: branch ?? undefined,
      });

      return text(`Rule added: "${rule}"`);
    }

    // ------------------------------------------------------------------
    case 'add_log_entry': {
      const message = String(args.message);
      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'agent',
        message,
        branch: branch ?? undefined,
      });

      return text(`Logged: "${message}"`);
    }

    // ------------------------------------------------------------------
    case 'clear_blockers': {
      ensureActiveTask(omniDir);
      const context = loadContext(omniDir);

      const count = context.activeTask!.blockers.length;
      context.activeTask!.blockers = [];
      context.activeTask!.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: `Cleared ${count} blocker(s)`,
        branch: branch ?? undefined,
      });

      return text(`Cleared ${count} blocker(s)`);
    }

    // ------------------------------------------------------------------
    case 'get_task': {
      const context = loadContext(omniDir);
      if (!context.activeTask) {
        return text(JSON.stringify({ activeTask: null, hint: 'No active task. Use set_task to create one.' }, null, 2));
      }
      return text(JSON.stringify({ activeTask: context.activeTask }, null, 2));
    }

    // ------------------------------------------------------------------
    case 'get_history': {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const entries = readHistory(omniDir, limit);
      return text(JSON.stringify({ history: entries, count: entries.length }, null, 2));
    }

    // ------------------------------------------------------------------
    case 'write_summary': {
      const summary = String(args.summary);
      saveSummary(omniDir, summary);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'mcp',
        message: 'Handoff summary written',
        branch: branch ?? undefined,
      });

      return text('Handoff summary written to summary.md');
    }

    // ------------------------------------------------------------------
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
