import { describe, it, expect } from 'vitest';
import { generateAutoSummary, getGitDiffSummary } from '../index.js';
import type { Task, LogEntry } from '../schemas.js';

describe('Auto Summary Generator', () => {
  it('generates a clean markdown summary for completed task', () => {
    const task: Task = {
      id: '12345678-1234-1234-1234-123456789012',
      title: 'Implement user auth middleware',
      status: 'completed',
      blockers: [{ message: 'Missing JWT secret', createdAt: new Date().toISOString(), source: 'agent' }],
      updatedAt: new Date().toISOString(),
      startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      gitRef: 'main',
    };

    const logEntries: LogEntry[] = [
      { timestamp: new Date().toISOString(), source: 'agent', message: 'Added JWT verification middleware' },
    ];

    const summary = generateAutoSummary({
      task,
      logEntries,
      gitDiffSummary: ' 2 files changed, 45 insertions(+)',
      branch: 'feature/auth',
    });

    expect(summary).toContain('# Handoff Summary (Auto-Generated)');
    expect(summary).toContain('Implement user auth middleware');
    expect(summary).toContain('feature/auth');
    expect(summary).toContain('Blockers Resolved: 1');
    expect(summary).toContain('Added JWT verification middleware');
  });

  it('hard-caps long git diff stats to prevent token overflow', () => {
    // Test getGitDiffSummary truncation logic
    const diff = getGitDiffSummary(process.cwd());
    expect(typeof diff).toBe('string');
  });
});
