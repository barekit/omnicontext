/**
 * @omnicontext/core
 *
 * The shared foundation for OmniContext — schemas, constants, file I/O,
 * git watcher, profile manager, and MCP config auto-wiring.
 *
 * Re-exports everything downstream consumers need in a single import:
 *
 *   import { TaskSchema, loadContext, GitWatcher } from '@omnicontext/core';
 */

// ---- Schemas & types ----
export {
  BlockerSchema,
  TaskSchema,
  TaskStatusEnum,
  LogEntrySchema,
  ProjectContextSchema,
  AgentSessionSchema,
  validateState,
  safeValidateState,
  type Blocker,
  type Task,
  type TaskStatus,
  type LogEntry,
  type ProjectContext,
  type AgentSession,
} from './schemas.js';

// ---- Constants ----
export {
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
  KNOWN_AGENT_CONFIGS,
} from './constants.js';

// ---- File I/O ----
export {
  resolveOmniRoot,
  requireOmniDir,
  loadContext,
  saveContext,
  loadRules,
  saveRules,
  appendLogEntry,
  readLogEntries,
  maybeCompactLog,
  appendHistory,
  readHistory,
  loadSummary,
  saveSummary,
  scaffoldOmniDir,
  ensureGitignore,
  getCurrentBranch,
  type HistoryEntry,
} from './io.js';

// ---- Git watcher ----
export { GitWatcher, type BranchChangeEvent } from './git-watcher.js';

// ---- Profile manager ----
export { ProfileManager } from './profile-manager.js';

// ---- MCP config auto-wiring ----
export {
  detectInstalledAgents,
  setupAgentConfig,
  setupAllAgents,
  type SetupResult,
} from './mcp-config.js';

// ---- Architecture detection ----
export {
  detectArchitecture,
  formatArchitectureCompact,
  type ProjectArchitecture,
} from './architecture.js';

// ---- Codebase Intelligence ----
export * from './indexer.js';
export * from './smart-reader.js';
export * from './relevance.js';
export * from './git-changes.js';
