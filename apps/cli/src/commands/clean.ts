/**
 * `omni clean` — Maintenance and disk cleanup for `.omnicode/`.
 *
 * Inspects disk usage, prunes orphaned branch profiles, compacts logs and history,
 * and cleans up stale agent session lock files.
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  resolveOmniRoot,
  getHealthReport,
  pruneOrphanedBranches,
  maybeCompactLog,
  maybeCompactHistory,
} from '@barekit/omnicontext-core';

export const cleanCommand = new Command('clean')
  .description('Run maintenance, compact logs, and prune orphaned branch profiles')
  .option('-b, --branches', 'Prune orphaned branch profiles')
  .option('-l, --logs', 'Force log and history compaction')
  .option('-a, --all', 'Run all maintenance tasks (prune branches + compact logs)')
  .option('-d, --dry-run', 'Show health report without making changes')
  .action((options) => {
    try {
      const projectRoot = resolveOmniRoot() || process.cwd();
      const omniDir = requireOmniDir(projectRoot);

      const beforeReport = getHealthReport(omniDir, projectRoot);

      console.log('');
      console.log('┌─────────────────────────────────────────┐');
      console.log('│         OmniContext Maintenance          │');
      console.log('└─────────────────────────────────────────┘');
      console.log('');
      console.log(`  Disk Size:      ${(beforeReport.totalDiskBytes / 1024).toFixed(1)} KB`);
      console.log(`  Log Entries:    ${beforeReport.logEntries} (${beforeReport.archivedLogEntries} archived)`);
      console.log(`  History Tasks:  ${beforeReport.historyEntries} (${beforeReport.archivedHistoryEntries} archived)`);
      console.log(`  Branch Profiles:${beforeReport.branchProfiles}`);
      console.log(`  Active Sessions:${beforeReport.activeSessions}`);

      if (beforeReport.orphanedBranches.length > 0) {
        console.log(`  ⚠️ Orphaned Branches: ${beforeReport.orphanedBranches.join(', ')}`);
      }

      if (options.dryRun) {
        console.log('');
        console.log('🔍 Dry run complete — no files were modified.');
        console.log('');
        return;
      }

      const runAll = options.all || (!options.branches && !options.logs);
      let prunedBranches: string[] = [];
      let logCompacted = false;
      let historyCompacted = false;

      if (runAll || options.branches) {
        prunedBranches = pruneOrphanedBranches(projectRoot);
      }

      if (runAll || options.logs) {
        logCompacted = maybeCompactLog(omniDir);
        historyCompacted = maybeCompactHistory(omniDir);
      }

      console.log('');
      console.log('✨ Maintenance Complete:');
      if (prunedBranches.length > 0) {
        console.log(`  - Pruned ${prunedBranches.length} orphaned branch profile(s): ${prunedBranches.join(', ')}`);
      } else {
        console.log('  - Branch profiles are clean');
      }

      if (logCompacted) {
        console.log('  - Log file compacted');
      } else {
        console.log('  - Log file size is optimal');
      }

      if (historyCompacted) {
        console.log('  - Task history compacted');
      } else {
        console.log('  - Task history size is optimal');
      }

      const afterReport = getHealthReport(omniDir, projectRoot);
      console.log('');
      console.log(`  Final Disk Size: ${(afterReport.totalDiskBytes / 1024).toFixed(1)} KB`);
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
