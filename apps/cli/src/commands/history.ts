/**
 * `omni history` — View completed/replaced task history.
 *
 * Shows a timeline of past tasks, when they were archived,
 * and why (completed, replaced, or cleared).
 *
 * Usage:
 *   omni history           Show last 10 tasks
 *   omni history -n 25     Show last 25 tasks
 *   omni history --json    Machine-readable JSON output
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  readHistory,
} from '@barekit/omnicontext-core';

export const historyCommand = new Command('history')
  .description('View completed/replaced task history')
  .option('-n, --count <number>', 'Number of entries to show', '10')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    try {
      const omniDir = requireOmniDir();
      const count = parseInt(opts.count, 10) || 10;
      const entries = readHistory(omniDir, count);

      if (entries.length === 0) {
        console.log('📭 No task history yet. Tasks appear here when completed or replaced.');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      console.log(`📋 Task History (last ${entries.length})\n`);

      for (const entry of entries) {
        const date = new Date(entry.archivedAt);
        const timeStr = date.toLocaleString();
        const statusIcon = entry.reason === 'completed' ? '✅'
          : entry.reason === 'replaced' ? '🔄'
          : '🗑️';

        console.log(`  ${statusIcon} ${entry.task.title}`);
        console.log(`     ${entry.reason} • ${timeStr}`);
        if (entry.branch) {
          console.log(`     branch: ${entry.branch}`);
        }
        if (entry.task.blockers.length > 0) {
          console.log(`     blockers: ${entry.task.blockers.length}`);
        }
        console.log();
      }
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
