/**
 * `omni status` — Dashboard-style summary of the current OmniContext state.
 *
 * Displays branch, active task, blocker count, and rules summary at a glance.
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  loadContext,
  loadRules,
  readLogEntries,
  getCurrentBranch,
} from '@barekit/omnicontext-core';

export const statusCommand = new Command('status')
  .description('Show a summary of the current OmniContext state')
  .action(() => {
    try {
      const omniDir = requireOmniDir();
      const context = loadContext(omniDir);
      const branch = getCurrentBranch(process.cwd());
      const logEntries = readLogEntries(omniDir, 5);

      console.log('');
      console.log('┌─────────────────────────────────────────┐');
      console.log('│           OmniContext Status             │');
      console.log('└─────────────────────────────────────────┘');
      console.log('');
      console.log(`  Branch:   ${branch ?? 'detached HEAD'}`);
      console.log(`  Version:  ${context.version}`);
      console.log('');

      if (context.activeTask) {
        const task = context.activeTask;
        const statusIcon =
          task.status === 'active' ? '🟢' :
          task.status === 'blocked' ? '🔴' : '✅';

        console.log(`  ${statusIcon} Task: ${task.title}`);
        console.log(`     Status:   ${task.status}`);
        console.log(`     Blockers: ${task.blockers.length}`);
        console.log(`     Updated:  ${new Date(task.updatedAt).toLocaleString()}`);

        if (task.blockers.length > 0) {
          console.log('');
          console.log('  🚧 Blockers:');
          task.blockers.forEach((b, i) => {
            console.log(`     ${i + 1}. [${b.source}] ${b.message}`);
          });
        }
      } else {
        console.log('  ⚪ No active task');
      }

      // Rules summary
      try {
        const rules = loadRules(omniDir);
        const ruleLines = rules
          .split('\n')
          .filter((l) => l.trim().startsWith('-'))
          .length;
        console.log('');
        console.log(`  📏 Rules: ${ruleLines} rule${ruleLines === 1 ? '' : 's'} defined`);
      } catch {
        // rules.md might not exist
      }

      // Recent log entries
      if (logEntries.length > 0) {
        console.log('');
        console.log('  📜 Recent Activity:');
        for (const entry of logEntries.slice(-3)) {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          console.log(`     ${time} (${entry.source}) ${entry.message}`);
        }
      }

      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
