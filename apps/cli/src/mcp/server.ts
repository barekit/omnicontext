/**
 * OmniContext MCP Server.
 *
 * A local Model Context Protocol server that exposes project context
 * (tasks, rules, logs) to AI coding agents via the stdio transport.
 *
 * Supports optional git-awareness mode (--watch) that automatically
 * swaps the active context when the developer changes branches.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  requireOmniDir,
  GitWatcher,
  ProfileManager,
  type BranchChangeEvent,
} from '@omnicontext/core';
import { listResources, readResource } from './resources.js';
import { listTools, executeTool } from './tools.js';

export interface McpServerOptions {
  /** Enable git branch watching for automatic context switching. */
  watch?: boolean;
}

/**
 * Create and start the OmniContext MCP server.
 * Resolves the `.omnicode/` directory, wires up resource and tool handlers,
 * and connects via stdio transport.
 */
export async function startMcpServer(options: McpServerOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const omniDir = requireOmniDir(projectRoot);

  const server = new Server(
    { name: 'omnicontext-mcp', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } },
  );

  // ---- Resources ----
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
    contents: [readResource(request.params.uri, omniDir, projectRoot)],
  }));

  // ---- Tools ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = executeTool(request.params.name, args, omniDir, projectRoot);
    return result as any;
  });

  // ---- Git Watcher (optional) ----
  let gitWatcher: GitWatcher | null = null;

  if (options.watch) {
    const profileManager = new ProfileManager(projectRoot);
    gitWatcher = new GitWatcher(projectRoot);

    gitWatcher.on('branch-changed', (event: BranchChangeEvent) => {
      profileManager.swapProfile(event.oldBranch, event.newBranch);
      process.stderr.write(
        `[omnicontext] Branch switched: ${event.oldBranch ?? 'detached'} → ${event.newBranch ?? 'detached'}\n`,
      );
    });

    gitWatcher.on('error', (err: Error) => {
      process.stderr.write(`[omnicontext] Git watcher error: ${err.message}\n`);
    });

    gitWatcher.start();
    process.stderr.write(
      `[omnicontext] Git watcher active (branch: ${gitWatcher.getCurrentBranch() ?? 'detached'})\n`,
    );
  }

  // ---- Graceful shutdown ----
  const cleanup = async () => {
    if (gitWatcher) {
      await gitWatcher.stop();
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // ---- Start ----
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
