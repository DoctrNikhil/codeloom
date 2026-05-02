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
let viewProvider: PlanViewProvider | null = null;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('CodeLoom');
  outputChannel.appendLine('CodeLoom activated');

  viewProvider = new PlanViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PlanViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeloom.analyzeWorkingTree', () => analyzeWorkingTree()),
    vscode.commands.registerCommand('codeloom.analyzeFromDiffFile', () => analyzeFromDiffFile()),
    vscode.commands.registerCommand('codeloom.executePlan', () => executePlan(false)),
    vscode.commands.registerCommand('codeloom.dryRun', () => executePlan(true)),
  );

  if (vscode.workspace.workspaceFolders?.length) {
    setTimeout(() => analyzeWorkingTree().catch(() => undefined), 1000);
  }
}

export function deactivate() { outputChannel?.dispose(); }

async function analyzeWorkingTree(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  try {
    const git = simpleGit(root);
    if (!await git.checkIsRepo().catch(() => false)) {
      vscode.window.showWarningMessage('CodeLoom: workspace is not a git repository.');
      return;
    }
    const diffText = await git.diff(['HEAD']);
    if (!diffText.trim()) {
      vscode.window.showInformationMessage('CodeLoom: no uncommitted changes vs. HEAD.');
      currentPlan = null;
      viewProvider?.setPlan(null);
      return;
    }
    await runAnalysis(diffText, root);
  } catch (e) {
    vscode.window.showErrorMessage(`CodeLoom: ${(e as Error).message}`);
  }
}

async function analyzeFromDiffFile(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, openLabel: 'Analyze',
    filters: { Diffs: ['diff', 'patch', 'txt'] },
  });
  if (!picked || picked.length === 0) return;
  await runAnalysis(fs.readFileSync(picked[0].fsPath, 'utf-8'), root);
}

async function runAnalysis(diffText: string, repoRoot: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('codeloom');
  const manifestPath = config.get<string>('manifestPath') || '';
  const opts: { manifest?: any } = {};
  if (manifestPath) {
    const abs = path.join(repoRoot, manifestPath);
    if (fs.existsSync(abs)) opts.manifest = new ManifestParser().loadFromFile(abs);
  }
  const analysis = new Analyzer().analyze(diffText, opts);
  currentPlan = analysis;
  viewProvider?.setPlan(analysis);
  outputChannel.appendLine(`Analyzed: ${analysis.summary.totalHunks} hunks → ${analysis.summary.totalCommits} commits`);
}

async function executePlan(dryRun: boolean): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  if (!currentPlan) { vscode.window.showWarningMessage('CodeLoom: run "Analyze Working Tree" first.'); return; }
  const config = vscode.workspace.getConfiguration('codeloom');
  const branch = config.get<string>('defaultBranch') || undefined;

  if (!dryRun) {
    const choice = await vscode.window.showWarningMessage(
      `CodeLoom will create ${currentPlan.commits.length} real commits${branch ? ` on branch ${branch}` : ''}. Continue?`,
      { modal: true }, 'Execute'
    );
    if (choice !== 'Execute') return;
  }

  const result: ExecutionResult = await new GitExecutor({ cwd: root }).execute(currentPlan, { dryRun, branch, allowDirty: true });
  outputChannel.show(true);
  outputChannel.appendLine(`\n=== ${dryRun ? 'DRY RUN' : 'EXECUTE'} ===`);
  for (const c of result.commits) {
    outputChannel.appendLine(`  ${result.dryRun ? '(dry-run)' : c.sha.slice(0, 7)}  ${c.title}`);
  }
  if (result.success) {
    vscode.window.showInformationMessage(dryRun
      ? `CodeLoom: dry-run shows ${result.commits.length} commits.`
      : `CodeLoom: created ${result.commits.length} commits.`);
  } else {
    vscode.window.showErrorMessage(`CodeLoom: ${result.error ?? 'execution failed'}`);
  }
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { vscode.window.showWarningMessage('CodeLoom: no workspace open.'); return undefined; }
  return folders[0].uri.fsPath;
}
