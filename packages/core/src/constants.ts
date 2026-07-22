/**
 * Central constants for the OmniContext file standard and configuration.
 *
 * These values define the on-disk layout of the `.omnicode/` directory
 * and are shared across the CLI, MCP server, and any future consumers.
 */

/** Name of the hidden directory at the project root. */
export const OMNICODE_DIR = '.omnicode';

/** Primary state file – tracks the active task, blockers, and metadata. */
export const TASK_FILE = 'task.json';

/** Project-level configuration file. */
export const CONFIG_FILE = 'config.json';

/** Markdown file containing global project rules for AI agents. */
export const RULES_FILE = 'rules.md';

/** Append-only JSONL file for activity / architecture log entries. */
export const LOG_FILE = 'log.jsonl';

/** Archive of old log entries after compaction. */
export const LOG_ARCHIVE_FILE = 'log.archive.jsonl';

/** JSONL file containing completed / replaced task history. */
export const HISTORY_FILE = 'history.jsonl';

/** Agent-generated handoff summary written on task completion. */
export const SUMMARY_FILE = 'summary.md';

/** Directory holding per-branch context profiles. */
export const BRANCHES_DIR = 'branches';

/** Current schema version for the `.omnicode` standard. */
export const SCHEMA_VERSION = '1.0.0';

/** Default content for a freshly-scaffolded rules.md file. */
export const DEFAULT_RULES_CONTENT =
  '# Global Rules\n\nAdd your project-specific rules for AI agents here.\n';

/** Maximum log entries to keep in log.jsonl before compaction. */
export const LOG_COMPACTION_THRESHOLD = 200;

/** Number of recent entries to keep after compaction. */
export const LOG_COMPACTION_KEEP = 50;

/** Maximum history entries to keep in history.jsonl before compaction. */
export const HISTORY_COMPACTION_THRESHOLD = 100;

/** Number of recent history entries to keep after compaction. */
export const HISTORY_COMPACTION_KEEP = 20;

/** Archive file for compacted history entries. */
export const HISTORY_ARCHIVE_FILE = 'history.archive.jsonl';

/** Number of days before a blocker is considered stale. */
export const BLOCKER_STALE_DAYS = 3;

/** Directory holding active agent session lock files. */
export const SESSIONS_DIR = 'sessions';

/** Number of minutes before an inactive agent session is considered expired. */
export const SESSION_EXPIRY_MINUTES = 30;

/** Name of the cached codebase map file. */
export const MAP_FILE = 'map.json';

/** Maximum age (in hours) before the codebase map is re-generated. */
export const MAP_MAX_AGE_HOURS = 24;

// ---------------------------------------------------------------------------
// Known MCP agent config paths (macOS)
// ---------------------------------------------------------------------------

/**
 * Well-known MCP configuration file paths for popular AI coding agents.
 * Paths use `~` as a placeholder for the user's home directory.
 */
export const KNOWN_AGENT_CONFIGS: Record<string, { name: string; configPath: string; docs: string }> = {
  cursor: {
    name: 'Cursor',
    configPath: '~/.cursor/mcp.json',
    docs: 'https://docs.cursor.com/context/model-context-protocol',
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    docs: 'https://modelcontextprotocol.io/quickstart/user',
  },
  windsurf: {
    name: 'Windsurf',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    docs: 'https://docs.codeium.com/windsurf/mcp',
  },
  antigravity: {
    name: 'Antigravity',
    configPath: '~/.gemini/config/mcp_config.json',
    docs: 'https://modelcontextprotocol.io',
  },
  cline: {
    name: 'Cline (VS Code)',
    configPath: '~/.cline/data/settings/cline_mcp_settings.json',
    docs: 'https://github.com/cline/cline',
  },
  'roo-code': {
    name: 'Roo Code (VS Code)',
    configPath: '~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json',
    docs: 'https://github.com/RooVeterinaryInc/Roo-Cline',
  },
  'claude-code': {
    name: 'Claude Code (CLI)',
    configPath: '~/.claude.json',
    docs: 'https://modelcontextprotocol.io',
  },
  vscode: {
    name: 'VS Code (Native MCP)',
    configPath: '~/Library/Application Support/Code/User/mcp.json',
    docs: 'https://code.visualstudio.com',
  },
};
