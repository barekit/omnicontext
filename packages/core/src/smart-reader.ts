/**
 * Smart file reader with token budgeting.
 *
 * Reads files in three modes to minimize token usage:
 * - `signatures`: Only function/class/type signatures (~20-50 tokens per file)
 * - `relevant`:   Only sections matching task-related keywords (~50-200 tokens)
 * - `full`:       Full content with token budget cap
 *
 * Token estimation: ~4 characters per token (OpenAI/Anthropic average).
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadMode = 'signatures' | 'relevant' | 'full';

export interface SmartReadResult {
  path: string;
  mode: ReadMode;
  content: string;
  lineCount: number;
  /** Estimated tokens in the returned content. */
  estimatedTokens: number;
  /** Whether the content was truncated to fit the budget. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;

/** Estimate token count for a string. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Signature extraction (mode: "signatures")
// ---------------------------------------------------------------------------

/**
 * Extract only function/class/type signatures from a file.
 * Strips function bodies, keeping just the declaration line.
 */
export function extractSignatures(content: string, lang: string): string {
  const lines = content.split('\n');
  const signatures: string[] = [];

  switch (lang) {
    case 'typescript':
    case 'javascript': {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Export/function/class/interface/type/enum/const declarations
        if (
          /^(export\s+)?(default\s+)?(async\s+)?function\*?\s+\w+/.test(trimmed) ||
          /^(export\s+)?(default\s+)?(abstract\s+)?class\s+\w+/.test(trimmed) ||
          /^(export\s+)?interface\s+\w+/.test(trimmed) ||
          /^(export\s+)?type\s+\w+\s*=/.test(trimmed) ||
          /^(export\s+)?enum\s+\w+/.test(trimmed) ||
          /^(export\s+)?(const|let|var)\s+\w+\s*[:=]/.test(trimmed)
        ) {
          // For functions/classes, include just the declaration line
          let sig = line;
          // If it's a one-liner const/type, include the whole thing
          if (trimmed.startsWith('type ') || trimmed.startsWith('export type ')) {
            signatures.push(sig.trimEnd());
          } else {
            // For functions/classes, include up to the opening brace
            sig = sig.replace(/\{[\s\S]*$/, '{...}');
            signatures.push(sig.trimEnd());
          }
        }
      }
      break;
    }

    case 'python': {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (/^(def|class|async\s+def)\s+\w+/.test(trimmed)) {
          // Include the def/class line (with type hints)
          let sig = line;
          // If it continues on the next line, grab up to the colon
          if (!sig.includes(':') && i + 1 < lines.length) {
            sig += ' ' + lines[i + 1].trim();
          }
          signatures.push(sig.trimEnd());
        }
      }
      break;
    }

    case 'go': {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (/^(func|type|var|const)\s+/.test(trimmed)) {
          let sig = line.replace(/\{[\s\S]*$/, '{...}');
          signatures.push(sig.trimEnd());
        }
      }
      break;
    }

    case 'rust': {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (/^(pub\s+)?(async\s+)?(fn|struct|enum|trait|type|const|static|impl)\s+/.test(trimmed)) {
          let sig = line.replace(/\{[\s\S]*$/, '{...}');
          signatures.push(sig.trimEnd());
        }
      }
      break;
    }

    default: {
      // For unknown languages, return the first 10 non-empty lines as a preview
      const preview = lines.filter(l => l.trim()).slice(0, 10);
      return preview.join('\n');
    }
  }

  return signatures.length > 0 ? signatures.join('\n') : '(no signatures detected)';
}

// ---------------------------------------------------------------------------
// Relevant section extraction (mode: "relevant")
// ---------------------------------------------------------------------------

/**
 * Extract only sections of a file that match given keywords.
 * Returns functions/blocks containing those keywords.
 */
export function extractRelevant(content: string, keywords: string[]): string {
  if (keywords.length === 0) {
    // No keywords — fall back to first 30 lines
    return content.split('\n').slice(0, 30).join('\n');
  }

  const lines = content.split('\n');
  const matchingRanges: Array<[number, number]> = [];

  // Find lines matching any keyword
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lowerKeywords.some(kw => lower.includes(kw))) {
      // Include 5 lines of context before and 15 after
      const start = Math.max(0, i - 5);
      const end = Math.min(lines.length - 1, i + 15);
      matchingRanges.push([start, end]);
    }
  }

  if (matchingRanges.length === 0) {
    return '(no sections matching keywords)';
  }

  // Merge overlapping ranges
  const merged = mergeRanges(matchingRanges);

  // Build result
  const parts: string[] = [];
  for (const [start, end] of merged) {
    if (parts.length > 0) {
      parts.push(`\n... (lines ${start + 1}-${end + 1}) ...\n`);
    }
    parts.push(lines.slice(start, end + 1).join('\n'));
  }

  return parts.join('\n');
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1] + 1) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Main smart reader
// ---------------------------------------------------------------------------

/** Detect language from file extension. */
function detectLang(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
  };
  return map[ext] || 'unknown';
}

/**
 * Read a file with intelligence.
 *
 * @param filePath - Absolute path to the file.
 * @param mode - "signatures" | "relevant" | "full"
 * @param options.tokenBudget - Max tokens to return (default: 500)
 * @param options.keywords - Keywords for "relevant" mode
 */
export function readFileSmart(
  filePath: string,
  mode: ReadMode = 'signatures',
  options: { tokenBudget?: number; keywords?: string[] } = {},
): SmartReadResult {
  const { tokenBudget = 500, keywords = [] } = options;

  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      mode,
      content: '(file not found)',
      lineCount: 0,
      estimatedTokens: 4,
      truncated: false,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lang = detectLang(filePath);
  let result: string;

  switch (mode) {
    case 'signatures':
      result = extractSignatures(content, lang);
      break;

    case 'relevant':
      result = extractRelevant(content, keywords);
      break;

    case 'full':
      result = content;
      break;
  }

  // Apply token budget
  let truncated = false;
  const maxChars = tokenBudget * CHARS_PER_TOKEN;
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '\n... (truncated to fit token budget)';
    truncated = true;
  }

  return {
    path: filePath,
    mode,
    content: result,
    lineCount: result.split('\n').length,
    estimatedTokens: estimateTokens(result),
    truncated,
  };
}
