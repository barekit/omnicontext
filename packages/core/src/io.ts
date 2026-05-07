/**
 * File I/O utilities for reading and writing `.omnicode/` state.
 *
 * All file operations are centralised here so that the CLI, MCP server,
 * and git-watcher share the same safe, validated read/write logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type ProjectContext,
  type LogEntry,
  type Task,
  LogEntrySchema,
  validateState,
} from './schemas.js';
import {
  OMNICODE_DIR,
  TASK_FILE,
  RULES_FILE,
  LOG_FILE,
  LOG_ARCHIVE_FILE,
  HISTORY_FILE,
  SUMMARY_FILE,
  BRANCHES_DIR,
  SCHEMA_VERSION,
  DEFAULT_RULES_CONTENT,
  LOG_COMPACTION_THRESHOLD,
  LOG_COMPACTION_KEEP,
} from './constants.js';

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------

/**
 * Walk up the directory tree from `startDir` to find the nearest `.omnicode/`
 * directory. Returns the absolute path to the **project root** (the parent
 * of `.omnicode/`), or `null` if none is found.
 */
export function resolveOmniRoot(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, OMNICODE_DIR);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }
    current = parent;
  }
}

/**
 * Return the absolute path to the `.omnicode/` directory.
 * Throws if the directory cannot be found.
 */
export function requireOmniDir(startDir?: string): string {
  const root = resolveOmniRoot(startDir);
  if (!root) {
    throw new Error(
      'OmniContext not initialized. Run "omni init" in your project root first.',
    );
  }
  return path.join(root, OMNICODE_DIR);
}

// ---------------------------------------------------------------------------
// task.json
// ---------------------------------------------------------------------------

