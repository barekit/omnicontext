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
  type Session,
  LogEntrySchema,
  SessionSchema,
  validateState,
} from './schemas.js';
import {
  OMNICODE_DIR,
  TASK_FILE,
  RULES_FILE,
  LOG_FILE,
  LOG_ARCHIVE_FILE,
  HISTORY_FILE,
  HISTORY_ARCHIVE_FILE,
  HISTORY_COMPACTION_THRESHOLD,
  HISTORY_COMPACTION_KEEP,
  SUMMARY_FILE,
  BRANCHES_DIR,
  SESSIONS_DIR,
  SESSION_EXPIRY_MINUTES,
  BLOCKER_STALE_DAYS,
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

/** Append a task to the history archive. Auto-compacts if threshold exceeded. */
export function appendHistory(omniDir: string, entry: HistoryEntry): void {
  const filePath = path.join(omniDir, HISTORY_FILE);
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  maybeCompactHistory(omniDir);
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

/**
 * Compact the task history if it exceeds the threshold.
 * Moves old entries to `history.archive.jsonl` and keeps only the most recent ones.
 */
export function maybeCompactHistory(omniDir: string): boolean {
  const filePath = path.join(omniDir, HISTORY_FILE);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l: string) => l.trim().length > 0);

  if (lines.length <= HISTORY_COMPACTION_THRESHOLD) {
    return false;
  }

  const archivePath = path.join(omniDir, HISTORY_ARCHIVE_FILE);
  const toArchive = lines.slice(0, lines.length - HISTORY_COMPACTION_KEEP);
  const toKeep = lines.slice(-HISTORY_COMPACTION_KEEP);

  fs.appendFileSync(archivePath, toArchive.join('\n') + '\n');
  fs.writeFileSync(filePath, toKeep.join('\n') + '\n');

  return true;
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
  fs.mkdirSync(path.join(omniDir, SESSIONS_DIR), { recursive: true });

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

  // Scaffold agent rules files (.cursorrules, .clinerules, .agents/AGENTS.md)
  ensureAgentRules(projectRoot);

  return omniDir;
}

/**
 * Ensure rule files exist for major AI agents (Cursor, Cline, Roo Code, and Antigravity)
 * and contain the OmniContext integration rules.
 */
