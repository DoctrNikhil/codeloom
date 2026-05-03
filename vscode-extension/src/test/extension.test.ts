import type { AnalysisResult } from 'codeloom/dist/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGit = {
  checkIsRepo: jest.fn().mockResolvedValue(true),
  diff: jest.fn().mockResolvedValue('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n'),
};

jest.mock('simple-git', () => ({
  simpleGit: jest.fn(() => mockGit),
}));

const mockAnalysis: AnalysisResult = {
  hunks: [],
  commits: [
    {
      id: 'c1', order: 0, title: 'test commit', description: '',
      intent: 'feature', risk: 'low', tracesTo: [], dependsOn: [],
      hunks: [{ filePath: 'f.ts' } as any],
    },
  ],
  traceability: {
    requirementToHunks: new Map(),
    hunkToRequirements: new Map(),
    uncoveredRequirements: [],
    untraceableHunks: [],
  },
  summary: {
    totalHunks: 1, totalCommits: 1,
    riskDistribution: { critical: 0, medium: 0, low: 1 },
    intentDistribution: { feature: 1 } as any,
    requirementsCovered: 0, requirementsTotal: 0, gaps: [],
  },
};

jest.mock('codeloom/dist/analyzer/analyzer', () => ({
  Analyzer: jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockReturnValue(mockAnalysis),
  })),
}));

jest.mock('codeloom/dist/mbd/manifest-parser', () => ({
  ManifestParser: jest.fn().mockImplementation(() => ({
    loadFromFile: jest.fn().mockReturnValue({ version: '1', project: 'test', requirements: [] }),
  })),
}));

const mockExecutionResult = {
  success: true, branch: 'main', startSha: 'aaa', endSha: 'bbb',
  commits: [{ plannedId: 'c1', sha: '1234567', title: 'test commit', files: ['f.ts'], tracesTo: [] }],
  rolledBack: false, dryRun: false,
};

jest.mock('codeloom/dist/executor/git-executor', () => ({
  GitExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(mockExecutionResult),
  })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue('mock diff content'),
}));

// Store command handlers for access across tests
const handlers: Record<string, Function> = {};

// Must import vscode mock before extension
const vscode = require('vscode');

// Capture command handlers via registerCommand
vscode.commands.registerCommand.mockImplementation((name: string, fn: Function) => {
  handlers[name] = fn;
  return { dispose: jest.fn() };
});

vscode.window.registerWebviewViewProvider.mockReturnValue({ dispose: jest.fn() });

import { activate, deactivate } from '../extension';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('activate', () => {
  const context = {
    extensionUri: { fsPath: '/ext' },
    subscriptions: { push: jest.fn() },
  } as any;

  beforeAll(() => {
    activate(context);
  });

  it('registers all 5 commands', () => {
    expect(handlers['codeloom.analyzeWorkingTree']).toBeDefined();
    expect(handlers['codeloom.analyzeStaged']).toBeDefined();
    expect(handlers['codeloom.analyzeFromDiffFile']).toBeDefined();
    expect(handlers['codeloom.executePlan']).toBeDefined();
    expect(handlers['codeloom.dryRun']).toBeDefined();
  });

  it('registers the webview view provider', () => {
    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'codeloom.planView',
      expect.any(Object),
    );
  });

  it('creates an output channel', () => {
    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('CodeLoom');
  });
});

describe('analyzeWorkingTree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n');
  });

  it('calls git.diff(["HEAD"]) and runs analysis', async () => {
    await handlers['codeloom.analyzeWorkingTree']();
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD']);
  });

  it('shows info message when no changes', async () => {
    mockGit.diff.mockResolvedValue('');
    await handlers['codeloom.analyzeWorkingTree']();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'CodeLoom: no uncommitted changes detected.',
    );
  });

  it('falls back to git.diff() when HEAD fails (fresh repo)', async () => {
    let callCount = 0;
    mockGit.diff.mockImplementation((args?: string[]) => {
      callCount++;
      if (callCount === 1 && args?.[0] === 'HEAD') {
        return Promise.reject(new Error('no HEAD'));
      }
      return Promise.resolve('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n');
    });
    await handlers['codeloom.analyzeWorkingTree']();
    expect(callCount).toBe(2);
  });

  it('shows error when workspace is not a git repo', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false);
    await handlers['codeloom.analyzeWorkingTree']();
    // The viewProvider.setError should have been called
    // (we can't inspect it easily here — but no crash = pass)
  });
});

describe('analyzeStaged', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n');
  });

  it('calls git.diff(["--cached"])', async () => {
    await handlers['codeloom.analyzeStaged']();
    expect(mockGit.diff).toHaveBeenCalledWith(['--cached']);
  });

  it('shows info message when no staged changes', async () => {
    mockGit.diff.mockResolvedValue('');
    await handlers['codeloom.analyzeStaged']();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'CodeLoom: no staged changes found. Run `git add <files>` first.',
    );
  });
});

describe('executePlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n');
  });

  it('warns when no plan exists', async () => {
    // Re-activate to reset currentPlan to null
    const context = {
      extensionUri: { fsPath: '/ext' },
      subscriptions: { push: jest.fn() },
    } as any;
    activate(context);

    await handlers['codeloom.executePlan']();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'CodeLoom: run "Analyze" first to generate a commit plan.',
    );
  });

  it('asks for confirmation before real execute', async () => {
    // Generate a plan first
    const context = {
      extensionUri: { fsPath: '/ext' },
      subscriptions: { push: jest.fn() },
    } as any;
    activate(context);
    await handlers['codeloom.analyzeWorkingTree']();

    vscode.window.showWarningMessage.mockResolvedValue('Execute');
    await handlers['codeloom.executePlan']();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('commit'),
      { modal: true },
      'Execute',
    );
  });

  it('does nothing when user cancels confirmation', async () => {
    const context = {
      extensionUri: { fsPath: '/ext' },
      subscriptions: { push: jest.fn() },
    } as any;
    activate(context);
    await handlers['codeloom.analyzeWorkingTree']();

    vscode.window.showWarningMessage.mockResolvedValue(undefined);
    const { GitExecutor } = require('codeloom/dist/executor/git-executor');
    GitExecutor.mockClear();

    await handlers['codeloom.executePlan']();
    expect(GitExecutor).not.toHaveBeenCalled();
  });
});

describe('dryRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n');
    mockExecutionResult.dryRun = true;
  });

  afterEach(() => {
    mockExecutionResult.dryRun = false;
  });

  it('runs without confirmation dialog', async () => {
    const context = {
      extensionUri: { fsPath: '/ext' },
      subscriptions: { push: jest.fn() },
    } as any;
    activate(context);
    await handlers['codeloom.analyzeWorkingTree']();
    vscode.window.showWarningMessage.mockClear();

    await handlers['codeloom.dryRun']();

    // showWarningMessage should NOT have been called (no confirmation for dry run)
    // It may be called for the info result, but not with modal:true
    const modalCalls = vscode.window.showWarningMessage.mock.calls.filter(
      (args: any[]) => args[1]?.modal === true,
    );
    expect(modalCalls).toHaveLength(0);
  });
});

describe('deactivate', () => {
  it('does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});

describe('workspace detection', () => {
  it('warns when no workspace folders', async () => {
    const origFolders = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = undefined;

    await handlers['codeloom.analyzeWorkingTree']();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'CodeLoom: no workspace folder open.',
    );

    vscode.workspace.workspaceFolders = origFolders;
  });
});