/** Read and validate `.omnicode/task.json`. */
export function loadContext(omniDir: string): ProjectContext {
  const filePath = path.join(omniDir, TASK_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${TASK_FILE} not found in ${omniDir}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return validateState(raw);
}

/** Write a validated ProjectContext back to `.omnicode/task.json`. */
export function saveContext(omniDir: string, context: ProjectContext): void {
  const filePath = path.join(omniDir, TASK_FILE);
  fs.writeFileSync(filePath, JSON.stringify(context, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// rules.md
// ---------------------------------------------------------------------------

/** Read `.omnicode/rules.md` as a string. */
export function loadRules(omniDir: string): string {
  const filePath = path.join(omniDir, RULES_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${RULES_FILE} not found in ${omniDir}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/** Overwrite `.omnicode/rules.md`. */
export function saveRules(omniDir: string, content: string): void {
  const filePath = path.join(omniDir, RULES_FILE);
  fs.writeFileSync(filePath, content);
}

// ---------------------------------------------------------------------------
// log.jsonl
// ---------------------------------------------------------------------------

/** Append a single log entry to `.omnicode/log.jsonl`. Auto-compacts if threshold exceeded. */
export function appendLogEntry(omniDir: string, entry: LogEntry): void {
  const parsed = LogEntrySchema.parse(entry);
  const filePath = path.join(omniDir, LOG_FILE);
  fs.appendFileSync(filePath, JSON.stringify(parsed) + '\n');

  // Auto-compact if the log is getting too large
  maybeCompactLog(omniDir);
}

/** Read all log entries from `.omnicode/log.jsonl`. Returns newest-last. */
export function readLogEntries(omniDir: string, limit?: number): LogEntry[] {
  const filePath = path.join(omniDir, LOG_FILE);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l: string) => l.trim().length > 0);

  const entries = lines.map((line: string) => LogEntrySchema.parse(JSON.parse(line)));

  if (limit && limit > 0) {
    return entries.slice(-limit);
  }
  return entries;
}

/**
 * Compact the log if it exceeds the threshold.
 * Moves old entries to `log.archive.jsonl` and keeps only the most recent ones.
 */
export function maybeCompactLog(omniDir: string): boolean {
  const filePath = path.join(omniDir, LOG_FILE);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l: string) => l.trim().length > 0);

  if (lines.length <= LOG_COMPACTION_THRESHOLD) {
    return false;
  }

  // Archive old entries
  const archivePath = path.join(omniDir, LOG_ARCHIVE_FILE);
  const toArchive = lines.slice(0, lines.length - LOG_COMPACTION_KEEP);
  const toKeep = lines.slice(-LOG_COMPACTION_KEEP);

  fs.appendFileSync(archivePath, toArchive.join('\n') + '\n');
  fs.writeFileSync(filePath, toKeep.join('\n') + '\n');

  return true;
}

// ---------------------------------------------------------------------------
// history.jsonl — Task history
// ---------------------------------------------------------------------------

/** A completed/replaced task record for the history file. */
export interface HistoryEntry {
  /** The archived task data. */
  task: Task;
  /** Why the task was archived: completed, replaced, or cleared. */
  reason: 'completed' | 'replaced' | 'cleared';
  /** ISO-8601 timestamp of when it was archived. */
  archivedAt: string;
  /** Git branch at the time of archiving. */
  branch?: string;
}

/** Append a task to the history archive. */
export function appendHistory(omniDir: string, entry: HistoryEntry): void {
  const filePath = path.join(omniDir, HISTORY_FILE);
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

/** Read task history. Returns newest-last. */
export function readHistory(omniDir: string, limit?: number): HistoryEntry[] {
  const filePath = path.join(omniDir, HISTORY_FILE);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l: string) => l.trim().length > 0);

  const entries: HistoryEntry[] = lines.map((line: string) => JSON.parse(line));

  if (limit && limit > 0) {
    return entries.slice(-limit);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// summary.md — Handoff summary
// ---------------------------------------------------------------------------

/** Read the current handoff summary, or null if none exists. */
export function loadSummary(omniDir: string): string | null {
  const filePath = path.join(omniDir, SUMMARY_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/** Write a handoff summary. */
export function saveSummary(omniDir: string, content: string): void {
  const filePath = path.join(omniDir, SUMMARY_FILE);
  fs.writeFileSync(filePath, content);
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

/** Scaffold a fresh `.omnicode/` directory with default files. */
export function scaffoldOmniDir(projectRoot: string): string {
  const omniDir = path.join(projectRoot, OMNICODE_DIR);

  if (fs.existsSync(omniDir)) {
    throw new Error(`${OMNICODE_DIR} directory already exists.`);
  }

  // Create directories
  fs.mkdirSync(omniDir, { recursive: true });
  fs.mkdirSync(path.join(omniDir, BRANCHES_DIR), { recursive: true });

  // Create task.json
  const initialContext: ProjectContext = {
    version: SCHEMA_VERSION,
    globalRulesPath: `${OMNICODE_DIR}/${RULES_FILE}`,
  };
  saveContext(omniDir, initialContext);

  // Create rules.md
  saveRules(omniDir, DEFAULT_RULES_CONTENT);

  // Create empty log file
  fs.writeFileSync(path.join(omniDir, LOG_FILE), '');

  // Create empty history file
  fs.writeFileSync(path.join(omniDir, HISTORY_FILE), '');

  return omniDir;
}

/**
 * Ensure `.omnicode/` is in the project's `.gitignore`.
 * Creates the `.gitignore` if it doesn't exist.
 */
export function ensureGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = `${OMNICODE_DIR}/`;

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n${entry}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
  }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/** Read the current branch name from `.git/HEAD`. Returns null on failure. */
export function getCurrentBranch(projectRoot: string): string | null {
  const headPath = path.join(projectRoot, '.git', 'HEAD');
  if (!fs.existsSync(headPath)) {
    return null;
  }
  const content = fs.readFileSync(headPath, 'utf-8').trim();
  const match = content.match(/^ref: refs\/heads\/(.+)$/);
  return match ? match[1] : null; // null = detached HEAD
}
