/**
 * MCP Tool handlers for OmniContext.
 *
 * These tools allow AI agents to **autonomously** manage project context.
 * The design principle is zero-friction: agents should be able to create,
 * update, and complete tasks without any manual user intervention after
 * the initial `omni init`.
 *
 * Token Efficiency:
 *   The `get_context` tool is the primary entry point. It returns ALL
 *   boot-up context in a single, compact call (~150-300 tokens), replacing
 *   the need to read 4-7 separate resources on session start.
 *
 * Tools:
 *   - get_context           ⚡ One-call boot: task + rules + log + architecture (~200 tokens)
 *   - set_task              Create or replace the active task (auto-archives old task)
 *   - update_blocker        Append a blocker (auto-creates task if needed)
 *   - set_task_status       Update task status (auto-archives on completion)
 *   - update_state          Generic task title/status update
 *   - update_rules          Append a rule to rules.md
 *   - add_log_entry         Write to the activity log
 *   - clear_blockers        Remove all blockers from the active task
 *   - get_task              Read the current active task
 *   - get_history           Read completed task history
 *   - write_summary         Write a handoff summary for the next agent
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type Blocker,
  type Task,
  type TaskStatus,
  type Session,
  loadContext,
  saveContext,
  loadRules,
  saveRules,
  appendLogEntry,
  getCurrentBranch,
  appendHistory,
  readHistory,
  readLogEntries,
  saveSummary,
  loadSummary,
  detectArchitecture,
  formatArchitectureCompact,
  // Session Registry
  registerSession,
  listActiveSessions,
  updateSessionHeartbeat,
  removeSession,
  // Codebase Map
  generateCodebaseMap,
  loadCachedMap,
  saveCachedMap,
  formatCodebaseMapCompact,
  // Codebase Intelligence
  searchIndex,
  getOrBuildIndex,
  getIndexSummary,
  readFileSmart,
  type ReadMode,
  findRelevantFiles,
  formatRelevantFilesCompact,
  getChangedFiles,
} from '@barekit/omnicontext-core';

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

/**
 * Build the ultra-compact boot context (~150-300 tokens).
 * Replaces reading 4-7 separate resources.
 */
async function buildCompactContext(omniDir: string, projectRoot: string): Promise<string> {
  const context = loadContext(omniDir);
  const branch = getCurrentBranch(projectRoot);
  const rules = loadRules(omniDir);
  const recentLog = readLogEntries(omniDir, 5);
  const history = readHistory(omniDir);
  const summary = loadSummary(omniDir);
  const arch = detectArchitecture(projectRoot);

  const lines: string[] = [];

  // Line 1: Project + branch
  lines.push(`# ${arch.projectName ?? 'Project'} | branch: ${branch ?? 'detached'}`);

  // Concurrent Agent Session Warnings
  try {
    const activeSessions = listActiveSessions(omniDir);
    if (activeSessions.length > 0) {
      const currentPid = process.pid;
      const otherSessions = activeSessions.filter((s) => s.pid !== currentPid);
      if (otherSessions.length > 0) {
        lines.push(
          `⚠️ ${otherSessions.length} other agent session(s) active on this branch: ` +
            otherSessions.map((s) => `${s.agentId}${s.taskTitle ? ` ("${s.taskTitle}")` : ''}`).join(', '),
        );
      }
    }
  } catch {}

  // Architecture (compact)
  const archLine = formatArchitectureCompact(arch);
  if (archLine) lines.push(archLine);

  // Git changes
  const gitChanges = getChangedFiles(projectRoot);
  lines.push('');
  lines.push(gitChanges);

  // Current task
  lines.push('');
  if (context.activeTask) {
    const t = context.activeTask;
    lines.push(`## Task: ${t.title} [${t.status}]`);
    if (t.blockers.length > 0) {
      lines.push(`Blockers (${t.blockers.length}):`);
      for (const b of t.blockers.slice(-3)) { // last 3 only
        lines.push(`- ${b.message} (${b.source})`);
      }
    }
  } else {
    lines.push('## No active task — use set_task to create one');
  }

  // Relevant files
  const relevantFiles = await formatRelevantFilesCompact(projectRoot, context.activeTask || null);
  lines.push('');
  lines.push(relevantFiles);

  // Rules (compact — strip markdown header, keep only bullet points)
  const rulesLines = rules
    .split('\n')
    .filter(l => l.startsWith('-') || l.startsWith('*'))
    .slice(0, 10); // max 10 rules
  if (rulesLines.length > 0) {
    lines.push('');
    lines.push('## Rules');
    lines.push(...rulesLines);
  }

  // Last handoff summary (truncated)
  if (summary && summary.length > 10) {
    lines.push('');
    lines.push('## Last Handoff');
    // Take first 3 non-empty lines of the summary
    const summaryLines = summary.split('\n').filter(l => l.trim()).slice(0, 3);
    lines.push(...summaryLines);
  }

  // Recent activity (last 5, one-line each)
  if (recentLog.length > 0) {
    lines.push('');
    lines.push('## Recent Activity');
    for (const entry of recentLog) {
      const ago = getTimeAgo(entry.timestamp);
      lines.push(`- [${ago}] ${entry.message}`);
    }
  }

  // History count
  if (history.length > 0) {
    lines.push('');
    lines.push(`Completed tasks: ${history.length}`);
  }

  return lines.join('\n');
}

