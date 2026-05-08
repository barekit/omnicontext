/**
 * Git change detection.
 *
 * Provides a compact summary of files changed since the agent session started,
 * or against the current git branch.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

/**
 * Get files changed in the working directory (uncommitted and staged).
 * Returns a compact summary.
 */
export function getChangedFiles(projectRoot: string): string {
  try {
    // git status --porcelain
    // Returns lines like:
    //  M src/api.ts
    // ?? new-file.ts
    // D  deleted.ts
    const output = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 5000,
    });

    const lines = output.split('\n').filter(l => l.trim().length > 0);

    if (lines.length === 0) {
      return 'No uncommitted changes in the working directory.';
    }

    // Limit to 20 files to prevent token explosion
    const limit = 20;
    const isTruncated = lines.length > limit;
    const displayLines = lines.slice(0, limit);

    const parts = [`Changed files (${lines.length} total):`];
    for (const line of displayLines) {
      parts.push(`  ${line}`);
    }

    if (isTruncated) {
      parts.push(`  ... and ${lines.length - limit} more`);
    }

    return parts.join('\n');
  } catch {
    return 'Git not available or not a git repository.';
  }
}