export function ensureAgentRules(projectRoot: string): void {
  const ruleContent = `
# OmniContext Integration Rule

You are connected to an OmniContext MCP server. To ensure context is preserved across sessions and tools:

1. **On Session Start**: You MUST immediately call the \`get_context\` tool. This will load the active task, rules, blockers, and handoff summaries.
2. **During Development**:
   - If no task is active, call \`set_task\` with the user's current goal.
   - If you encounter a build error, test failure, or blocker, call \`update_blocker\` immediately with the details.
   - Once resolved, call \`clear_blockers\`.
   - Write important decisions to the log using \`add_log_entry\`.
3. **On Session End**: If the task is completed, call \`set_task_status\` with "completed" and call \`write_summary\` to save a handoff summary for the next agent session.
`.trim() + '\n';

  const marker = 'OmniContext Integration Rule';

  const files = [
    { path: path.join(projectRoot, '.cursorrules') },
    { path: path.join(projectRoot, '.clinerules') },
    { path: path.join(projectRoot, '.windsurfrules') },
    { path: path.join(projectRoot, 'CLAUDE.md') },
    { path: path.join(projectRoot, '.agents', 'AGENTS.md'), parentDir: path.join(projectRoot, '.agents') },
  ];

  for (const file of files) {
    // Ensure parent directory exists if specified
    if (file.parentDir && !fs.existsSync(file.parentDir)) {
      fs.mkdirSync(file.parentDir, { recursive: true });
    }

    if (fs.existsSync(file.path)) {
      const content = fs.readFileSync(file.path, 'utf-8');
      if (!content.includes(marker)) {
        // Append to existing file
        fs.appendFileSync(file.path, `\n\n${ruleContent}`);
      }
    } else {
      // Create new file
      fs.writeFileSync(file.path, ruleContent);
    }
  }
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

// ---------------------------------------------------------------------------
// Concurrent Session Registry (sessions/<id>.json)
// ---------------------------------------------------------------------------

/** Get the path to the sessions directory inside `.omnicode/`. */
export function getSessionsDir(omniDir: string): string {
  const dir = path.join(omniDir, SESSIONS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Register or update an active agent session lock file. */
export function registerSession(omniDir: string, session: Session): void {
  const parsed = SessionSchema.parse(session);
  const dir = getSessionsDir(omniDir);
  const filePath = path.join(dir, `${parsed.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n');
}

/** List all active sessions. Auto-cleans expired sessions (>30m inactive). */
export function listActiveSessions(omniDir: string): Session[] {
  const dir = getSessionsDir(omniDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const now = Date.now();
  const maxAgeMs = SESSION_EXPIRY_MINUTES * 60 * 1000;
  const activeSessions: Session[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const session = SessionSchema.parse(raw);
      const lastActiveMs = new Date(session.lastActiveAt).getTime();

      if (now - lastActiveMs > maxAgeMs) {
        // Expired — remove file
        try {
          fs.unlinkSync(filePath);
        } catch {}
      } else {
        activeSessions.push(session);
      }
    } catch {
      // Corrupt file — remove
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  return activeSessions;
}

/** Update the heartbeat timestamp for an active session. */
export function updateSessionHeartbeat(
  omniDir: string,
  sessionId: string,
  taskTitle?: string,
): void {
  const dir = getSessionsDir(omniDir);
  const filePath = path.join(dir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const session = SessionSchema.parse(raw);
    session.lastActiveAt = new Date().toISOString();
    if (taskTitle !== undefined) {
      session.taskTitle = taskTitle;
    }
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n');
  } catch {}
}

/** Remove a session lock file on agent exit / shutdown. */
export function removeSession(omniDir: string, sessionId: string): void {
  const dir = getSessionsDir(omniDir);
  const filePath = path.join(dir, `${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Health & Maintenance
// ---------------------------------------------------------------------------

export interface HealthReport {
  logEntries: number;
  archivedLogEntries: number;
  historyEntries: number;
  archivedHistoryEntries: number;
  branchProfiles: number;
  orphanedBranches: string[];
  staleBlockers: number;
  activeSessions: number;
  totalDiskBytes: number;
}

/** Get all existing local Git branch names. */
export function getGitBranches(projectRoot: string): string[] {
  const headsDir = path.join(projectRoot, '.git', 'refs', 'heads');
  if (!fs.existsSync(headsDir)) return [];

  const branches: string[] = [];
  function walk(dir: string, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(
          path.join(dir, entry.name),
          prefix ? `${prefix}/${entry.name}` : entry.name,
        );
      } else {
        branches.push(prefix ? `${prefix}/${entry.name}` : entry.name);
      }
    }
  }
  walk(headsDir);
  return branches;
}

/** Prune orphaned `.omnicode/branches/<branch>` directories. */
export function pruneOrphanedBranches(projectRoot: string): string[] {
  const omniDir = path.join(projectRoot, OMNICODE_DIR);
  const branchesDir = path.join(omniDir, BRANCHES_DIR);
  if (!fs.existsSync(branchesDir)) return [];

  const existingGitBranches = getGitBranches(projectRoot);
  const validSafeNames = new Set(
    existingGitBranches.map((b) => b.replace(/\//g, '__')),
  );

  const branchFolders = fs.readdirSync(branchesDir);
  const pruned: string[] = [];

  for (const folder of branchFolders) {
    if (!validSafeNames.has(folder)) {
      const folderPath = path.join(branchesDir, folder);
      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
        pruned.push(folder.replace(/__/g, '/'));
      } catch {}
    }
  }

  return pruned;
}

/** Calculate total disk size of the `.omnicode/` directory. */
export function getOmniDirSizeBytes(omniDir: string): number {
  if (!fs.existsSync(omniDir)) return 0;
  let totalBytes = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          totalBytes += fs.statSync(fullPath).size;
        } catch {}
      }
    }
  }
  walk(omniDir);
  return totalBytes;
}

/** Generate a health and disk usage report for `.omnicode/`. */
export function getHealthReport(
  omniDir: string,
  projectRoot: string,
): HealthReport {
  const logEntries = readLogEntries(omniDir).length;
  const historyEntries = readHistory(omniDir).length;

  const logArchivePath = path.join(omniDir, LOG_ARCHIVE_FILE);
  const archivedLogEntries = fs.existsSync(logArchivePath)
    ? fs
        .readFileSync(logArchivePath, 'utf-8')
        .split('\n')
        .filter((l) => l.trim().length > 0).length
    : 0;

  const historyArchivePath = path.join(omniDir, HISTORY_ARCHIVE_FILE);
  const archivedHistoryEntries = fs.existsSync(historyArchivePath)
    ? fs
        .readFileSync(historyArchivePath, 'utf-8')
        .split('\n')
        .filter((l) => l.trim().length > 0).length
    : 0;

  const branchesDir = path.join(omniDir, BRANCHES_DIR);
  const branchFolders = fs.existsSync(branchesDir)
    ? fs.readdirSync(branchesDir)
    : [];
  const existingGitBranches = getGitBranches(projectRoot);
  const validSafeNames = new Set(
    existingGitBranches.map((b) => b.replace(/\//g, '__')),
  );
  const orphanedBranches = branchFolders
    .filter((folder) => !validSafeNames.has(folder))
    .map((folder) => folder.replace(/__/g, '/'));

  let staleBlockers = 0;
  try {
    const context = loadContext(omniDir);
    if (context.activeTask && context.activeTask.blockers.length > 0) {
      const now = Date.now();
      const maxAgeMs = BLOCKER_STALE_DAYS * 24 * 60 * 60 * 1000;
      for (const b of context.activeTask.blockers) {
        if (now - new Date(b.createdAt).getTime() > maxAgeMs) {
          staleBlockers++;
        }
      }
    }
  } catch {}

  const activeSessions = listActiveSessions(omniDir).length;
  const totalDiskBytes = getOmniDirSizeBytes(omniDir);

  return {
    logEntries,
    archivedLogEntries,
    historyEntries,
    archivedHistoryEntries,
    branchProfiles: branchFolders.length,
    orphanedBranches,
    staleBlockers,
    activeSessions,
    totalDiskBytes,
  };
}