/** Format a timestamp as a human-readable relative time. */
function getTimeAgo(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      name: 'register_session',
      description:
        'Register your agent session for multi-chat coordination. Call this on session start ' +
        'to establish a lock and receive warnings if another agent session is active on the same branch.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'Your agent identifier (e.g. "antigravity", "cursor", "claude-code")',
          },
          taskTitle: {
            type: 'string',
            description: 'Optional initial task title you are working on',
          },
        },
        required: ['agentId'],
      },
    },
    {
      name: 'end_session',
      description: 'Clean up your active session lock on task completion or exit.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'The session ID returned during register_session',
          },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'get_codebase_map',
      description:
        'Get a structured map of the codebase (file tree, one-line file summaries, and exported symbols). ' +
        'Use this to understand the project structure without scanning directories manually.',
      inputSchema: {
        type: 'object',
        properties: {
          refresh: {
            type: 'boolean',
            description: 'Force re-scanning the codebase (default: false, uses 24h cache)',
          },
        },
      },
    },
    {
      name: 'get_context',
      description:
        'GET THIS FIRST. Returns all project context in a single compact response (~200 tokens): ' +
        'active task, blockers, rules, recent activity, project architecture, and last handoff summary. ' +
        'This replaces reading multiple resources individually and saves significant tokens. ' +
        'Call this once at session start instead of reading context://active-task, context://rules, ' +
        'context://log, and context://summary separately.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'set_task',
      description:
        'Create or replace the active task. Call this when the user gives you a new goal. ' +
        'If a task already exists, it is auto-archived to history and replaced.',
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
        'auto-created.',
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
        'Update the active task lifecycle status. ' +
        '"completed" → auto-archives to history, ' +
        '"blocked" → marks stuck, ' +
        '"active" → resumes.',
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
        'Modify the active task title and/or status. ' +
        'Use to refine the task description as your understanding evolves.',
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
        'Append a rule to rules.md. Record coding standards, architecture decisions, ' +
        'or constraints that future agents must follow.',
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
        'Write to the activity log. Record decisions, progress, or anything ' +
        'the next agent should know. This is your communication channel.',
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
      description: 'Remove all blockers from the active task.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_task',
      description: 'Read the current active task with title, status, and blockers.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_history',
      description: 'Read completed task history. Use to avoid re-doing previous work.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max entries to return (default: 10)',
          },
        },
      },
    },
    {
      name: 'write_summary',
      description:
        'Write a handoff summary for the next agent. Call on session end ' +
        'with what you did, what is pending, and key context.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Markdown summary: what you did, what is pending, key context',
          },
        },
        required: ['summary'],
      },
    },
    {
      name: 'search_codebase',
      description: 'Search the codebase index by keyword. Returns matching files and their exported symbols. Much faster and more token-efficient than running grep or find commands.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term or keyword (e.g. "auth", "validateSession")',
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 10)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_file_smart',
      description: 'Read a file using token-efficient modes. Use "signatures" to quickly understand a file without reading its bodies. Use "relevant" to extract only sections matching your keywords.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute path or relative path to the file',
          },
          mode: {
            type: 'string',
            enum: ['signatures', 'relevant', 'full'],
            description: 'Read mode (default: signatures)',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords for "relevant" mode to filter matching sections',
          },
          tokenBudget: {
            type: 'number',
            description: 'Max tokens to return before truncating (default: 500)',
          },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'get_changed_files',
      description: 'Get a compact summary of files changed since the last commit or agent session.',
      inputSchema: {
        type: 'object',
        properties: {},
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

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  omniDir: string,
  projectRoot: string,
): Promise<ToolResult> {
  const text = (msg: string): ToolResult => ({
    content: [{ type: 'text', text: msg }],
  });

  const branch = getCurrentBranch(projectRoot);

  switch (toolName) {
    // ------------------------------------------------------------------
    // SESSION MANAGEMENT & MULTI-CHAT COORDINATION
    // ------------------------------------------------------------------
    case 'register_session': {
      const agentId = String(args.agentId);
      const taskTitle = args.taskTitle ? String(args.taskTitle) : undefined;
      const sessionId = (args.sessionId as string) || randomUUID();
      const now = new Date().toISOString();

      const session: Session = {
        id: sessionId,
        agentId,
        taskTitle,
        pid: process.pid,
        startedAt: now,
        lastActiveAt: now,
        branch: branch ?? undefined,
      };

      if (omniDir) {
        registerSession(omniDir, session);

        // Check for concurrent active sessions
        const active = listActiveSessions(omniDir);
        const otherSessions = active.filter((s) => s.id !== sessionId);

        let msg = `Session registered (id: ${sessionId})`;
        if (otherSessions.length > 0) {
          msg += `\n⚠️ WARNING: ${otherSessions.length} other session(s) active on this project:`;
          for (const s of otherSessions) {
            msg += `\n- Agent: ${s.agentId}${s.taskTitle ? ` | Task: "${s.taskTitle}"` : ''} (branch: ${s.branch ?? 'unknown'})`;
          }
        }
        return text(msg);
      }
      return text(`Session registered (id: ${sessionId})`);
    }

    case 'end_session': {
      const sessionId = String(args.sessionId);
      if (omniDir) {
        removeSession(omniDir, sessionId);
      }
      return text(`Session ended (${sessionId})`);
    }

    case 'get_codebase_map': {
      const refresh = Boolean(args.refresh);
      let map = refresh ? null : (omniDir ? loadCachedMap(omniDir) : null);
      if (!map) {
        map = generateCodebaseMap(projectRoot);
        if (omniDir) {
          saveCachedMap(omniDir, map);
        }
      }
      return text(formatCodebaseMapCompact(map));
    }

    // ------------------------------------------------------------------
    // COMPACT CONTEXT — single-call boot (~200 tokens)
    // ------------------------------------------------------------------
    case 'get_context': {
      const compact = await buildCompactContext(omniDir, projectRoot);
      return text(compact);
    }

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
        message: `Task set: "${title}"`,
        branch: branch ?? undefined,
      });

      return text(`Task set: "${title}"`);
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
        message: `Blocker: ${blocker.message}`,
        branch: branch ?? undefined,
      });

      return text(`Blocker logged (total: ${context.activeTask!.blockers.length})`);
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
        message: `Status → ${status}`,
        branch: branch ?? undefined,
      });

      // Auto-archive completed tasks
      if (status === 'completed') {
        archiveCurrentTask(omniDir, 'completed', projectRoot);
        context.activeTask = undefined;
        saveContext(omniDir, context);
      }

      return text(`Status → ${status}`);
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

      return text(`Updated: ${changes.join(', ')}`);
    }

    // ------------------------------------------------------------------
    case 'update_rules': {
      const current = loadRules(omniDir);
      const rule = String(args.rule);
      const updated = current.trimEnd() + `\n- ${rule}\n`;
      saveRules(omniDir, updated);

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

      return text(`Logged`);
    }

    // ------------------------------------------------------------------
    case 'clear_blockers': {
      ensureActiveTask(omniDir);
      const context = loadContext(omniDir);

      const count = context.activeTask!.blockers.length;
      context.activeTask!.blockers = [];
      context.activeTask!.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      return text(`Cleared ${count} blocker(s)`);
    }

    // ------------------------------------------------------------------
    case 'get_task': {
      const context = loadContext(omniDir);
      if (!context.activeTask) {
        return text('No active task. Use set_task to create one.');
      }
      const t = context.activeTask;
      // Compact format instead of full JSON
      let out = `${t.title} [${t.status}]`;
      if (t.blockers.length > 0) {
        out += `\nBlockers: ${t.blockers.map(b => b.message).join('; ')}`;
      }
      return text(out);
    }

    // ------------------------------------------------------------------
    case 'get_history': {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const entries = readHistory(omniDir, limit);
      if (entries.length === 0) {
        return text('No task history yet.');
      }
      // Compact: one line per task
      const lines = entries.map(e => {
        const ago = getTimeAgo(e.archivedAt);
        return `${e.reason === 'completed' ? '✅' : '🔄'} ${e.task.title} (${e.reason}, ${ago})`;
      });
      return text(lines.join('\n'));
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

      return text('Summary saved');
    }

    // ------------------------------------------------------------------
    case 'search_codebase': {
      const query = String(args.query);
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      
      const db = await getOrBuildIndex(projectRoot);
      const results = await searchIndex(db, query, limit);
      
      if (results.length === 0) {
        return text(`No matches found for "${query}"`);
      }
      
      const lines = [`Codebase matches for "${query}":`];
      for (const r of results) {
        lines.push(`- ${r.path} (${r.language})`);
        if (r.exports) {
          lines.push(`  exports: ${r.exports}`);
        }
      }
      
      return text(lines.join('\n'));
    }

    // ------------------------------------------------------------------
    case 'read_file_smart': {
      const relOrAbs = String(args.filePath);
      const filePath = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(projectRoot, relOrAbs);
      
      const mode = (args.mode as ReadMode) || 'signatures';
      const keywords = Array.isArray(args.keywords) ? args.keywords.map(String) : [];
      const tokenBudget = typeof args.tokenBudget === 'number' ? args.tokenBudget : 500;
      
      const result = readFileSmart(filePath, mode, { tokenBudget, keywords });
      
      let out = `File: ${result.path}\nMode: ${result.mode}\nTokens: ~${result.estimatedTokens}`;
      if (result.truncated) {
        out += ' (TRUNCATED)';
      }
      out += `\n---\n${result.content}`;
      
      return text(out);
    }

    // ------------------------------------------------------------------
    case 'get_changed_files': {
      return text(getChangedFiles(projectRoot));
    }

    // ------------------------------------------------------------------
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
