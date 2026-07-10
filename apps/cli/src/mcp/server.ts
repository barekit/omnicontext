/**
 * OmniContext MCP Server.
 *
 * A local Model Context Protocol server that exposes project context
 * (tasks, rules, logs) to AI coding agents via the stdio transport.
 *
 * Supports optional git-awareness mode (--watch) that automatically
 * swaps the active context when the developer changes branches.
 */

// @ts-ignore - Server is marked deprecated in favor of high-level McpServer, but we need low-level for dynamic routing
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// @ts-ignore - Schemas are marked deprecated in favor of McpServer, but required for low-level Server
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import {
  resolveOmniRoot,
  OMNICODE_DIR,
  GitWatcher,
  ProfileManager,
  getOrBuildIndex,
  type BranchChangeEvent,
} from '@barekit/omnicontext-core';
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

  const server = new Server(
    { name: 'omnicontext-mcp', version: '0.1.4' },
    { capabilities: { resources: {}, tools: {} } },
  );

  // ---- Resources ----
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const root = resolveOmniRoot(projectRoot);
    if (!root) {
      if (request.params.uri === 'context://instructions') {
        return {
          contents: [readResource(request.params.uri, '', projectRoot)],
        };
      }
      throw new Error(
        'OmniContext not initialized. Run "omni init" in your project root first.',
      );
    }
    const omniDir = path.join(root, OMNICODE_DIR);
    return {
      contents: [readResource(request.params.uri, omniDir, projectRoot)],
    };
  });

  // ---- Tools ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const root = resolveOmniRoot(projectRoot);

    const noOmniDirTools = ['search_codebase', 'read_file_smart', 'get_changed_files'];
    if (!root && !noOmniDirTools.includes(request.params.name)) {
      return {
        content: [{
          type: 'text',
          text: 'Error: OmniContext not initialized. Run "omni init" in your project root first.',
        }],
        isError: true,
      };
    }

    const omniDir = root ? path.join(root, OMNICODE_DIR) : '';
    const result = await executeTool(request.params.name, args, omniDir, projectRoot);
    return result as any;
  });

  // ---- Git Watcher (optional) ----
  let gitWatcher: GitWatcher | null = null;

  if (options.watch) {
    const profileManager = new ProfileManager(projectRoot);
    gitWatcher = new GitWatcher(projectRoot);

    gitWatcher.on('branch-changed', (event: BranchChangeEvent) => {
      try {
        profileManager.swapProfile(event.oldBranch, event.newBranch);
        process.stderr.write(
          `[omnicontext] Branch switched: ${event.oldBranch ?? 'detached'} → ${event.newBranch ?? 'detached'}\n`,
        );
      } catch (err: any) {
        process.stderr.write(
          `[omnicontext] Error swapping branch profile: ${err.message}\n`,
        );
      }
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

  // ---- Background Indexing ----
  // Kick off an async index build/load to warm the cache.
  getOrBuildIndex(projectRoot).catch((err) => {
    process.stderr.write(`[omnicontext] Background index error: ${err.message}\n`);
  });

  // ---- Start ----
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
