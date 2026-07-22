/**
 * Configuration manager for OmniContext.
 *
 * Provides project-level overrides via `.omnicode/config.json`.
 * Fallback values are derived from `constants.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  CONFIG_FILE,
  LOG_COMPACTION_THRESHOLD,
  LOG_COMPACTION_KEEP,
  HISTORY_COMPACTION_THRESHOLD,
  HISTORY_COMPACTION_KEEP,
  BLOCKER_STALE_DAYS,
  SESSION_EXPIRY_MINUTES,
  MAP_MAX_AGE_HOURS,
} from './constants.js';

export const OmniConfigSchema = z.object({
  /** Log compaction threshold (default: 200) */
  logCompactionThreshold: z.number().positive().default(LOG_COMPACTION_THRESHOLD),
  /** Log entries to keep after compaction (default: 50) */
  logCompactionKeep: z.number().positive().default(LOG_COMPACTION_KEEP),
  /** History compaction threshold (default: 100) */
  historyCompactionThreshold: z.number().positive().default(HISTORY_COMPACTION_THRESHOLD),
  /** History entries to keep after compaction (default: 20) */
  historyCompactionKeep: z.number().positive().default(HISTORY_COMPACTION_KEEP),
  /** Days before a blocker is flagged stale (default: 3) */
  blockerStaleDays: z.number().positive().default(BLOCKER_STALE_DAYS),
  /** Minutes before an inactive session expires (default: 30) */
  sessionExpiryMinutes: z.number().positive().default(SESSION_EXPIRY_MINUTES),
  /** Codebase map scan max depth (default: 4) */
  mapMaxDepth: z.number().positive().default(4),
  /** Hours before codebase map is considered stale (default: 24) */
  mapMaxAgeHours: z.number().positive().default(MAP_MAX_AGE_HOURS),
  /** Additional directory names to ignore in codebase map scanning */
  mapIgnore: z.array(z.string()).default([]),
  /** Enable auto-generated handoff summaries on task completion (default: true) */
  autoSummary: z.boolean().default(true),
  /** Max log entries included in get_context boot response (default: 5) */
  contextLogLimit: z.number().positive().default(5),
  /** Max rules lines included in get_context boot response (default: 10) */
  contextRulesLimit: z.number().positive().default(10),
});

export type OmniConfig = z.infer<typeof OmniConfigSchema>;

export const DEFAULT_CONFIG: OmniConfig = OmniConfigSchema.parse({});

/**
 * Load raw user configuration from `.omnicode/config.json` if it exists.
 * Returns empty object if file is missing or invalid.
 */
export function loadConfig(omniDir: string): Partial<OmniConfig> {
  const filePath = path.join(omniDir, CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return OmniConfigSchema.partial().parse(raw);
  } catch {
    return {};
  }
}

/** Save user configuration to `.omnicode/config.json`. */
export function saveConfig(omniDir: string, config: Partial<OmniConfig>): void {
  const filePath = path.join(omniDir, CONFIG_FILE);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get effective configuration (merges user config from config.json with defaults).
 */
export function getEffectiveConfig(omniDir?: string): OmniConfig {
  if (!omniDir) {
    return DEFAULT_CONFIG;
  }
  const userConfig = loadConfig(omniDir);
  return OmniConfigSchema.parse(userConfig);
}
