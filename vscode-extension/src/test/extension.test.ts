/**
 * extension.test.ts
 * Unit tests for the extension command logic — analyzeWorkingTree,
 * analyzeStaged, executePlan, dryRun, and error paths.
 * All I/O (git, fs, codeloom modules) is mocked.
 */

import type { AnalysisResult } from 'codeloom/dist/types';

// ─── Mocks (declared before any imports that need them) ───────────────────────

// vscode is auto-redirected to src/__mocks__/vscode.ts via jest.config moduleNameMapper

const mockDiff    = jest.fn();
const mockCheckIsRepo = jest.fn();
const simpleGitInstance = {
  checkIsRepo: mockCheckIsRepo,
  diff:        mockDiff,
};
jest.mock('simple-git', () => ({ simpleGit: jest.fn(() => simpleGitInstance) }));

const mockAnalyze = jest.fn();
jest.mock('codeloom/dist/analyzer/analyzer', () => ({
  Analyzer: jest.fn().mockImplementation(() => ({ analyze: mockAnalyze })),
}));

const mockLoadFromFile = jest.fn();
jest.mock('codeloom/dist/mbd/manifest-parser', () => ({
  ManifestParser: jest.fn().mockImplementation(() => ({ loadFromFile: mockLoadFromFile })),
}));

const mockExecute = jest.fn();
jest.mock('codeloom/dist/executor/git-executor', () => ({
  GitExecutor: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'mock file content'),
  existsSync:   jest.fn(() => false),          // no manifest by default
}));

jest.mock('path', () => ({
  join: jest.fn((...parts: string[]) => parts.join('/')),
}));

// ─── Load extension AFTER all mocks are in place ─────────────────────────────

import * as vscode from 'vscode';
import { activate, deactivate } from '../extension';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    hunks: [],
    commits: [
      {
        id: 'c1', order: 0, title: 'feat: add login', description: '',
        intent: 'feature', risk: 'low', tracesTo: [], dependsOn: [],
        hunks: [{ id: 'h1', filePath: 'src/auth.ts', oldStart: 1, oldLines: 1,
          newStart: 1, newLines: 2, header: '', rawContent: '+login()',
          addedLines: ['+login()'], removedLines: [], contextLines: [],
          changeType: 'modified', definedSymbols: [], referencedSymbols: [],
          addedImports: [], intent: 'feature', risk: 'low', confidence: 0.9,
          dependsOn: [], tracesTo: [], description: '' }],
      },
    ],
    manifest: undefined,
    traceability: {
      requirementToHunks: new Map(),
      hunkToRequirements: new Map(),
      uncoveredRequirements: [],
      untraceableHunks: [],
    },
    summary: {
      totalHunks: 1, totalCommits: 1,
      riskDistribution: { critical: 0, medium: 0, low: 1 },
      intentDistribution: { feature: 1, refactor: 0, bugfix: 0, security: 0,
        test: 0, docs: 0, config: 0, style: 0, unknown: 0 },
      requirementsCovered: 0, requirementsTotal: 0, gaps: [],
    },
    ...overrides,
  };
}

function makeContext() {
  const subscriptions: any[] = [];
  return {
    extensionUri: { fsPath: '/ext' },
    subscriptions,
  } as any;
}

