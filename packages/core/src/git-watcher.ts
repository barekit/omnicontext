/**
 * Git HEAD watcher — monitors `.git/HEAD` for branch changes.
 *
 * Uses `chokidar` for cross-platform file watching. Emits typed events
 * when the developer switches branches, allowing the profile manager
 * to swap the active `.omnicode` context automatically.
 */

import { watch, type FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchChangeEvent {
  oldBranch: string | null;
  newBranch: string | null;
}

export interface GitWatcherEvents {
  'branch-changed': (event: BranchChangeEvent) => void;
  error: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// GitWatcher
// ---------------------------------------------------------------------------

export class GitWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private currentBranch: string | null = null;
  private readonly gitDir: string;

  constructor(private readonly projectRoot: string) {
    super();
    this.gitDir = path.join(projectRoot, '.git');
  }

  /** Parse the current branch from `.git/HEAD`. */
  private parseBranch(): string | null {
    const headPath = path.join(this.gitDir, 'HEAD');
    if (!fs.existsSync(headPath)) {
      return null;
    }
    const content = fs.readFileSync(headPath, 'utf-8').trim();
    const match = content.match(/^ref: refs\/heads\/(.+)$/);
    return match ? match[1] : null; // null = detached HEAD
  }

  /** Start watching `.git/HEAD` for changes. */
  start(): void {
    const headPath = path.join(this.gitDir, 'HEAD');

    if (!fs.existsSync(headPath)) {
      this.emit('error', new Error(`.git/HEAD not found in ${this.projectRoot}`));
      return;
    }

    this.currentBranch = this.parseBranch();

    this.watcher = watch(headPath, {
      // Don't fire on initial add
      ignoreInitial: true,
      // Debounce rapid writes
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', () => {
      const newBranch = this.parseBranch();
      if (newBranch !== this.currentBranch) {
        const event: BranchChangeEvent = {
          oldBranch: this.currentBranch,
          newBranch,
        };
        this.currentBranch = newBranch;
        this.emit('branch-changed', event);
      }
    });

    this.watcher.on('error', (err: unknown) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Stop watching and clean up. */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /** Get the currently tracked branch name (or null for detached HEAD). */
  getCurrentBranch(): string | null {
    return this.currentBranch;
  }
}
