/**
 * `omni task` — Manage the active task and blockers.
 *
 * Subcommands:
 *   set <title>         Set a new active task
 *   get                 Print the current active task
 *   clear               Remove the active task
 *   blocker <message>   Add a blocker to the active task
 */

import crypto from 'node:crypto';
import { Command } from 'commander';
import {
  type Blocker,
  requireOmniDir,
  loadContext,
  saveContext,
  appendLogEntry,
  getCurrentBranch,
} from '@barekit/omnicontext-core';

export const taskCommand = new Command('task')
  .description('Manage the active task');

// ---- omni task set <title> ----
taskCommand
  .command('set <title>')
  .description('Set a new active task')
  .action((title: string) => {
    try {
      const omniDir = requireOmniDir();
      const context = loadContext(omniDir);

      context.activeTask = {
        id: crypto.randomUUID(),
        title,
        status: 'active',
        blockers: [],
        updatedAt: new Date().toISOString(),
      };

      saveContext(omniDir, context);

      const branch = getCurrentBranch(process.cwd());
      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'cli',
        message: `Task set: "${title}"`,
        branch: branch ?? undefined,
      });

      console.log(`✅ Active task set to: "${title}"`);
      console.log(`   ID: ${context.activeTask.id}`);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

// ---- omni task get ----
taskCommand
  .command('get')
  .description('Print the current active task')
  .action(() => {
    try {
      const omniDir = requireOmniDir();
      const context = loadContext(omniDir);

      if (!context.activeTask) {
        console.log('No active task. Run "omni task set <title>" to create one.');
        return;
      }

      const task = context.activeTask;
      console.log(`📋 Active Task`);
      console.log(`   Title:    ${task.title}`);
      console.log(`   Status:   ${task.status}`);
      console.log(`   ID:       ${task.id}`);
      console.log(`   Updated:  ${task.updatedAt}`);
      if (task.blockers.length > 0) {
        console.log(`   Blockers: ${task.blockers.length}`);
        task.blockers.forEach((b, i) => {
          console.log(`     ${i + 1}. [${b.source}] ${b.message}`);
        });
      }
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

// ---- omni task clear ----
taskCommand
  .command('clear')
  .description('Remove the active task')
  .action(() => {
    try {
      const omniDir = requireOmniDir();
      const context = loadContext(omniDir);

      if (!context.activeTask) {
        console.log('No active task to clear.');
        return;
      }

      const title = context.activeTask.title;
      context.activeTask = undefined;
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'cli',
        message: `Task cleared: "${title}"`,
        branch: getCurrentBranch(process.cwd()) ?? undefined,
      });

      console.log(`🗑️  Task cleared: "${title}"`);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

// ---- omni task blocker <message> ----
taskCommand
  .command('blocker <message>')
  .description('Add a blocker to the active task')
  .option('-s, --source <source>', 'Source of the blocker', 'cli')
  .action((message: string, opts: { source: string }) => {
    try {
      const omniDir = requireOmniDir();
      const context = loadContext(omniDir);

      if (!context.activeTask) {
        console.error('❌ No active task. Run "omni task set <title>" first.');
        process.exitCode = 1;
        return;
      }

      const blocker: Blocker = {
        message,
        createdAt: new Date().toISOString(),
        source: opts.source,
      };

      context.activeTask.blockers.push(blocker);
      context.activeTask.updatedAt = new Date().toISOString();
      saveContext(omniDir, context);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'cli',
        message: `Blocker added: "${message}"`,
        branch: getCurrentBranch(process.cwd()) ?? undefined,
      });

      console.log(`🚧 Blocker added: "${message}"`);
      console.log(`   Total blockers: ${context.activeTask.blockers.length}`);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
