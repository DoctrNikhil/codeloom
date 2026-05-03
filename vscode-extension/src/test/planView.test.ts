import { buildHtml, serializePlan, PlanViewProvider } from '../planView';
import type { SerializablePlan } from '../planView';
import type { AnalysisResult } from 'codeloom/dist/types';

// ─── serializePlan ───────────────────────────────────────────────────────────

describe('serializePlan', () => {
  it('returns null for null input', () => {
    expect(serializePlan(null)).toBeNull();
  });

  it('converts a valid plan to JSON-safe structure', () => {
    const plan = makePlan();
    const result = serializePlan(plan)!;
    // Must be JSON-serialisable (no Maps, no circular refs)
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('preserves summary fields', () => {
    const plan = makePlan();
    const r = serializePlan(plan)!;
    expect(r.summary.totalHunks).toBe(2);
    expect(r.summary.totalCommits).toBe(1);
    expect(r.summary.riskDistribution).toEqual({ critical: 0, medium: 1, low: 1 });
    expect(r.summary.requirementsCovered).toBe(1);
    expect(r.summary.requirementsTotal).toBe(2);
  });

  it('preserves commit fields', () => {
    const r = serializePlan(makePlan())!;
    expect(r.commits).toHaveLength(1);
    const c = r.commits[0];
    expect(c.id).toBe('commit_1');
    expect(c.title).toBe('feat: add auth');
    expect(c.intent).toBe('feature');
    expect(c.risk).toBe('medium');
    expect(c.tracesTo).toEqual(['REQ-001']);
    expect(c.hunks).toHaveLength(2);
    expect(c.hunks[0].filePath).toBe('src/auth.ts');
  });

  it('handles empty commits array', () => {
    const plan = makePlan();
    plan.commits = [];
    plan.summary.totalCommits = 0;
    const r = serializePlan(plan)!;
    expect(r.commits).toEqual([]);
    expect(r.summary.totalCommits).toBe(0);
  });

  it('defaults requirementsTotal to 0 when undefined', () => {
    const plan = makePlan();
    (plan.summary as any).requirementsTotal = undefined;
    const r = serializePlan(plan)!;
    expect(r.summary.requirementsTotal).toBe(0);
  });

  it('converts Map-based traceability without crashing', () => {
    const plan = makePlan();
    // traceability field is a Map — serializePlan should not try to copy it
    expect(() => serializePlan(plan)).not.toThrow();
  });
});

// ─── buildHtml ───────────────────────────────────────────────────────────────

describe('buildHtml', () => {
  const nonce = 'TEST_NONCE_abc123';
  let html: string;

  beforeAll(() => {
    html = buildHtml(nonce);
  });

  it('starts with <!DOCTYPE html>', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('embeds the nonce in CSP meta tag', () => {
    expect(html).toContain(`script-src 'nonce-${nonce}'`);
  });

  it('embeds the nonce on the script tag', () => {
    expect(html).toContain(`<script nonce="${nonce}">`);
  });

  it('has NO inline onclick attributes', () => {
    expect(html).not.toContain('onclick=');
  });

  it('wires buttons via addEventListener', () => {
    expect(html).toContain("getElementById('btn-analyze').addEventListener('click'");
    expect(html).toContain("getElementById('btn-staged').addEventListener('click'");
    expect(html).toContain("getElementById('btn-dryrun').addEventListener('click'");
    expect(html).toContain("getElementById('btn-execute').addEventListener('click'");
  });

  it('has all four buttons with correct IDs', () => {
    expect(html).toContain('id="btn-analyze"');
    expect(html).toContain('id="btn-staged"');
    expect(html).toContain('id="btn-dryrun"');
    expect(html).toContain('id="btn-execute"');
  });

  it('posts the correct command for each button', () => {
    expect(html).toContain("command: 'analyze'");
    expect(html).toContain("command: 'analyzeStaged'");
    expect(html).toContain("command: 'dryRun'");
    expect(html).toContain("command: 'execute'");
  });

  it('calls acquireVsCodeApi()', () => {
    expect(html).toContain('acquireVsCodeApi()');
  });

  it('listens for message events', () => {
    expect(html).toContain("window.addEventListener('message'");
  });

  it('has risk-color CSS classes', () => {
    expect(html).toContain('.commit.crit');
    expect(html).toContain('.commit.med');
    expect(html).toContain('.commit.low');
  });

  it('has secondary button class', () => {
    expect(html).toContain('class="sec"');
  });

  it('contains spinner CSS', () => {
    expect(html).toContain('@keyframes spin');
  });
});

// ─── PlanViewProvider ────────────────────────────────────────────────────────

describe('PlanViewProvider', () => {
  it('has the correct static viewType', () => {
    expect(PlanViewProvider.viewType).toBe('codeloom.planView');
  });

  it('resolveWebviewView sets HTML and listens for messages', () => {
    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    const onMessage = jest.fn();
    const onVisibility = jest.fn();
    const fakeView = {
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: onMessage,
        postMessage: jest.fn(),
      },
      onDidChangeVisibility: onVisibility,
    } as any;

    provider.resolveWebviewView(fakeView);

    // HTML was set
    expect(fakeView.webview.html).toBeTruthy();
    expect(fakeView.webview.html).toContain('<!DOCTYPE html>');

    // Scripts enabled
    expect(fakeView.webview.options.enableScripts).toBe(true);

    // Message & visibility listeners registered
    expect(onMessage).toHaveBeenCalledWith(expect.any(Function));
    expect(onVisibility).toHaveBeenCalledWith(expect.any(Function));
  });

  it('routes webview messages to VS Code commands', () => {
    const { commands } = require('vscode');
    commands.executeCommand.mockClear();

    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    let handler: (msg: any) => void = () => {};
    const fakeView = {
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: (fn: any) => { handler = fn; },
        postMessage: jest.fn(),
      },
      onDidChangeVisibility: jest.fn(),
    } as any;

    provider.resolveWebviewView(fakeView);

    const cmds: [string, string][] = [
      ['analyze', 'codeloom.analyzeWorkingTree'],
      ['analyzeStaged', 'codeloom.analyzeStaged'],
      ['dryRun', 'codeloom.dryRun'],
      ['execute', 'codeloom.executePlan'],
    ];

    for (const [msgCmd, vsCmd] of cmds) {
      commands.executeCommand.mockClear();
      handler({ command: msgCmd });
      expect(commands.executeCommand).toHaveBeenCalledWith(vsCmd);
    }
  });

  it('setPlan posts serialised plan to webview', () => {
    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    const postMessage = jest.fn();
    const fakeView = {
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage,
      },
      onDidChangeVisibility: jest.fn(),
    } as any;

    provider.resolveWebviewView(fakeView);
    postMessage.mockClear();

    provider.setPlan(makePlan());
    expect(postMessage).toHaveBeenCalledWith({
      type: 'update',
      plan: expect.objectContaining({
        commits: expect.any(Array),
        summary: expect.any(Object),
      }),
    });
  });

  it('setLoading posts loading state', () => {
    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    const postMessage = jest.fn();
    const fakeView = {
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage,
      },
      onDidChangeVisibility: jest.fn(),
    } as any;

    provider.resolveWebviewView(fakeView);
    postMessage.mockClear();

    provider.setLoading(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'loading', loading: true });

    provider.setLoading(false);
    expect(postMessage).toHaveBeenCalledWith({ type: 'loading', loading: false });
  });

  it('setError posts error message', () => {
    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    const postMessage = jest.fn();
    const fakeView = {
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage,
      },
      onDidChangeVisibility: jest.fn(),
    } as any;

    provider.resolveWebviewView(fakeView);
    postMessage.mockClear();

    provider.setError('Something broke');
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', message: 'Something broke' });
  });

  it('re-sends plan when view becomes visible', () => {
    jest.useFakeTimers();
    const provider = new PlanViewProvider({ fsPath: '/ext' } as any);
    const postMessage = jest.fn();
    let visHandler: () => void = () => {};
    const fakeView = {
      visible: true,
      webview: {
        options: {} as any,
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage,
      },
      onDidChangeVisibility: (fn: any) => { visHandler = fn; },
    } as any;

    provider.resolveWebviewView(fakeView);
    jest.runAllTimers();
    postMessage.mockClear();

    provider.setPlan(makePlan());
    postMessage.mockClear();

    visHandler();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' }),
    );
    jest.useRealTimers();
  });
});

// ─── Test fixture ────────────────────────────────────────────────────────────

function makePlan(): AnalysisResult {
  return {
    hunks: [],
    commits: [
      {
        id: 'commit_1',
        order: 0,
        title: 'feat: add auth',
        description: 'Add authentication module',
        intent: 'feature',
        risk: 'medium',
        tracesTo: ['REQ-001'],
        dependsOn: [],
        hunks: [
          { filePath: 'src/auth.ts' } as any,
          { filePath: 'src/types.ts' } as any,
        ],
      },
    ],
    traceability: {
      requirementToHunks: new Map(),
      hunkToRequirements: new Map(),
      uncoveredRequirements: [],
      untraceableHunks: [],
    },
    summary: {
      totalHunks: 2,
      totalCommits: 1,
      riskDistribution: { critical: 0, medium: 1, low: 1 },
      intentDistribution: { feature: 1 } as any,
      requirementsCovered: 1,
      requirementsTotal: 2,
      gaps: [],
    },
  };
}
