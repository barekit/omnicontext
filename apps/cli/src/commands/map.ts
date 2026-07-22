/**
 * `omni map` — Generate and display the codebase map.
 *
 * Scans project files and extracts one-line summaries and exported symbols
 * for instant LLM architectural awareness.
 */

import { Command } from 'commander';
import {
  requireOmniDir,
  resolveOmniRoot,
  generateCodebaseMap,
  formatCodebaseMapCompact,
  loadCachedMap,
  saveCachedMap,
} from '@barekit/omnicontext-core';

export const mapCommand = new Command('map')
  .description('Generate or view the codebase file & architecture map')
  .option('-r, --refresh', 'Force re-generation of the codebase map')
  .option('-c, --compact', 'Print compact tree representation for LLM context')
  .action((options) => {
    try {
      const projectRoot = resolveOmniRoot() || process.cwd();
      const omniDir = requireOmniDir(projectRoot);

      let map = options.refresh ? null : loadCachedMap(omniDir);

      if (!map) {
        process.stdout.write('🔍 Mapping codebase structure...\n');
        map = generateCodebaseMap(projectRoot);
        saveCachedMap(omniDir, map);
      }

      if (options.compact) {
        console.log(formatCodebaseMapCompact(map));
        return;
      }

      console.log('');
      console.log('┌─────────────────────────────────────────┐');
      console.log('│           Codebase Map Summary          │');
      console.log('└─────────────────────────────────────────┘');
      console.log('');
      console.log(`  Project:    ${map.projectRoot}`);
      console.log(`  Files:      ${map.totalFiles} mapped files`);
      console.log(`  Generated:  ${new Date(map.generatedAt).toLocaleString()}`);
      console.log('');

      const compact = formatCodebaseMapCompact(map);
      const lines = compact.split('\n').slice(1); // skip header line
      for (const line of lines.slice(0, 20)) {
        console.log(`  ${line}`);
      }

      if (lines.length > 20) {
        console.log(`  ... and ${lines.length - 20} more lines (use --compact to view all)`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  });
