/**
 * `omni config` — Manage project-level configuration.
 *
 * Displays or updates `.omnicode/config.json`.
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  resolveOmniRoot,
  loadConfig,
  saveConfig,
  getEffectiveConfig,
} from '@barekit/omnicontext-core';

export const configCommand = new Command('config')
  .description('View or update project configuration (.omnicode/config.json)')
  .action(() => {
    try {
      const projectRoot = resolveOmniRoot() || process.cwd();
      const omniDir = requireOmniDir(projectRoot);
      const effective = getEffectiveConfig(omniDir);

      console.log('');
      console.log('┌─────────────────────────────────────────┐');
      console.log('│         OmniContext Configuration       │');
      console.log('└─────────────────────────────────────────┘');
      console.log('');
      console.log(JSON.stringify(effective, null, 2));
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration property (e.g. omni config set autoSummary false)')
  .action((key: string, value: string) => {
    try {
      const projectRoot = resolveOmniRoot() || process.cwd();
      const omniDir = requireOmniDir(projectRoot);
      const current = loadConfig(omniDir);

      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);

      (current as any)[key] = parsedValue;
      saveConfig(omniDir, current);

      console.log(`✨ Config set: ${key} = ${JSON.stringify(parsedValue)}`);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to default values')
  .action(() => {
    try {
      const projectRoot = resolveOmniRoot() || process.cwd();
      const omniDir = requireOmniDir(projectRoot);
      saveConfig(omniDir, { autoSummary: true });
      console.log('✨ Configuration reset to default.');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
