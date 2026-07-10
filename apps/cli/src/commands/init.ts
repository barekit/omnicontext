/**
 * `omni init` — Initialize OmniContext in the current project.
 *
 * Creates the `.omnicode/` directory with default task.json, rules.md,
 * log.jsonl, history.jsonl, and branches/ directory. Adds `.omnicode/` to .gitignore.
 *
 * Options:
 *   --force       Re-initialize even if .omnicode already exists
 *   --setup-mcp   Auto-configure MCP in detected AI coding agents
 */

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import {
  OMNICODE_DIR,
  scaffoldOmniDir,
  ensureGitignore,
  getCurrentBranch,
  setupAllAgents,
  getOrBuildIndex,
} from '@barekit/omnicontext-core';

export const initCommand = new Command('init')
  .description('Initialize OmniContext in the current directory')
  .option('--force', 'Re-initialize even if .omnicode already exists')
  .option('--setup-mcp [agent]', 'Auto-configure MCP in AI coding agents (cursor, claude-desktop, windsurf, antigravity, cline, roo-code, claude-code, vscode)')
  .action(async (opts) => {
    const cwd = process.cwd();

    try {
      if (opts.force) {
        const existing = path.join(cwd, OMNICODE_DIR);
        if (fs.existsSync(existing)) {
          fs.rmSync(existing, { recursive: true, force: true });
        }
      }

      scaffoldOmniDir(cwd);
      ensureGitignore(cwd);

      const branch = getCurrentBranch(cwd);
      console.log('✅ OmniContext initialized successfully.');
      if (branch) {
        console.log(`   Branch: ${branch}`);
      }
      console.log('   Created: .omnicode/task.json');
      console.log('   Created: .omnicode/rules.md');
      console.log('   Created: .omnicode/log.jsonl');
      console.log('   Created: .omnicode/history.jsonl');

      process.stdout.write('\n🧠 Building codebase intelligence index... ');
      await getOrBuildIndex(cwd);
      console.log('Done.');

      // Auto-configure MCP if requested
      if (opts.setupMcp !== undefined) {
        console.log('\n🔌 Configuring MCP in AI coding agents...\n');
        const agent = typeof opts.setupMcp === 'string' ? opts.setupMcp : undefined;
        const results = setupAllAgents(agent);

        for (const result of results) {
          switch (result.status) {
            case 'configured':
            case 'created':
              console.log(`   ✅ ${result.name} — configured`);
              break;
            case 'already-configured':
              console.log(`   ⏭️  ${result.name} — already configured`);
              break;
            case 'not-found':
              console.log(`   ⚠️  ${result.name} — not detected`);
              break;
            case 'error':
              console.error(`   ❌ ${result.message}`);
              break;
          }
        }
      } else {
        console.log('\n   💡 Tip: Run "omni setup" to auto-configure Cursor, Claude Desktop, etc.');
      }
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.error('❌ .omnicode directory already exists. Use --force to re-initialize.');
      } else {
        console.error(`❌ Failed to initialize: ${err.message}`);
      }
      process.exitCode = 1;
    }
  });
