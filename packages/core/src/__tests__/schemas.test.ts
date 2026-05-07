/**
 * Tests for @omnicontext/core Zod schemas.
 *
 * Validates that schemas accept correct data and reject malformed input.
 */

import { describe, it, expect } from 'vitest';
import {
  BlockerSchema,
  TaskSchema,
  LogEntrySchema,
  ProjectContextSchema,
  AgentSessionSchema,
  validateState,
  safeValidateState,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// BlockerSchema
// ---------------------------------------------------------------------------

describe('BlockerSchema', () => {
  it('accepts a valid blocker', () => {
    const result = BlockerSchema.parse({
      message: 'TypeError: Cannot read property of undefined',
      createdAt: new Date().toISOString(),
      source: 'cursor',
    });
    expect(result.message).toBe('TypeError: Cannot read property of undefined');
    expect(result.source).toBe('cursor');
  });

  it('defaults source to "cli"', () => {
    const result = BlockerSchema.parse({
      message: 'Build failed',
      createdAt: new Date().toISOString(),
    });
    expect(result.source).toBe('cli');
  });

  it('rejects missing message', () => {
    expect(() =>
      BlockerSchema.parse({ createdAt: new Date().toISOString() }),
    ).toThrow();
  });

  it('rejects invalid datetime for createdAt', () => {
    expect(() =>
      BlockerSchema.parse({ message: 'error', createdAt: 'not-a-date' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TaskSchema
// ---------------------------------------------------------------------------

describe('TaskSchema', () => {
  const validTask = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Migrate DB',
    status: 'active' as const,
    blockers: [],
    updatedAt: new Date().toISOString(),
  };

  it('accepts a valid task', () => {
    const result = TaskSchema.parse(validTask);
    expect(result.title).toBe('Migrate DB');
    expect(result.status).toBe('active');
  });

  it('accepts a task with blockers', () => {
    const result = TaskSchema.parse({
      ...validTask,
      blockers: [
        {
          message: 'Connection refused',
          createdAt: new Date().toISOString(),
          source: 'agent',
        },
      ],
    });
    expect(result.blockers).toHaveLength(1);
  });

  it('rejects invalid status', () => {
    expect(() =>
      TaskSchema.parse({ ...validTask, status: 'pending' }),
    ).toThrow();
  });

  it('rejects non-UUID id', () => {
    expect(() =>
      TaskSchema.parse({ ...validTask, id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects empty title', () => {
    expect(() =>
      TaskSchema.parse({ ...validTask, title: '' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// LogEntrySchema
// ---------------------------------------------------------------------------

describe('LogEntrySchema', () => {
  it('accepts a valid log entry', () => {
    const result = LogEntrySchema.parse({
      timestamp: new Date().toISOString(),
      source: 'cli',
      message: 'Task set: "Migrate DB"',
      branch: 'main',
    });
    expect(result.source).toBe('cli');
    expect(result.branch).toBe('main');
  });

  it('accepts log entry without branch', () => {
    const result = LogEntrySchema.parse({
      timestamp: new Date().toISOString(),
      source: 'agent',
      message: 'Updated rules',
    });
    expect(result.branch).toBeUndefined();
  });

  it('rejects invalid source', () => {
    expect(() =>
      LogEntrySchema.parse({
        timestamp: new Date().toISOString(),
        source: 'invalid-source',
        message: 'test',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ProjectContextSchema
// ---------------------------------------------------------------------------

describe('ProjectContextSchema', () => {
  it('accepts minimal context (no active task)', () => {
    const result = ProjectContextSchema.parse({
      version: '1.0.0',
      globalRulesPath: '.omnicode/rules.md',
    });
    expect(result.version).toBe('1.0.0');
    expect(result.activeTask).toBeUndefined();
  });

  it('accepts context with active task', () => {
    const result = ProjectContextSchema.parse({
      version: '1.0.0',
      globalRulesPath: '.omnicode/rules.md',
      activeTask: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test task',
        status: 'active',
        blockers: [],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(result.activeTask?.title).toBe('Test task');
  });

  it('rejects missing version', () => {
    expect(() =>
      ProjectContextSchema.parse({ globalRulesPath: '.omnicode/rules.md' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AgentSessionSchema
// ---------------------------------------------------------------------------

describe('AgentSessionSchema', () => {
  it('accepts a valid agent session', () => {
    const now = new Date().toISOString();
    const result = AgentSessionSchema.parse({
      agentId: 'cursor',
      startedAt: now,
      lastActiveAt: now,
    });
    expect(result.agentId).toBe('cursor');
  });
});

// ---------------------------------------------------------------------------
// validateState / safeValidateState
// ---------------------------------------------------------------------------

describe('validateState', () => {
  it('returns parsed context on valid input', () => {
    const input = {
      version: '1.0.0',
      globalRulesPath: '.omnicode/rules.md',
    };
    const result = validateState(input);
    expect(result.version).toBe('1.0.0');
  });

  it('throws on invalid input', () => {
    expect(() => validateState({ bad: 'data' })).toThrow();
  });
});

describe('safeValidateState', () => {
  it('returns success on valid input', () => {
    const result = safeValidateState({
      version: '1.0.0',
      globalRulesPath: '.omnicode/rules.md',
    });
    expect(result.success).toBe(true);
  });

  it('returns failure on invalid input', () => {
    const result = safeValidateState({ bad: 'data' });
    expect(result.success).toBe(false);
  });
});
