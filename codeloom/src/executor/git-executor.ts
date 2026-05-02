import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import * as path from 'path';
import { PlannedCommit, AnalysisResult } from '../types';

export interface ExecuteOptions {
  cwd?: string;
  dryRun?: boolean;
  branch?: string;
  allowDirty?: boolean;
  noRollback?: boolean;
  verbose?: boolean;
  /**
   * When true, run `git reset HEAD` before applying commits. Used by
   * --staged mode: the user has already `git add`'d files, and we want
   * to UN-stage them so the per-commit staging in applyOneCommit() can
   * stage just the files belonging to each planned commit.
   *
   * No-op (silent) if HEAD doesn't yet exist (initial-commit repo).
   */
  unstageFirst?: boolean;
}

export interface ExecutedCommit {
  plannedId: string;
  sha: string;
  title: string;
  files: string[];
  tracesTo: string[];
}

export interface ExecutionResult {
  success: boolean;
  branch: string;
  startSha: string;
  endSha?: string;
  commits: ExecutedCommit[];
  error?: string;
  rolledBack: boolean;
  dryRun: boolean;
}

export class GitExecutor {
  private git: SimpleGit;
  private cwd: string;
  private verbose: boolean;

  constructor(opts: { cwd?: string; verbose?: boolean } = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    this.git = simpleGit(this.cwd);
    this.verbose = opts.verbose ?? false;
  }

  async execute(analysis: AnalysisResult, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    const dryRun = options.dryRun ?? false;
    const allowDirty = options.allowDirty ?? false;

    const result: ExecutionResult = {
      success: false, branch: '', startSha: '', commits: [], rolledBack: false, dryRun,
    };

    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      result.error = `Not a git repository: ${this.cwd}`;
      return result;
    }

    const startSha = (await this.git.revparse(['HEAD']).catch(() => '')).trim();
    result.startSha = startSha;
    result.branch = (await this.currentBranch()) || 'HEAD';

    const status = await this.git.status();
    if (status.conflicted.length > 0) {
      result.error = `Working tree has merge conflicts: ${status.conflicted.join(', ')}`;
      return result;
    }

    const planFiles = new Set<string>();
    for (const c of analysis.commits) {
      for (const h of c.hunks) planFiles.add(this.normalizePath(h.filePath));
    }

    if (!allowDirty) {
      const offending = this.dirtyFilesOutsidePlan(status, planFiles);
      if (offending.length > 0) {
        result.error = `Working tree has uncommitted changes outside the plan:\n  ${offending.join('\n  ')}\nCommit/stash them first, or pass allowDirty: true.`;
        return result;
      }
    }

    if (dryRun) {
      for (const c of analysis.commits) {
        result.commits.push({ plannedId: c.id, sha: '(dry-run)', title: c.title, files: this.filesFor(c), tracesTo: c.tracesTo });
      }
      result.success = true;
      result.endSha = startSha;
      return result;
    }

    if (options.branch) {
      try {
        await this.checkoutOrCreateBranch(options.branch);
        result.branch = options.branch;
      } catch (e) {
        result.error = `Failed to switch to branch ${options.branch}: ${(e as Error).message}`;
        return result;
      }
    }

    // --staged path: unstage everything so that the per-commit staging below
    // controls exactly what goes into each commit. The working-tree contents
    // are unchanged by `git reset` (mixed mode).
    if (options.unstageFirst && startSha) {
      try {
        await this.git.reset(['HEAD']);
      } catch (e) {
        if (this.verbose) this.log(`unstageFirst skipped: ${(e as Error).message}`);
      }
    }

    try {
      for (const planned of analysis.commits) {
        const executed = await this.applyOneCommit(planned);
        result.commits.push(executed);
        if (this.verbose) this.log(`  committed ${executed.sha.slice(0, 7)}  ${executed.title}`);
      }
      result.success = true;
      result.endSha = (await this.git.revparse(['HEAD'])).trim();
      return result;
    } catch (e) {
      result.error = (e as Error).message;
      if (!options.noRollback && startSha) {
        try {
          await this.rollback(startSha);
          result.rolledBack = true;
        } catch (rollbackErr) {
          result.error += `\nROLLBACK ALSO FAILED: ${(rollbackErr as Error).message}\nManual recovery: git reset --hard ${startSha}`;
        }
      }
      return result;
    }
  }

  private async applyOneCommit(planned: PlannedCommit): Promise<ExecutedCommit> {
    const files = this.filesFor(planned);
    if (files.length === 0) throw new Error(`Commit ${planned.id} has no files to stage`);
    for (const f of files) await this.stageOne(f);
    const message = this.buildCommitMessage(planned);
    await this.git.commit(message);
    const sha = (await this.git.revparse(['HEAD'])).trim();
    return { plannedId: planned.id, sha, title: planned.title, files, tracesTo: planned.tracesTo };
  }

  private async stageOne(filePath: string): Promise<void> {
    const fs = await import('fs');
    const abs = path.resolve(this.cwd, filePath);
    if (fs.existsSync(abs)) {
      await this.git.add(filePath);
    } else {
      try { await this.git.rm(filePath); } catch { /* already removed */ }
    }
  }

  private buildCommitMessage(planned: PlannedCommit): string {
    const parts: string[] = [planned.title];
    if (planned.description) { parts.push(''); parts.push(planned.description); }
    if (planned.tracesTo.length > 0 && !planned.description.includes('Traces-To:')) {
      parts.push(''); parts.push(`Traces-To: ${planned.tracesTo.join(', ')}`);
    }
    parts.push('');
    parts.push(`CodeLoom-Plan-Id: ${planned.id}`);
    parts.push(`CodeLoom-Risk: ${planned.risk}`);
    parts.push(`CodeLoom-Intent: ${planned.intent}`);
    return parts.join('\n');
  }

  private async rollback(startSha: string): Promise<void> {
    await this.git.raw(['reset', '--hard', startSha]);
  }

  private async checkoutOrCreateBranch(name: string): Promise<void> {
    const branches = await this.git.branchLocal();
    if (branches.all.includes(name)) {
      await this.git.checkout(name);
    } else {
      await this.git.checkoutLocalBranch(name);
    }
  }

  private async currentBranch(): Promise<string> {
    try { return (await this.git.status()).current ?? ''; } catch { return ''; }
  }

  private filesFor(c: PlannedCommit): string[] {
    const set = new Set<string>();
    for (const h of c.hunks) set.add(this.normalizePath(h.filePath));
    return Array.from(set);
  }

  private normalizePath(p: string): string { return p.replace(/\\/g, '/'); }

  private dirtyFilesOutsidePlan(status: StatusResult, planFiles: Set<string>): string[] {
    const all = [
      ...status.modified, ...status.created, ...status.deleted,
      ...status.not_added, ...status.renamed.map(r => r.to),
    ].map(p => this.normalizePath(p));
    return all.filter(p => !planFiles.has(p));
  }

  private log(msg: string) { if (this.verbose) console.error(msg); }
}
