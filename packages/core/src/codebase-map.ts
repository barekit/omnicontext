/**
 * Codebase Map generator for OmniContext.
 *
 * Scans the project directory structure up to depth 4 and generates a compact,
 * structured file tree with language detection, file summaries, and exported symbols.
 * This gives AI agents instant architectural awareness without needing to search
 * or list directories repeatedly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MAP_FILE, MAP_MAX_AGE_HOURS } from './constants.js';

export interface FileMapEntry {
  /** Relative path from project root. */
  path: string;
  /** File type: 'file' | 'directory'. */
  type: 'file' | 'directory';
  /** Language detected (e.g. 'typescript', 'python', 'json'). */
  language?: string;
  /** One-line summary extracted from docstring or initial comment. */
  summary?: string;
  /** Exported symbols (functions, classes, interfaces). */
  exports?: string[];
  /** File size in bytes. */
  sizeBytes?: number;
}

export interface CodebaseMap {
  /** Project root absolute path. */
  projectRoot: string;
  /** ISO-8601 timestamp of generation. */
  generatedAt: string;
  /** Total number of files mapped. */
  totalFiles: number;
  /** File map entries. */
  entries: FileMapEntry[];
}

/** Directory patterns to ignore during codebase mapping. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.omnicode',
  'dist',
  'build',
  '.turbo',
  '.next',
  '.cache',
  'coverage',
  '.idea',
  '.vscode',
]);

/** File extension to language mapping. */
const EXT_LANG_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript-react',
  '.js': 'javascript',
  '.jsx': 'javascript-react',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'c++',
  '.cs': 'c#',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
  '.sh': 'shell',
};

/**
 * Generate a codebase map by scanning the project directory.
 * Scans up to `maxDepth` (default: 4).
 */
export function generateCodebaseMap(projectRoot: string, maxDepth: number = 4): CodebaseMap {
  const entries: FileMapEntry[] = [];

  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;

    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      if (item.name.startsWith('.') && item.name !== '.env.example') {
        if (item.name === '.git' || item.name === '.omnicode') continue;
      }

      if (IGNORED_DIRS.has(item.name)) continue;

      const fullPath = path.join(dir, item.name);
      const relPath = path.relative(projectRoot, fullPath);

      if (item.isDirectory()) {
        entries.push({
          path: relPath,
          type: 'directory',
        });
        scan(fullPath, depth + 1);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        const lang = EXT_LANG_MAP[ext];
        let stat: fs.Stats | null = null;
        try {
          stat = fs.statSync(fullPath);
        } catch {}

        const entry: FileMapEntry = {
          path: relPath,
          type: 'file',
          language: lang,
          sizeBytes: stat?.size,
        };

        // Extract light metadata for source files
        if (lang && stat && stat.size < 500_000) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const summary = extractTopComment(content);
            if (summary) entry.summary = summary;

            const exports = extractExports(content, lang);
            if (exports.length > 0) entry.exports = exports;
          } catch {}
        }

        entries.push(entry);
      }
    }
  }

  scan(projectRoot, 1);

  return {
    projectRoot,
    generatedAt: new Date().toISOString(),
    totalFiles: entries.filter((e) => e.type === 'file').length,
    entries,
  };
}

/** Extract top-level comment or docstring summary from file content. */
function extractTopComment(content: string): string | undefined {
  const lines = content.split('\n').slice(0, 15);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
      const cleaned = trimmed.replace(/^\/\*+\s*/, '').replace(/\*\/$/, '').trim();
      if (cleaned.length > 3) return cleaned;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const cleaned = trimmed.replace(/^(\/\/|#)\s*/, '').trim();
      if (cleaned.length > 3 && !cleaned.startsWith('eslint') && !cleaned.startsWith('prettier')) {
        return cleaned;
      }
    }
  }
  return undefined;
}

/** Extract exported function, class, or type names. */
function extractExports(content: string, lang: string): string[] {
  const exports: string[] = [];

  if (lang.includes('typescript') || lang.includes('javascript')) {
    const matches = content.matchAll(/export\s+(?:async\s+)?(?:function|class|interface|type|const|enum)\s+([A-Za-z0-9_]+)/g);
    for (const match of matches) {
      if (match[1] && !exports.includes(match[1])) {
        exports.push(match[1]);
      }
    }
  } else if (lang === 'python') {
    const matches = content.matchAll(/(?:def|class)\s+([A-Za-z0-9_]+)/g);
    for (const match of matches) {
      if (match[1] && !match[1].startsWith('_') && !exports.includes(match[1])) {
        exports.push(match[1]);
      }
    }
  }

  return exports.slice(0, 8); // Max 8 exports per file for compactness
}

/** Format a codebase map as a compact tree string for LLMs (~300-500 tokens). */
export function formatCodebaseMapCompact(map: CodebaseMap): string {
  const lines: string[] = [
    `# Codebase Map (${map.totalFiles} files, updated ${map.generatedAt.slice(0, 10)})`,
  ];

  // Group top-level entries
  const files = map.entries.filter((e) => e.type === 'file');
  for (const f of files.slice(0, 30)) {
    let line = `- ${f.path}`;
    if (f.summary) {
      line += ` — ${f.summary}`;
    } else if (f.exports && f.exports.length > 0) {
      line += ` (${f.exports.slice(0, 3).join(', ')})`;
    }
    lines.push(line);
  }

  if (files.length > 30) {
    lines.push(`- ... and ${files.length - 30} more files`);
  }

  return lines.join('\n');
}

/** Load cached map from `.omnicode/map.json`. Returns null if missing or stale (>24h). */
export function loadCachedMap(omniDir: string): CodebaseMap | null {
  const mapPath = path.join(omniDir, MAP_FILE);
  if (!fs.existsSync(mapPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    const map = raw as CodebaseMap;
    const ageMs = Date.now() - new Date(map.generatedAt).getTime();
    if (ageMs > MAP_MAX_AGE_HOURS * 60 * 60 * 1000) {
      return null; // Stale
    }
    return map;
  } catch {
    return null;
  }
}

/** Save codebase map to `.omnicode/map.json`. */
export function saveCachedMap(omniDir: string, map: CodebaseMap): void {
  const mapPath = path.join(omniDir, MAP_FILE);
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
}