function makeSuccessResult() {
  return {
    success:    true,
    dryRun:     false,
    branch:     'main',
    startSha:   'abc',
    endSha:     'def',
    commits:    [{ plannedId: 'c1', sha: 'def1234', title: 'feat: add login', files: ['src/auth.ts'], tracesTo: [] }],
    rolledBack: false,
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let ctx: ReturnType<typeof makeContext>;
// Handlers stored at activate time — survive jest.clearAllMocks() calls inside tests
const handlers: Record<string, () => Promise<void>> = {};

beforeEach(() => {
  jest.clearAllMocks();

  // Default: valid git repo, non-empty diff
  mockCheckIsRepo.mockResolvedValue(true);
  mockDiff.mockResolvedValue('diff --git a/src/auth.ts b/src/auth.ts\n+login()');
  mockAnalyze.mockReturnValue(makeAnalysis());
  mockExecute.mockResolvedValue(makeSuccessResult());

  // Default: user confirms execute dialog
  (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');

  // Capture every registerCommand call so handlers survive clearAllMocks()
  (vscode.commands.registerCommand as jest.Mock).mockImplementation(
    (id: string, fn: () => Promise<void>) => { handlers[id] = fn; return { dispose: jest.fn() }; }
  );

  ctx = makeContext();
  activate(ctx);
});

afterEach(() => {
  deactivate();
});

// ─── Helper to extract registered command handlers ────────────────────────────

function getHandler(commandId: string): () => Promise<void> {
  const fn = handlers[commandId];
  if (!fn) { throw new Error(`Command not registered: ${commandId}`); }
  return fn;
}

// ─── Command registration ─────────────────────────────────────────────────────

describe('activate — command registration', () => {
  it('registers codeloom.analyzeWorkingTree', () => {
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id
    );
    expect(ids).toContain('codeloom.analyzeWorkingTree');
  });

  it('registers codeloom.analyzeStaged', () => {
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id
    );
    expect(ids).toContain('codeloom.analyzeStaged');
  });

  it('registers codeloom.analyzeFromDiffFile', () => {
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id
    );
    expect(ids).toContain('codeloom.analyzeFromDiffFile');
  });

  it('registers codeloom.executePlan', () => {
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id
    );
    expect(ids).toContain('codeloom.executePlan');
  });

  it('registers codeloom.dryRun', () => {
    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]: [string]) => id
    );
    expect(ids).toContain('codeloom.dryRun');
  });

  it('registers a WebviewViewProvider', () => {
    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalled();
  });
});

// ─── analyzeWorkingTree ───────────────────────────────────────────────────────

describe('analyzeWorkingTree', () => {
  it('calls git.diff with HEAD', async () => {
    await getHandler('codeloom.analyzeWorkingTree')();
    expect(mockDiff).toHaveBeenCalledWith(['HEAD']);
  });

  it('calls Analyzer.analyze with the diff text', async () => {
    await getHandler('codeloom.analyzeWorkingTree')();
    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.stringContaining('+login()'),
      expect.any(Object)
    );
  });

  it('shows informational message when no diff is found', async () => {
    mockDiff.mockResolvedValue('   ');          // blank diff
    await getHandler('codeloom.analyzeWorkingTree')();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('no uncommitted changes')
    );
  });

  it('falls back to plain diff when HEAD does not exist (fresh repo)', async () => {
    mockDiff
      .mockRejectedValueOnce(new Error("ambiguous argument 'HEAD'"))
      .mockResolvedValueOnce('diff --git a/new.ts b/new.ts\n+hello');
    await getHandler('codeloom.analyzeWorkingTree')();
    expect(mockDiff).toHaveBeenCalledTimes(2);
    expect(mockDiff).toHaveBeenNthCalledWith(2);   // plain git diff (no args)
  });

  it('shows error on non-git workspace', async () => {
    mockCheckIsRepo.mockResolvedValue(false);
    await getHandler('codeloom.analyzeWorkingTree')();
    // Should propagate error to webview, not crash
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('does not throw when git throws unexpectedly', async () => {
    mockDiff.mockRejectedValue(new Error('git exploded'));
    await expect(getHandler('codeloom.analyzeWorkingTree')()).resolves.not.toThrow();
  });

  it('does nothing when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = [];
    await getHandler('codeloom.analyzeWorkingTree')();
    expect(mockDiff).not.toHaveBeenCalled();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/repo' } }];
  });
});

// ─── analyzeStaged ────────────────────────────────────────────────────────────

