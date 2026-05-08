/**
 * Codebase indexer powered by Orama.
 *
 * Scans the project's tracked files (via `git ls-files`), extracts
 * symbols using regex-based extraction (no Tree-sitter), and builds
 * an Orama full-text search index. Persists to `.omnicode/codebase.orama`
 * for instant restoration on subsequent boots.
 *
 * Designed for zero-config, zero-native-dep operation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { create, insert, insertMultiple, search, save, load, count } from '@orama/orama';

import { OMNICODE_DIR } from './constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INDEX_FILE = 'codebase.orama';
const MAX_FILE_SIZE = 100 * 1024; // Skip files > 100KB

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.css': 'css', '.scss': 'scss',
  '.html': 'html',
  '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell',
  '.dockerfile': 'docker',
};

// ---------------------------------------------------------------------------
// Orama schema
// ---------------------------------------------------------------------------

const SCHEMA = {
  path: 'string' as const,
  language: 'string' as const,
  exports: 'string' as const,      // Space-separated export names (for FTS)
  imports: 'string' as const,      // Space-separated import sources
  size: 'number' as const,
};

export type CodebaseDB = Awaited<ReturnType<typeof create>>;

// ---------------------------------------------------------------------------
// Symbol extraction (regex-based, per language)
// ---------------------------------------------------------------------------

/**
 * Extract exported symbol names from file content using regex.
 * This is intentionally simple — no AST parsing, no native deps.
 * Covers the 80% case for the most common languages.
 */
