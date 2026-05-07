/**
 * `omni setup` — Auto-configure MCP in AI coding agents.
 *
 * Detects installed agents (Cursor, Claude Desktop, Windsurf) and injects
 * the OmniContext MCP server entry into their config files.
 *
 * Usage:
 *   omni setup               Auto-detect and configure all installed agents
 *   omni setup cursor        Configure Cursor only
 *   omni setup claude-desktop Configure Claude Desktop only
 */

import { Command } from 'commander';
import {
  setupAllAgents,
  KNOWN_AGENT_CONFIGS,
} from '@omnicontext/core';

export const setupCommand = new Command('setup')
  .description('Auto-configure OmniContext MCP server in your AI coding agents')
  .argument('[agent]', 'Specific agent to configure (cursor, claude-desktop, windsurf)')
  .action((agent?: string) => {
    console.log('🔌 Setting up OmniContext MCP server...\n');

    const results = setupAllAgents(agent);

    for (const result of results) {
      switch (result.status) {
        case 'configured':
          console.log(`  ✅ ${result.name} — configured`);
          console.log(`     ${result.configPath}`);
          break;
        case 'created':
          console.log(`  ✅ ${result.name} — config created`);
          console.log(`     ${result.configPath}`);
          break;
        case 'already-configured':
          console.log(`  ⏭️  ${result.name} — already configured`);
          break;
        case 'not-found':
          console.log(`  ⚠️  ${result.name} — not detected`);
          break;
        case 'error':
          console.error(`  ❌ ${result.message}`);
          break;
      }
    }

    const configured = results.filter(r => r.status === 'configured' || r.status === 'created');
    if (configured.length > 0) {
      console.log('\n🎉 Done! Restart your agent to activate OmniContext.');
      console.log('   The MCP server uses npx — no global install needed.');
    } else if (results.every(r => r.status === 'already-configured')) {
      console.log('\n✅ All agents already configured. No changes needed.');
    } else {
      console.log('\n💡 Supported agents:');
      for (const [key, info] of Object.entries(KNOWN_AGENT_CONFIGS)) {
        console.log(`   - ${info.name} (${key}): ${info.docs}`);
      }
    }
  });
