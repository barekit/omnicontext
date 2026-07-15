#!/usr/bin/env node

/**
 * OmniContext CLI entry point.
 *
 * A local project memory layer for AI coding agents.
 * Manages tasks, rules, and context via the `.omnicode/` directory
 * and exposes them through a Model Context Protocol (MCP) server.
 *
 * Usage:
 *   omni init [--setup-mcp]       Initialize .omnicode/ (optionally configure agents)
 *   omni setup [agent]            Auto-configure MCP in Cursor, Claude Desktop, etc.
 *   omni task set <title>         Set the active task
 *   omni task get                 Print the active task
 *   omni task clear               Remove the active task
 *   omni task blocker <message>   Add a blocker
 *   omni log [message]            View or append to the activity log
 *   omni rules                    View global rules
 *   omni rules append <rule>      Add a new rule
 *   omni rules edit               Open rules.md in $EDITOR
 *   omni history                  View completed task history
 *   omni status                   Dashboard summary
 *   omni mcp start [--watch]      Start the MCP server
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { setupCommand } from './commands/setup.js';
import { taskCommand } from './commands/task.js';
import { logCommand } from './commands/log.js';
import { rulesCommand } from './commands/rules.js';
import { historyCommand } from './commands/history.js';
import { statusCommand } from './commands/status.js';
import { startMcpServer } from './mcp/server.js';

const program = new Command();

program
  .name('omni')
  .description('OmniContext — AI agent project memory layer')
  .version('0.1.8');

// Register command modules
program.addCommand(initCommand);
program.addCommand(setupCommand);
program.addCommand(taskCommand);
program.addCommand(logCommand);
program.addCommand(rulesCommand);
program.addCommand(historyCommand);
program.addCommand(statusCommand);

// MCP server command
const mcpCommand = new Command('mcp')
  .description('Model Context Protocol server management');

mcpCommand
  .command('start')
  .description('Start the OmniContext MCP server (stdio transport)')
  .option('--watch', 'Enable git branch watching for automatic context switching')
  .action(async (opts) => {
    await startMcpServer({ watch: opts.watch });
  });

program.addCommand(mcpCommand);

program.parse();
