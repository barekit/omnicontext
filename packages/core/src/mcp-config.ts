/**
 * MCP Configuration auto-wiring for AI coding agents.
 *
 * Detects installed agents (Cursor, Claude Desktop, Windsurf) and injects
 * the OmniContext MCP server entry into their configuration files.
 *
 * This eliminates the biggest adoption friction point: manually editing
 * JSON config files after `omni init`.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { KNOWN_AGENT_CONFIGS } from './constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupResult {
  agent: string;
  name: string;
  configPath: string;
  status: 'configured' | 'already-configured' | 'created' | 'not-found' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expand `~` in a path to the user's home directory. */
function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * Generate the MCP server entry for OmniContext.
 * Uses `npx` so no global install is required.
 */
function getOmnicontextMcpEntry() {
  return {
    command: 'npx',
    args: ['-y', '@barekit/omnicontext', 'mcp', 'start', '--watch'],
  };
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Detect which agents are installed by checking if their config paths
 * exist (or their parent directories exist).
 */
export function detectInstalledAgents(): string[] {
  const installed: string[] = [];

  for (const [key, config] of Object.entries(KNOWN_AGENT_CONFIGS)) {
    const configPath = expandHome(config.configPath);
    const configDir = path.dirname(configPath);

    // If the config file or its parent directory exists, the agent is likely installed
    if (fs.existsSync(configPath) || fs.existsSync(configDir)) {
      installed.push(key);
    }
  }

  return installed;
}

/**
 * Inject the OmniContext MCP server entry into a single agent's config.
 *
 * - If the config file doesn't exist, creates it with just the omnicontext entry.
 * - If it exists and already has omnicontext, skips.
 * - If it exists without omnicontext, adds the entry.
 */
export function setupAgentConfig(agentKey: string): SetupResult {
  const agentInfo = KNOWN_AGENT_CONFIGS[agentKey];
  if (!agentInfo) {
    return {
      agent: agentKey,
      name: agentKey,
      configPath: '',
      status: 'error',
      message: `Unknown agent: "${agentKey}". Known agents: ${Object.keys(KNOWN_AGENT_CONFIGS).join(', ')}`,
    };
  }

  const configPath = expandHome(agentInfo.configPath);
  const configDir = path.dirname(configPath);

  // Check if the agent directory exists
  if (!fs.existsSync(configDir)) {
    return {
      agent: agentKey,
      name: agentInfo.name,
      configPath,
      status: 'not-found',
      message: `${agentInfo.name} not detected (${configDir} does not exist)`,
    };
  }

  try {
    let config: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    }

    // Ensure mcpServers key exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Check if already configured
    if (config.mcpServers.omnicontext) {
      return {
        agent: agentKey,
        name: agentInfo.name,
        configPath,
        status: 'already-configured',
        message: `${agentInfo.name} already has OmniContext configured`,
      };
    }

    // Inject the entry
    config.mcpServers.omnicontext = getOmnicontextMcpEntry();

    // Write back
    const existed = fs.existsSync(configPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    return {
      agent: agentKey,
      name: agentInfo.name,
      configPath,
      status: existed ? 'configured' : 'created',
      message: existed
        ? `Added OmniContext to ${agentInfo.name} config`
        : `Created ${agentInfo.name} config with OmniContext`,
    };
  } catch (err: any) {
    return {
      agent: agentKey,
      name: agentInfo.name,
      configPath,
      status: 'error',
      message: `Failed to configure ${agentInfo.name}: ${err.message}`,
    };
  }
}

/**
 * Auto-detect installed agents and configure all of them.
 * If a specific agent key is provided, only configure that one.
 */
export function setupAllAgents(targetAgent?: string): SetupResult[] {
  if (targetAgent) {
    return [setupAgentConfig(targetAgent)];
  }

  const installed = detectInstalledAgents();
  if (installed.length === 0) {
    return [{
      agent: 'none',
      name: 'None',
      configPath: '',
      status: 'not-found',
      message: 'No supported AI coding agents detected. Supported: ' +
        Object.entries(KNOWN_AGENT_CONFIGS).map(([k, v]) => `${v.name} (${k})`).join(', '),
    }];
  }

  return installed.map((agentKey) => setupAgentConfig(agentKey));
}
