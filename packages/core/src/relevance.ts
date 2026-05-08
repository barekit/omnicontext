/**
 * Task-aware relevance scoring.
 *
 * Uses the codebase index to find files that are most relevant to the
 * currently active task and any active blockers.
 */

import path from 'node:path';
import type { Task } from './schemas.js';
import { getOrBuildIndex, searchIndex, type CodebaseDB } from './indexer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelevantFile {
  path: string;
  score: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Extraction & Scoring
// ---------------------------------------------------------------------------

/**
 * Extract meaningful keywords from a task title and blockers.
 * Removes common stop words to improve search relevance.
 */
export function extractKeywords(task: Task | null): string[] {
  if (!task) return [];

  const text = [
    task.title,
    ...(task.blockers?.map(b => b.message) || []),
  ].join(' ').toLowerCase();

  // Basic stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'to', 'from', 'in', 'out', 'on', 'off', 'for', 'with', 'about',
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'implement', 'fix', 'update', 'add', 'remove', 'change', 'create',
    'issue', 'error', 'bug', 'feature', 'task',
  ]);

  // Extract alphanumeric words
  const words = text.match(/[a-z0-9_]+/g) || [];

  const keywords = new Set<string>();
  for (const word of words) {
    if (word.length > 2 && !stopWords.has(word)) {
      keywords.add(word);
    }
  }

  return Array.from(keywords);
}

/**
 * Find the most relevant files for the current task.
 * Returns up to `limit` files.
 */
export async function findRelevantFiles(
  projectRoot: string,
  task: Task | null,
  limit: number = 3,
): Promise<RelevantFile[]> {
  if (!task) return [];

  const keywords = extractKeywords(task);
  if (keywords.length === 0) return [];

  const db = await getOrBuildIndex(projectRoot);
  const query = keywords.join(' ');

  // Search Orama index (BM25 ranking)
  const results = await searchIndex(db, query, limit);

  return results.map(r => ({
    path: r.path,
    score: r.score,
    reason: `Matches task keywords: ${keywords.slice(0, 3).join(', ')}`,
  }));
}

/**
 * Generate a compact summary of relevant files for the boot context.
 */
export async function formatRelevantFilesCompact(
  projectRoot: string,
  task: Task | null,
): Promise<string> {
  const relevant = await findRelevantFiles(projectRoot, task, 3);

  if (relevant.length === 0) {
    return 'No highly relevant files detected yet.';
  }

  const parts = ['Relevant files (auto-detected):'];
  for (const f of relevant) {
    parts.push(`  - ${f.path}`);
  }

  return parts.join('\n');
}