export function extractSymbols(content: string, lang: string): { exports: string[]; imports: string[] } {
  const exports: string[] = [];
  const imports: string[] = [];

  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'vue':
    case 'svelte':
      // Exported functions, classes, types, interfaces, consts, enums
      const tsExportRe = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|type\s+|interface\s+|const\s+|let\s+|var\s+|enum\s+)(\w+)/g;
      let m;
      while ((m = tsExportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // Named re-exports: export { Foo, Bar }
      const reExportRe = /export\s*\{([^}]+)\}/g;
      while ((m = reExportRe.exec(content)) !== null) {
        const names = m[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
        exports.push(...names.filter(n => n && /^\w+$/.test(n)));
      }
      // Imports: import { x } from 'module' or import x from 'module'
      const tsImportRe = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      while ((m = tsImportRe.exec(content)) !== null) {
        imports.push(m[1]);
      }
      break;

    case 'python':
      // def function_name, class ClassName
      const pyDefRe = /^(?:def|class)\s+(\w+)/gm;
      while ((m = pyDefRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // from x import y, import x
      const pyImportRe = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
      while ((m = pyImportRe.exec(content)) !== null) {
        imports.push(m[1] || m[2]);
      }
      break;

    case 'go':
      // Exported = starts with uppercase: func FuncName, type TypeName
      const goExportRe = /^(?:func|type|var|const)\s+\(?\w*\)?\s*([A-Z]\w*)/gm;
      while ((m = goExportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // import "path" or import ( "path" )
      const goImportRe = /["']([^"']+)["']/g;
      // Only look at import blocks
      const importBlock = content.match(/import\s*\([\s\S]*?\)/g) || [];
      for (const block of importBlock) {
        while ((m = goImportRe.exec(block)) !== null) {
          imports.push(m[1]);
        }
      }
      break;

    case 'rust':
      // pub fn, pub struct, pub enum, pub trait
      const rsExportRe = /pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g;
      while ((m = rsExportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // use crate::x, use std::x
      const rsImportRe = /use\s+([\w:]+)/g;
      while ((m = rsImportRe.exec(content)) !== null) {
        imports.push(m[1]);
      }
      break;

    case 'java':
    case 'kotlin':
      // public class/interface ClassName
      const javaExportRe = /(?:public|open)\s+(?:abstract\s+)?(?:class|interface|enum|object)\s+(\w+)/g;
      while ((m = javaExportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // import x.y.z;
      const javaImportRe = /import\s+([\w.]+)/g;
      while ((m = javaImportRe.exec(content)) !== null) {
        imports.push(m[1]);
      }
      break;

    case 'ruby':
      // class ClassName, module ModuleName, def method_name
      const rbExportRe = /^(?:class|module|def)\s+(\w+)/gm;
      while ((m = rbExportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
      // require 'x', require_relative 'x'
      const rbImportRe = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
      while ((m = rbImportRe.exec(content)) !== null) {
        imports.push(m[1]);
      }
      break;

    default:
      // For unsupported languages, just index the filename
      break;
  }

  return { exports, imports };
}

// ---------------------------------------------------------------------------
// File listing (git-aware)
// ---------------------------------------------------------------------------

/** List all tracked files using `git ls-files`. Falls back to recursive readdir. */
export function listProjectFiles(projectRoot: string): string[] {
  try {
    const output = execSync('git ls-files', {
      cwd: projectRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10000,
    });
    return output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
  } catch {
    // Fallback: simple recursive readdir (skip common ignore dirs)
    return listFilesRecursive(projectRoot, projectRoot);
  }
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.omnicode', '.turbo', 'coverage', '__pycache__', '.cache',
  'target', 'vendor', '.venv', 'venv', '.tox',
]);

function listFilesRecursive(dir: string, root: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          results.push(...listFilesRecursive(path.join(dir, entry.name), root));
        }
      } else {
        results.push(path.relative(root, path.join(dir, entry.name)));
      }
    }
  } catch { /* ignore read errors */ }
  return results;
}

// ---------------------------------------------------------------------------
// Index build
// ---------------------------------------------------------------------------

/**
 * Build a fresh codebase index by scanning all project files.
 * Returns the Orama database instance.
 */
export async function buildIndex(projectRoot: string): Promise<CodebaseDB> {
  const db = await create({ schema: SCHEMA });
  const files = listProjectFiles(projectRoot);

  const docs: Array<Record<string, unknown>> = [];

  for (const relPath of files) {
    const ext = path.extname(relPath).toLowerCase();
    const lang = LANG_MAP[ext];
    if (!lang) continue; // Skip unknown file types

    const absPath = path.join(projectRoot, relPath);
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch { continue; }

    if (stat.size > MAX_FILE_SIZE) continue;
    if (stat.size === 0) continue;

    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch { continue; }

    const { exports: exp, imports: imp } = extractSymbols(content, lang);

    docs.push({
      path: relPath,
      language: lang,
      exports: exp.join(' '),
      imports: imp.join(' '),
      size: stat.size,
    });
  }

  if (docs.length > 0) {
    await insertMultiple(db, docs);
  }

  return db;
}

/**
 * Save the Orama index to disk for instant restoration.
 */
export async function saveIndex(db: CodebaseDB, projectRoot: string): Promise<void> {
  const omniDir = path.join(projectRoot, OMNICODE_DIR);
  if (!fs.existsSync(omniDir)) return;

  const snapshot = await save(db);
  const filePath = path.join(omniDir, INDEX_FILE);
  fs.writeFileSync(filePath, JSON.stringify(snapshot));
}

/**
 * Load a previously saved Orama index from disk.
 * Returns null if no index file exists.
 */
export async function loadIndex(projectRoot: string): Promise<CodebaseDB | null> {
  const filePath = path.join(projectRoot, OMNICODE_DIR, INDEX_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const db = await create({ schema: SCHEMA });
    await load(db, raw);
    return db;
  } catch {
    return null;
  }
}

/**
 * Build or load the codebase index.
 * Loads from disk if available, otherwise builds fresh and saves.
 */
export async function getOrBuildIndex(projectRoot: string): Promise<CodebaseDB> {
  const existing = await loadIndex(projectRoot);
  if (existing && (await count(existing)) > 0) {
    return existing;
  }

  const db = await buildIndex(projectRoot);
  await saveIndex(db, projectRoot);
  return db;
}

/**
 * Search the codebase index.
 * Returns matching file paths, exports, and relevance scores.
 */
export async function searchIndex(
  db: CodebaseDB,
  query: string,
  limit: number = 10,
): Promise<Array<{ path: string; language: string; exports: string; score: number }>> {
  const results = await search(db as any, {
    term: query,
    limit,
    properties: ['path', 'exports', 'imports'],
  });

  return results.hits.map(hit => ({
    path: (hit.document as any).path as string,
    language: (hit.document as any).language as string,
    exports: (hit.document as any).exports as string,
    score: hit.score,
  }));
}

/**
 * Get a compact summary of the index for inclusion in boot context.
 */
export async function getIndexSummary(db: CodebaseDB): Promise<string> {
  const total = await count(db);
  if (total === 0) return 'No files indexed.';

  // Get language distribution
  const langCounts: Record<string, number> = {};
  const allResults = await search(db as any, { term: '', limit: 10000 });
  for (const hit of allResults.hits) {
    const lang = (hit.document as any).language as string;
    langCounts[lang] = (langCounts[lang] || 0) + 1;
  }

  const langSummary = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, n]) => `${n} ${lang}`)
    .join(', ');

  return `Indexed: ${total} files (${langSummary})`;
}

