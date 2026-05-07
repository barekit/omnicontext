/**
 * `omni log` — View and append to the activity log.
 *
 * Usage:
 *   omni log                 Show the 20 most recent log entries
 *   omni log <message>       Append a log entry
 *   omni log -n 50           Show the 50 most recent entries
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  appendLogEntry,
  readLogEntries,
  getCurrentBranch,
} from '@omnicontext/core';

export const logCommand = new Command('log')
  .description('View or append to the activity log')
  .argument('[message]', 'Log message to append')
  .option('-n, --lines <count>', 'Number of recent entries to show', '20')
  .action((message: string | undefined, opts: { lines: string }) => {
    try {
      const omniDir = requireOmniDir();

      if (message) {
        // Append mode
        const branch = getCurrentBranch(process.cwd());
        appendLogEntry(omniDir, {
          timestamp: new Date().toISOString(),
          source: 'cli',
          message,
          branch: branch ?? undefined,
        });
        console.log(`📝 Logged: "${message}"`);
      } else {
        // Read mode
        const limit = parseInt(opts.lines, 10) || 20;
        const entries = readLogEntries(omniDir, limit);

        if (entries.length === 0) {
          console.log('No log entries yet. Run "omni log <message>" to add one.');
          return;
        }

        console.log(`📜 Activity Log (last ${entries.length} entries)\n`);
        for (const entry of entries) {
          const time = new Date(entry.timestamp).toLocaleString();
          const branchTag = entry.branch ? ` [${entry.branch}]` : '';
          const sourceTag = `(${entry.source})`;
          console.log(`  ${time}${branchTag} ${sourceTag} ${entry.message}`);
        }
      }
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
