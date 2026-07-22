/**
 * Auto-generated handoff summary for OmniContext.
 *
 * When an active task is marked as "completed", OmniContext automatically
 * generates a structured handoff summary capturing git diff statistics,
 * session log entries, and blocker resolution stats.
 */

import { execSync } from 'node:child_process';
import type { Task, LogEntry } from './schemas.js';

export interface AutoSummaryInput {
  /** The completed task. */
  task: Task;
  /** Activity log entries recorded during the task session. */
  logEntries: LogEntry[];
  /** Git diff stat summary between task start gitRef and current HEAD. */
  gitDiffSummary: string;
  /** Current Git branch name. */
  branch: string | null;
}

/** Get current HEAD commit SHA (returns null if git unavailable or no commits). */
export function getHeadCommitSha(projectRoot: string): string | null {
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Get compact git diff stat between `fromRef` and current working directory/HEAD.
 * Strictly hard-capped at max 15 lines (~500 tokens) to prevent context explosion.
 */
export function getGitDiffSummary(projectRoot: string, fromRef?: string): string {
  try {
    let output = '';
    if (fromRef) {
      // Diff against starting commit
      output = execSync(`git diff --stat ${fromRef}`, {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } else {
      // Fallback: diff working tree
      output = execSync('git diff --stat HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 5000,
      });
    }

    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return 'No file changes recorded.';
    }

    // STRICT HARD-CAP: Max 15 lines (~500 tokens)
    const MAX_LINES = 15;
    if (lines.length > MAX_LINES) {
      const displayLines = lines.slice(0, MAX_LINES - 1);
      const summaryLine = lines[lines.length - 1]; // keep final summary line (e.g. "5 files changed...")
      return [...displayLines, `... [truncated] ...`, summaryLine].join('\n');
    }

    return lines.join('\n');
  } catch {
    return 'No git diff available.';
  }
}

/** Format relative duration in human readable form (e.g. "45m", "2h 10m"). */
function formatDuration(isoStart?: string, isoEnd?: string): string {
  if (!isoStart) return 'unknown';
  const start = new Date(isoStart).getTime();
  const end = isoEnd ? new Date(isoEnd).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

/**
 * Generate a clean, structured markdown handoff summary.
 */
export function generateAutoSummary(input: AutoSummaryInput): string {
  const { task, logEntries, gitDiffSummary, branch } = input;

  const duration = formatDuration(task.startedAt, task.updatedAt);
  const lines: string[] = [];

  lines.push('# Handoff Summary (Auto-Generated)');
  lines.push('');
  lines.push(`## Task: "${task.title}" [completed]`);
  lines.push(`- **Branch**: \`${branch ?? 'detached'}\``);
  lines.push(`- **Duration**: ${duration}`);
  lines.push(`- **Completed**: ${new Date(task.updatedAt).toLocaleString()}`);

  // Git changes
  lines.push('');
  lines.push('## Files Changed');
  lines.push('```');
  lines.push(gitDiffSummary);
  lines.push('```');

  // Key activity log
  if (logEntries.length > 0) {
    lines.push('');
    lines.push('## Session Activity');
    for (const entry of logEntries.slice(-10)) {
      lines.push(`- [${entry.source}] ${entry.message}`);
    }
  }

  // Blockers summary
  lines.push('');
  lines.push(`## Blockers Resolved: ${task.blockers.length}`);

  return lines.join('\n');
}
