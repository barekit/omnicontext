/**
 * Tests for @omnicontext/core file I/O utilities.
 *
 * Uses a temporary directory to simulate a real `.omnicode/` project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  scaffoldOmniDir,
  ensureGitignore,
  loadContext,
  saveContext,
  loadRules,
  saveRules,
  appendLogEntry,
  readLogEntries,
  resolveOmniRoot,
  getCurrentBranch,
  OMNICODE_DIR,
  TASK_FILE,
  RULES_FILE,
  LOG_FILE,
  BRANCHES_DIR,
} from '../index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnicontext-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scaffoldOmniDir
// ---------------------------------------------------------------------------

describe('scaffoldOmniDir', () => {
  it('creates the .omnicode directory structure and agent rules', () => {
    scaffoldOmniDir(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, OMNICODE_DIR))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, OMNICODE_DIR, TASK_FILE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, OMNICODE_DIR, RULES_FILE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, OMNICODE_DIR, LOG_FILE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, OMNICODE_DIR, BRANCHES_DIR))).toBe(true);

    // Verify agent rules files are created
    expect(fs.existsSync(path.join(tmpDir, '.cursorrules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.clinerules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'AGENTS.md'))).toBe(true);

    const cursorRulesContent = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf-8');
    expect(cursorRulesContent).toContain('OmniContext Integration Rule');
  });

  it('creates valid task.json', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);
    const context = loadContext(omniDir);

    expect(context.version).toBe('1.0.0');
    expect(context.activeTask).toBeUndefined();
    expect(context.globalRulesPath).toContain(RULES_FILE);
  });

  it('throws if directory already exists', () => {
    scaffoldOmniDir(tmpDir);
    expect(() => scaffoldOmniDir(tmpDir)).toThrow('already exists');
  });
});

// ---------------------------------------------------------------------------
// ensureGitignore
// ---------------------------------------------------------------------------

describe('ensureGitignore', () => {
  it('creates .gitignore if it does not exist', () => {
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.omnicode/');
  });

  it('appends to existing .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n');
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.omnicode/');
  });

  it('does not duplicate entry', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.omnicode/\n');
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const occurrences = content.split('.omnicode/').length - 1;
    expect(occurrences).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// loadContext / saveContext
// ---------------------------------------------------------------------------

describe('loadContext / saveContext', () => {
  it('round-trips a context correctly', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);

    const context = loadContext(omniDir);
    context.activeTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test',
      status: 'active',
      blockers: [],
      updatedAt: new Date().toISOString(),
    };
    saveContext(omniDir, context);

    const reloaded = loadContext(omniDir);
    expect(reloaded.activeTask?.title).toBe('Test');
  });

  it('throws on missing task.json', () => {
    expect(() => loadContext(tmpDir)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadRules / saveRules
// ---------------------------------------------------------------------------

describe('loadRules / saveRules', () => {
  it('reads default rules after scaffold', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);
    const rules = loadRules(omniDir);
    expect(rules).toContain('Global Rules');
  });

  it('overwrites rules', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);
    saveRules(omniDir, '# Custom Rules\n- Always use TypeScript\n');
    const rules = loadRules(omniDir);
    expect(rules).toContain('Always use TypeScript');
  });
});

// ---------------------------------------------------------------------------
// appendLogEntry / readLogEntries
// ---------------------------------------------------------------------------

describe('appendLogEntry / readLogEntries', () => {
  it('appends and reads log entries', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);

    appendLogEntry(omniDir, {
      timestamp: new Date().toISOString(),
      source: 'cli',
      message: 'First entry',
    });
    appendLogEntry(omniDir, {
      timestamp: new Date().toISOString(),
      source: 'agent',
      message: 'Second entry',
      branch: 'main',
    });

    const entries = readLogEntries(omniDir);
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe('First entry');
    expect(entries[1].branch).toBe('main');
  });

  it('respects the limit parameter', () => {
    scaffoldOmniDir(tmpDir);
    const omniDir = path.join(tmpDir, OMNICODE_DIR);

    for (let i = 0; i < 10; i++) {
      appendLogEntry(omniDir, {
        timestamp: new Date().toISOString(),
        source: 'cli',
        message: `Entry ${i}`,
      });
    }

    const entries = readLogEntries(omniDir, 3);
    expect(entries).toHaveLength(3);
    expect(entries[0].message).toBe('Entry 7'); // last 3
  });

  it('returns empty array for missing log file', () => {
    const entries = readLogEntries(tmpDir);
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveOmniRoot
// ---------------------------------------------------------------------------

describe('resolveOmniRoot', () => {
  it('finds .omnicode in the given directory', () => {
    scaffoldOmniDir(tmpDir);
    const root = resolveOmniRoot(tmpDir);
    expect(root).toBe(tmpDir);
  });

  it('finds .omnicode in a parent directory', () => {
    scaffoldOmniDir(tmpDir);
    const nested = path.join(tmpDir, 'src', 'lib');
    fs.mkdirSync(nested, { recursive: true });

    const root = resolveOmniRoot(nested);
    expect(root).toBe(tmpDir);
  });

  it('returns null when not found', () => {
    const root = resolveOmniRoot(tmpDir);
    expect(root).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentBranch
// ---------------------------------------------------------------------------

describe('getCurrentBranch', () => {
  it('returns null when .git does not exist', () => {
    const branch = getCurrentBranch(tmpDir);
    expect(branch).toBeNull();
  });

  it('reads branch from .git/HEAD', () => {
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/auth\n');

    const branch = getCurrentBranch(tmpDir);
    expect(branch).toBe('feature/auth');
  });

  it('returns null for detached HEAD', () => {
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'abc123def456\n');

    const branch = getCurrentBranch(tmpDir);
    expect(branch).toBeNull();
  });
});
