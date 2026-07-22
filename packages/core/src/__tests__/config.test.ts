import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  scaffoldOmniDir,
  getEffectiveConfig,
  saveConfig,
  loadConfig,
  DEFAULT_CONFIG,
} from '../index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnicontext-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Config Manager', () => {
  it('returns default config when omniDir is empty or config.json is missing', () => {
    const config = getEffectiveConfig();
    expect(config.logCompactionThreshold).toBe(DEFAULT_CONFIG.logCompactionThreshold);
    expect(config.autoSummary).toBe(true);
    expect(config.mapMaxDepth).toBe(4);
  });

  it('scaffolds config.json with autoSummary during omni init', () => {
    const omniDir = scaffoldOmniDir(tmpDir);
    const userConfig = loadConfig(omniDir);
    expect(userConfig.autoSummary).toBe(true);
  });

  it('loads custom configuration overrides correctly', () => {
    const omniDir = scaffoldOmniDir(tmpDir);
    saveConfig(omniDir, {
      logCompactionThreshold: 500,
      mapMaxDepth: 8,
      mapIgnore: ['custom_dir'],
    });

    const effective = getEffectiveConfig(omniDir);
    expect(effective.logCompactionThreshold).toBe(500);
    expect(effective.mapMaxDepth).toBe(8);
    expect(effective.mapIgnore).toEqual(['custom_dir']);
    expect(effective.autoSummary).toBe(true); // default preserved
  });
});
