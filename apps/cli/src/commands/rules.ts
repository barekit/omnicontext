/**
 * `omni rules` — View and manage global project rules.
 *
 * Usage:
 *   omni rules              Print the current rules.md content
 *   omni rules append <r>   Append a new rule line
 *   omni rules edit         Open rules.md in $EDITOR
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { Command } from 'commander';
import {
  RULES_FILE,
  requireOmniDir,
  loadRules,
  saveRules,
  appendLogEntry,
  getCurrentBranch,
} from '@omnicontext/core';

export const rulesCommand = new Command('rules')
  .description('View and manage global project rules')
  .action(() => {
    // Default action: print rules
    try {
      const omniDir = requireOmniDir();
      const content = loadRules(omniDir);
      console.log(content);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

// ---- omni rules append <rule> ----
rulesCommand
  .command('append <rule>')
  .description('Append a new rule to rules.md')
  .action((rule: string) => {
    try {
      const omniDir = requireOmniDir();
      const current = loadRules(omniDir);
      const updated = current.trimEnd() + `\n- ${rule}\n`;
      saveRules(omniDir, updated);

      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'cli',
        message: `Rule added: "${rule}"`,
        branch: getCurrentBranch(process.cwd()) ?? undefined,
      });

      console.log(`✅ Rule appended: "${rule}"`);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

// ---- omni rules edit ----
rulesCommand
  .command('edit')
  .description('Open rules.md in your $EDITOR')
  .action(() => {
    try {
      const omniDir = requireOmniDir();
      const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
      const rulesPath = path.join(omniDir, RULES_FILE);

      console.log(`Opening ${rulesPath} in ${editor}...`);
      execSync(`${editor} "${rulesPath}"`, { stdio: 'inherit' });
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
