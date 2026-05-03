import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { simpleGit } from 'simple-git';
import { Analyzer } from 'codeloom/dist/analyzer/analyzer';
import { ManifestParser } from 'codeloom/dist/mbd/manifest-parser';
import { GitExecutor, ExecutionResult } from 'codeloom/dist/executor/git-executor';
import type { AnalysisResult } from 'codeloom/dist/types';
import { PlanViewProvider } from './planView';

let currentPlan: AnalysisResult | null = null;
/** Track whether the last analysis was of staged changes (affects executor options). */
let lastDiffMode: 'working' | 'staged' = 'working';
let viewProvider: PlanViewProvider | null = null;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  // Reset session state so re-activation (e.g. in tests) starts clean
  currentPlan  = null;
  lastDiffMode = 'working';

  outputChannel = vscode.window.createOutputChannel('CodeLoom');
  outputChannel.appendLine('CodeLoom activated');

  viewProvider = new PlanViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PlanViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeloom.analyzeWorkingTree', () => analyzeWorkingTree()),
    vscode.commands.registerCommand('codeloom.analyzeStaged',      () => analyzeStaged()),
    vscode.commands.registerCommand('codeloom.analyzeFromDiffFile',() => analyzeFromDiffFile()),
    vscode.commands.registerCommand('codeloom.executePlan',        () => executePlan(false)),
    vscode.commands.registerCommand('codeloom.dryRun',             () => executePlan(true)),
  );
}

export function deactivate(): void { outputChannel?.dispose(); }

// ─── Analyse working tree ─────────────────────────────────────────────────────

async function analyzeWorkingTree(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }

  viewProvider?.setLoading(true);
  try {
    const git = simpleGit(root);
    if (!await git.checkIsRepo().catch(() => false)) {
      viewProvider?.setError('Workspace is not a git repository.');
      return;
    }

    // git diff HEAD shows staged + unstaged vs last commit.
    // Falls back to plain git diff when there are no commits yet.
    let diffText: string;
    try {
      diffText = await git.diff(['HEAD']);
    } catch {
      diffText = await git.diff();      // initial repo with no HEAD
    }

    if (!diffText.trim()) {
      viewProvider?.setLoading(false);
      viewProvider?.setPlan(null);
      vscode.window.showInformationMessage('CodeLoom: no uncommitted changes detected.');
      return;
    }

    lastDiffMode = 'working';
    await runAnalysis(diffText, root);
  } catch (e) {
    const msg = (e as Error).message;
    outputChannel.appendLine(`[analyzeWorkingTree] ${msg}`);
    viewProvider?.setError(msg);
  }
}

// ─── Analyse staged changes ───────────────────────────────────────────────────

async function analyzeStaged(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }

  viewProvider?.setLoading(true);
  try {
    const git = simpleGit(root);
    if (!await git.checkIsRepo().catch(() => false)) {
      viewProvider?.setError('Workspace is not a git repository.');
      return;
    }

    const diffText = await git.diff(['--cached']);
    if (!diffText.trim()) {
      viewProvider?.setLoading(false);
      vscode.window.showInformationMessage(
        'CodeLoom: no staged changes found. Run `git add <files>` first.'
      );
      return;
    }

    lastDiffMode = 'staged';
    await runAnalysis(diffText, root);
  } catch (e) {
    const msg = (e as Error).message;
    outputChannel.appendLine(`[analyzeStaged] ${msg}`);
    viewProvider?.setError(msg);
  }
}

// ─── Analyse a .diff / .patch file ───────────────────────────────────────────

async function analyzeFromDiffFile(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Analyze',
    filters: { Diffs: ['diff', 'patch', 'txt'] },
  });
  if (!picked || picked.length === 0) { return; }

  viewProvider?.setLoading(true);
  try {
    const diffText = fs.readFileSync(picked[0].fsPath, 'utf-8');
    lastDiffMode = 'working';
    await runAnalysis(diffText, root);
  } catch (e) {
    const msg = (e as Error).message;
    outputChannel.appendLine(`[analyzeFromDiffFile] ${msg}`);
    viewProvider?.setError(msg);
  }
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function runAnalysis(diffText: string, repoRoot: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('codeloom');
  const manifestRelPath = config.get<string>('manifestPath') || 'design/manifest.yaml';
  const opts: Parameters<InstanceType<typeof Analyzer>['analyze']>[1] = {};

  const absManifest = path.join(repoRoot, manifestRelPath);
  if (fs.existsSync(absManifest)) {
    try {
      opts.manifest = new ManifestParser().loadFromFile(absManifest);
      outputChannel.appendLine(`Loaded manifest: ${absManifest}`);
    } catch (e) {
      outputChannel.appendLine(`Warning: could not load manifest: ${(e as Error).message}`);
    }
  }

  const analysis = new Analyzer().analyze(diffText, opts);
  currentPlan = analysis;
  viewProvider?.setPlan(analysis);
  outputChannel.appendLine(
    `Analysis complete: ${analysis.summary.totalHunks} hunks → ${analysis.summary.totalCommits} commits`
  );
}

// ─── Execute / Dry-run ────────────────────────────────────────────────────────

async function executePlan(dryRun: boolean): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) { return; }

  if (!currentPlan) {
    vscode.window.showWarningMessage('CodeLoom: run "Analyze" first to generate a commit plan.');
    return;
  }

  const config = vscode.workspace.getConfiguration('codeloom');
  const branch = config.get<string>('defaultBranch') || undefined;
  const n = currentPlan.commits.length;

  if (!dryRun) {
    const choice = await vscode.window.showWarningMessage(
      `CodeLoom will create ${n} real commit${n === 1 ? '' : 's'}${branch ? ` on branch "${branch}"` : ''}. Continue?`,
      { modal: true }, 'Execute'
    );
    if (choice !== 'Execute') { return; }
  }

  viewProvider?.setLoading(true);
  try {
    const result: ExecutionResult = await new GitExecutor({ cwd: root }).execute(currentPlan, {
      dryRun,
      branch,
      allowDirty: true,
      unstageFirst: lastDiffMode === 'staged',
    });

    outputChannel.show(true);
    outputChannel.appendLine(`\n=== ${dryRun ? 'DRY RUN' : 'EXECUTE'} ===`);
    for (const c of result.commits) {
      outputChannel.appendLine(
        `  ${result.dryRun ? '(dry-run)' : c.sha.slice(0, 7)}  ${c.title}`
      );
    }

    viewProvider?.setLoading(false);

    if (result.success) {
      const msg = dryRun
        ? `Dry-run: ${result.commits.length} commit${result.commits.length === 1 ? '' : 's'} planned.`
        : `Created ${result.commits.length} commit${result.commits.length === 1 ? '' : 's'}.`;
      vscode.window.showInformationMessage(`CodeLoom: ${msg}`);
      if (!dryRun) {
        // Clear plan after a real execute so UI shows clean state
        currentPlan = null;
        viewProvider?.setPlan(null);
      }
    } else {
      const err = result.error ?? 'Execution failed';
      viewProvider?.setError(err);
      vscode.window.showErrorMessage(`CodeLoom: ${err}`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    outputChannel.appendLine(`[executePlan] ${msg}`);
    viewProvider?.setError(msg);
    viewProvider?.setLoading(false);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('CodeLoom: no workspace folder open.');
    return undefined;
  }
  return folders[0].uri.fsPath;
}
