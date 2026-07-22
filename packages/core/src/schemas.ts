/**
 * Zod schemas for the OmniContext `.omnicode` file standard.
 *
 * Every persistent data structure written to disk or exchanged over MCP
 * is validated through these schemas. They are the single source of truth
 * for the shape of OmniContext data.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Blocker
// ---------------------------------------------------------------------------

/**
 * A structured blocker attached to a task.
 * Replaces the previous raw-string approach with richer metadata.
 */
export const BlockerSchema = z.object({
  /** Human-readable description of the blocker. */
  message: z.string(),
  /** ISO-8601 timestamp of when the blocker was recorded. */
  createdAt: z.string().datetime(),
  /** Which tool / agent recorded the blocker (e.g. "cursor", "claude-code", "cli"). */
  source: z.string().default('cli'),
});

export type Blocker = z.infer<typeof BlockerSchema>;

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const TaskStatusEnum = z.enum(['active', 'completed', 'blocked']);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskSchema = z.object({
  /** Unique identifier for the task. */
  id: z.string().uuid(),
  /** Short human-readable title. */
  title: z.string().min(1),
  /** Current lifecycle status. */
  status: TaskStatusEnum,
  /** Ordered list of blockers. */
  blockers: z.array(BlockerSchema),
  /** ISO-8601 timestamp of the last update. */
  updatedAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

// ---------------------------------------------------------------------------
// Log Entry
// ---------------------------------------------------------------------------

/**
 * A single entry in the append-only activity / architecture log.
 * Stored in `.omnicode/log.jsonl`.
 */
export const LogEntrySchema = z.object({
  /** ISO-8601 timestamp. */
  timestamp: z.string().datetime(),
  /** Origin of the entry. */
  source: z.enum(['cli', 'mcp', 'agent', 'system']),
  /** The log message. */
  message: z.string(),
  /** Git branch at the time of logging (if known). */
  branch: z.string().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// ---------------------------------------------------------------------------
// Project Context (task.json root)
// ---------------------------------------------------------------------------

/**
 * Root schema for `.omnicode/task.json`.
 * This is the primary state file that AI agents read and write.
 */
export const ProjectContextSchema = z.object({
  /** Schema version for forward-compatibility checks. */
  version: z.string(),
  /** The currently active task (if any). */
  activeTask: TaskSchema.optional(),
  /** Relative path to the global rules file. */
  globalRulesPath: z.string(),
});

export type ProjectContext = z.infer<typeof ProjectContextSchema>;

// ---------------------------------------------------------------------------
// Agent Session & Multi-Chat Session Registry
// ---------------------------------------------------------------------------

/**
 * Lightweight record of an agent session.
 * Used for debugging handoff issues and understanding agent usage patterns.
 */
export const AgentSessionSchema = z.object({
  /** Agent identifier (e.g. "cursor", "claude-code", "antigravity"). */
  agentId: z.string(),
  /** When the session started. */
  startedAt: z.string().datetime(),
  /** When the session last wrote to the context. */
  lastActiveAt: z.string().datetime(),
});

export type AgentSession = z.infer<typeof AgentSessionSchema>;

/**
 * Active concurrent session record stored in `.omnicode/sessions/<id>.json`.
 * Used for multi-chat coordination, collision detection, and stale session cleanup.
 */
export const SessionSchema = z.object({
  /** Unique session ID. */
  id: z.string(),
  /** Agent identifier (e.g. "antigravity", "cursor", "claude-code"). */
  agentId: z.string(),
  /** Current task title being worked on in this session. */
  taskTitle: z.string().optional(),
  /** Process ID of the MCP server. */
  pid: z.number().optional(),
  /** ISO-8601 timestamp of session start. */
  startedAt: z.string(),
  /** ISO-8601 timestamp of last heartbeat / activity. */
  lastActiveAt: z.string(),
  /** Git branch at session start. */
  branch: z.string().optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Parse and validate unknown data as a ProjectContext. Throws on invalid input. */
export function validateState(data: unknown): ProjectContext {
  return ProjectContextSchema.parse(data);
}

/** Safely parse without throwing. Returns a discriminated result. */
export function safeValidateState(data: unknown) {
  return ProjectContextSchema.safeParse(data);
}