describe('analyzeStaged', () => {
  it('calls git.diff with --cached flag', async () => {
    await getHandler('codeloom.analyzeStaged')();
    expect(mockDiff).toHaveBeenCalledWith(['--cached']);
  });

  it('shows message when nothing is staged', async () => {
    mockDiff.mockResolvedValue('');
    await getHandler('codeloom.analyzeStaged')();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('no staged changes')
    );
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('runs analysis when staged diff is non-empty', async () => {
    mockDiff.mockResolvedValue('diff --git a/x.ts b/x.ts\n+new code');
    await getHandler('codeloom.analyzeStaged')();
    expect(mockAnalyze).toHaveBeenCalled();
  });

  it('shows error on non-git workspace', async () => {
    mockCheckIsRepo.mockResolvedValue(false);
    await getHandler('codeloom.analyzeStaged')();
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});

// ─── executePlan (dryRun = false) ─────────────────────────────────────────────

describe('executePlan (real execute)', () => {
  async function setupAndExecute() {
    await getHandler('codeloom.analyzeWorkingTree')();   // populate currentPlan
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');
    mockExecute.mockResolvedValue(makeSuccessResult());
    await getHandler('codeloom.executePlan')();
  }

  it('calls GitExecutor.execute with dryRun:false', async () => {
    await setupAndExecute();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ dryRun: false })
    );
  });

  it('shows confirmation dialog before executing', async () => {
    await setupAndExecute();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('real commit'),
      expect.objectContaining({ modal: true }),
      'Execute'
    );
  });

  it('aborts when user cancels confirmation', async () => {
    await getHandler('codeloom.analyzeWorkingTree')();
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined); // cancelled
    await getHandler('codeloom.executePlan')();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('shows success message after execution', async () => {
    await setupAndExecute();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('commit')
    );
  });

  it('warns if no plan exists yet', async () => {
    // fresh activate — no analyzeWorkingTree called
    jest.clearAllMocks();
    await getHandler('codeloom.executePlan')();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Analyze')
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('shows error when execution fails', async () => {
    await getHandler('codeloom.analyzeWorkingTree')();
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');
    mockExecute.mockResolvedValue({ success: false, error: 'conflict', commits: [], dryRun: false, rolledBack: false, branch: '', startSha: '' });
    await getHandler('codeloom.executePlan')();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('conflict')
    );
  });
});

// ─── dryRun ───────────────────────────────────────────────────────────────────

describe('dryRun', () => {
  async function setupAndDryRun() {
    await getHandler('codeloom.analyzeWorkingTree')();
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ ...makeSuccessResult(), dryRun: true });
    await getHandler('codeloom.dryRun')();
  }

  it('calls GitExecutor.execute with dryRun:true', async () => {
    await setupAndDryRun();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ dryRun: true })
    );
  });

  it('does NOT show a confirmation dialog', async () => {
    await setupAndDryRun();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows informational message with dry-run result', async () => {
    await setupAndDryRun();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run')
    );
  });

  it('warns if no plan exists yet', async () => {
    jest.clearAllMocks();
    await getHandler('codeloom.dryRun')();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });
});

// ─── analyzeStaged → execute with unstageFirst ────────────────────────────────

describe('staged mode → execute passes unstageFirst:true', () => {
  it('sets unstageFirst when last analysis was staged', async () => {
    mockDiff.mockResolvedValue('diff --git a/x.ts b/x.ts\n+new');
    await getHandler('codeloom.analyzeStaged')();
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');
    mockExecute.mockResolvedValue(makeSuccessResult());
    await getHandler('codeloom.executePlan')();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ unstageFirst: true })
    );
  });

  it('sets unstageFirst:false when last analysis was working-tree', async () => {
    await getHandler('codeloom.analyzeWorkingTree')();
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');
    mockExecute.mockResolvedValue(makeSuccessResult());
    await getHandler('codeloom.executePlan')();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ unstageFirst: false })
    );
  });
});
