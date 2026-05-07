/**
 * Project architecture auto-detection.
 *
 * Scans the project root to detect language, framework, package manager,
 * directory structure, and key config files. This saves agents from needing
 * to run `ls`, `cat package.json`, `cat tsconfig.json` etc. — eliminating
 * hundreds of tokens of filesystem exploration per session.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectArchitecture {
  /** Detected primary language(s). */
  languages: string[];
  /** Detected framework(s). */
  frameworks: string[];
  /** Detected package manager. */
  packageManager: string | null;
  /** Project name from manifest. */
  projectName: string | null;
  /** Whether it's a monorepo. */
  monorepo: boolean;
  /** Monorepo workspaces (if detected). */
  workspaces: string[];
  /** Key config files present. */
  configFiles: string[];
  /** Top-level directory structure (1-level deep). */
  directories: string[];
  /** Key dependencies detected. */
  keyDependencies: string[];
  /** Detected conventions. */
  conventions: string[];
}

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

const LANGUAGE_MARKERS: Record<string, string[]> = {
  TypeScript: ['tsconfig.json', 'tsconfig.base.json'],
  JavaScript: ['jsconfig.json'],
  Python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  Go: ['go.mod', 'go.sum'],
  Rust: ['Cargo.toml'],
  Java: ['pom.xml', 'build.gradle'],
  Ruby: ['Gemfile'],
  PHP: ['composer.json'],
  Swift: ['Package.swift'],
  'C#': ['*.csproj', '*.sln'],
};

const FRAMEWORK_MARKERS: Record<string, string[]> = {
  'Next.js': ['next.config.js', 'next.config.ts', 'next.config.mjs'],
  React: ['react', 'react-dom'],
  Vue: ['vue.config.js', 'nuxt.config.ts', 'nuxt.config.js'],
  Angular: ['angular.json'],
  Svelte: ['svelte.config.js'],
  Express: ['express'],
  Fastify: ['fastify'],
  NestJS: ['@nestjs/core'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi'],
};

const CONFIG_FILES = [
  'tsconfig.json',
  'package.json',
  '.eslintrc.json',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'vitest.config.ts',
  'jest.config.js',
  'jest.config.ts',
  '.env',
  '.env.example',
  'docker-compose.yml',
  'Dockerfile',
  'Makefile',
  '.github/workflows',
  'turbo.json',
  'nx.json',
  'lerna.json',
];

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.omnicode', '.turbo', 'coverage', '__pycache__', '.cache',
  'target', 'vendor', '.venv', 'venv',
]);

/** Detect the project architecture from the filesystem. */
export function detectArchitecture(projectRoot: string): ProjectArchitecture {
  const result: ProjectArchitecture = {
    languages: [],
    frameworks: [],
    packageManager: null,
    projectName: null,
    monorepo: false,
    workspaces: [],
    configFiles: [],
    directories: [],
    keyDependencies: [],
    conventions: [],
  };

  // -- Detect languages --
  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    for (const marker of markers) {
      if (marker.includes('*')) continue; // skip glob patterns for simplicity
      if (fs.existsSync(path.join(projectRoot, marker))) {
        if (!result.languages.includes(lang)) {
          result.languages.push(lang);
        }
        break;
      }
    }
  }

  // -- Detect package manager + project name --
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      result.projectName = pkg.name ?? null;

      // Detect package manager
      if (pkg.packageManager) {
        const pm = String(pkg.packageManager);
        if (pm.startsWith('pnpm')) result.packageManager = 'pnpm';
        else if (pm.startsWith('yarn')) result.packageManager = 'yarn';
        else if (pm.startsWith('bun')) result.packageManager = 'bun';
        else result.packageManager = pm.split('@')[0];
      } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
        result.packageManager = 'pnpm';
      } else if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
        result.packageManager = 'yarn';
      } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
        result.packageManager = 'bun';
      } else if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
        result.packageManager = 'npm';
      }

      // Detect ESM vs CJS
      if (pkg.type === 'module') {
        result.conventions.push('ESM (import/export)');
      } else {
        result.conventions.push('CJS (require)');
      }

      // Detect monorepo
      if (pkg.workspaces) {
        result.monorepo = true;
        result.workspaces = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces.packages ?? [];
      }

      // Extract key dependencies (from deps + devDeps)
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      // Detect frameworks from dependencies
      for (const [framework, markers] of Object.entries(FRAMEWORK_MARKERS)) {
        for (const marker of markers) {
          if (marker.includes('.') || marker.includes('/')) continue;
          if (allDeps[marker]) {
            if (!result.frameworks.includes(framework)) {
              result.frameworks.push(framework);
            }
            break;
          }
        }
      }

      // Pick top key dependencies (limit to 10)
      const importantDeps = Object.keys(allDeps)
        .filter(d => !d.startsWith('@types/'))
        .slice(0, 10);
      result.keyDependencies = importantDeps;
    } catch {
      // Ignore parse errors
    }
  }

  // Detect monorepo from other signals
  if (fs.existsSync(path.join(projectRoot, 'pnpm-workspace.yaml'))) {
    result.monorepo = true;
  }
  if (fs.existsSync(path.join(projectRoot, 'turbo.json'))) {
    result.monorepo = true;
    if (!result.conventions.includes('Turborepo')) {
      result.conventions.push('Turborepo');
    }
  }

  // -- Detect frameworks from config files --
  for (const [framework, markers] of Object.entries(FRAMEWORK_MARKERS)) {
    for (const marker of markers) {
      if (!marker.includes('.') && !marker.includes('/')) continue; // skip dep names
      if (fs.existsSync(path.join(projectRoot, marker))) {
        if (!result.frameworks.includes(framework)) {
          result.frameworks.push(framework);
        }
        break;
      }
    }
  }

  // -- Detect config files --
  for (const file of CONFIG_FILES) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      result.configFiles.push(file);
    }
  }

  // -- Detect conventions --
  if (result.configFiles.some(f => f.includes('prettier'))) {
    result.conventions.push('Prettier');
  }
  if (result.configFiles.some(f => f.includes('eslint'))) {
    result.conventions.push('ESLint');
  }
  if (result.configFiles.some(f => f.includes('vitest'))) {
    result.conventions.push('Vitest');
  }
  if (result.configFiles.some(f => f.includes('jest'))) {
    result.conventions.push('Jest');
  }

  // -- Top-level directories --
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        result.directories.push(entry.name + '/');
      }
    }
  } catch {
    // Ignore read errors
  }

  return result;
}

/**
 * Generate a compact, token-efficient text summary of the architecture.
 * Designed to be ~50-100 tokens — eliminates the need for agents to explore the filesystem.
 */
export function formatArchitectureCompact(arch: ProjectArchitecture): string {
  const parts: string[] = [];

  if (arch.projectName) parts.push(`Project: ${arch.projectName}`);
  if (arch.languages.length > 0) parts.push(`Lang: ${arch.languages.join(', ')}`);
  if (arch.frameworks.length > 0) parts.push(`Framework: ${arch.frameworks.join(', ')}`);
  if (arch.packageManager) parts.push(`PM: ${arch.packageManager}`);
  if (arch.monorepo) parts.push(`Monorepo: ${arch.workspaces.join(', ') || 'yes'}`);
  if (arch.conventions.length > 0) parts.push(`Conventions: ${arch.conventions.join(', ')}`);
  if (arch.directories.length > 0) parts.push(`Dirs: ${arch.directories.join(', ')}`);
  if (arch.keyDependencies.length > 0) parts.push(`Deps: ${arch.keyDependencies.join(', ')}`);

  return parts.join('\n');
}
