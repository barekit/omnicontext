/**
 * Branch-aware profile manager.
 *
 * Stores a separate `task.json` per branch in `.omnicode/branches/<branch>/`.
 * When the developer switches branches, the active context is swapped
 * automatically so each branch retains its own task and blockers.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type ProjectContext,
  validateState,
} from './schemas.js';
import {
  OMNICODE_DIR,
  TASK_FILE,
  BRANCHES_DIR,
  SCHEMA_VERSION,
} from './constants.js';
import { loadContext, saveContext } from './io.js';

// ---------------------------------------------------------------------------
// ProfileManager
// ---------------------------------------------------------------------------

export class ProfileManager {
  private readonly omniDir: string;
  private readonly branchesDir: string;

  constructor(private readonly projectRoot: string) {
    this.omniDir = path.join(projectRoot, OMNICODE_DIR);
    this.branchesDir = path.join(this.omniDir, BRANCHES_DIR);
  }

  /**
   * Swap the active context from one branch to another.
   *
   * 1. Save the current context under `branches/<fromBranch>/task.json`
   * 2. Load the target context from `branches/<toBranch>/task.json`
   *    (or create a fresh default if no profile exists yet)
   * 3. Write the loaded context as the active `.omnicode/task.json`
   */
  swapProfile(fromBranch: string | null, toBranch: string | null): ProjectContext {
    // Save current state to the old branch profile
    if (fromBranch) {
      try {
        const currentContext = loadContext(this.omniDir);
        this.saveBranchProfile(fromBranch, currentContext);
      } catch {
        // If we can't load current context, skip saving
      }
    }

    // Load or create the target branch profile
    let targetContext: ProjectContext;
    if (toBranch) {
      targetContext = this.loadBranchProfile(toBranch);
    } else {
      // Detached HEAD — use a clean default
      targetContext = this.createDefaultContext();
    }

    // Write as the active context
    saveContext(this.omniDir, targetContext);

    return targetContext;
  }

  /** Save a context snapshot for a specific branch. */
  private saveBranchProfile(branch: string, context: ProjectContext): void {
    const branchDir = this.getBranchDir(branch);
    fs.mkdirSync(branchDir, { recursive: true });
    const filePath = path.join(branchDir, TASK_FILE);
    fs.writeFileSync(filePath, JSON.stringify(context, null, 2) + '\n');
  }

  /** Load the saved profile for a branch, or create a default. */
  private loadBranchProfile(branch: string): ProjectContext {
    const filePath = path.join(this.getBranchDir(branch), TASK_FILE);
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return validateState(raw);
    }
    return this.createDefaultContext();
  }

  /** Get the directory for a branch's saved profile. */
  private getBranchDir(branch: string): string {
    // Sanitise branch names (e.g. feature/login → feature__login)
    const safeName = branch.replace(/\//g, '__');
    return path.join(this.branchesDir, safeName);
  }

  /** Create a clean default ProjectContext. */
  private createDefaultContext(): ProjectContext {
    return {
      version: SCHEMA_VERSION,
      globalRulesPath: `${OMNICODE_DIR}/rules.md`,
    };
  }
}
