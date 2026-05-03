/**
 * planView.test.ts
 * Unit tests for PlanViewProvider GUI — serialisation, HTML structure,
 * message routing, and state management.
 */

import { PlanViewProvider, serializePlan, buildHtml, SerializablePlan } from '../planView';
import type { AnalysisResult } from 'codeloom/dist/types';

// vscode is auto-redirected to src/__mocks__/vscode.ts via jest.config moduleNameMapper

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    hunks: [],
    commits: [
      {
        id: 'c1',
        order: 0,
        title: 'feat: add login',
        description: 'Adds user authentication',
        intent: 'feature',
        risk: 'low',
        tracesTo: ['REQ-001'],
        dependsOn: [],
        hunks: [
          {
            id: 'h1', filePath: 'src/auth.ts',
            oldStart: 1, oldLines: 1, newStart: 1, newLines: 5,
            header: '@@ -1 +1,5 @@', rawContent: '+export function login() {}',
            addedLines: ['+export function login() {}'], removedLines: [], contextLines: [],
            changeType: 'modified', definedSymbols: [], referencedSymbols: [],
            addedImports: [], intent: 'feature', risk: 'low', confidence: 0.9,
            dependsOn: [], tracesTo: [], description: 'Add login function',
          },
        ],
      },
      {
        id: 'c2',
        order: 1,
        title: 'fix: null check in parser',
        description: '',
        intent: 'bugfix',
        risk: 'critical',
        tracesTo: [],
        dependsOn: ['c1'],
        hunks: [
          {
            id: 'h2', filePath: 'src/parser.ts',
            oldStart: 10, oldLines: 1, newStart: 10, newLines: 2,
            header: '@@ -10 +10,2 @@', rawContent: '+if (!x) return;',
            addedLines: ['+if (!x) return;'], removedLines: [], contextLines: [],
            changeType: 'modified', definedSymbols: [], referencedSymbols: [],
            addedImports: [], intent: 'bugfix', risk: 'critical', confidence: 0.95,
            dependsOn: [], tracesTo: [], description: 'Add null check',
          },
        ],
      },
    ],
    manifest: undefined,
    traceability: {
      requirementToHunks: new Map([['REQ-001', ['h1']]]),
      hunkToRequirements: new Map([['h1', ['REQ-001']]]),
      uncoveredRequirements: [],
      untraceableHunks: ['h2'],
    },
    summary: {
      totalHunks: 2,
      totalCommits: 2,
      riskDistribution: { critical: 1, medium: 0, low: 1 },
      intentDistribution: {
        feature: 1, refactor: 0, bugfix: 1, security: 0,
        test: 0, docs: 0, config: 0, style: 0, unknown: 0,
      },
      requirementsCovered: 1,
      requirementsTotal: 1,
      gaps: [],
    },
    ...overrides,
  };
}

function makeMockWebview() {
  return {
    options: {} as any,
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn(),
  };
}

function makeMockView(webview = makeMockWebview()) {
  return {
    webview,
    visible: true,
    onDidChangeVisibility: jest.fn(),
  };
}

// ─── serializePlan ────────────────────────────────────────────────────────────

describe('serializePlan', () => {
  it('returns null when given null', () => {
    expect(serializePlan(null)).toBeNull();
  });

  it('produces a JSON-serialisable object (no Maps)', () => {
    const result = serializePlan(makeAnalysis());
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('preserves commit count and ordering', () => {
    const result = serializePlan(makeAnalysis())!;
    expect(result.commits).toHaveLength(2);
    expect(result.commits[0].order).toBe(0);
    expect(result.commits[1].order).toBe(1);
  });

  it('preserves commit title, intent, risk, and tracesTo', () => {
    const result = serializePlan(makeAnalysis())!;
    const c0 = result.commits[0];
    expect(c0.title).toBe('feat: add login');
    expect(c0.intent).toBe('feature');
    expect(c0.risk).toBe('low');
    expect(c0.tracesTo).toEqual(['REQ-001']);
  });

  it('preserves file path inside hunks', () => {
    const result = serializePlan(makeAnalysis())!;
    expect(result.commits[0].hunks[0].filePath).toBe('src/auth.ts');
  });

  it('preserves summary fields', () => {
    const result = serializePlan(makeAnalysis())!;
    expect(result.summary.totalHunks).toBe(2);
    expect(result.summary.totalCommits).toBe(2);
    expect(result.summary.riskDistribution).toEqual({ critical: 1, medium: 0, low: 1 });
    expect(result.summary.requirementsCovered).toBe(1);
    expect(result.summary.requirementsTotal).toBe(1);
  });

  it('defaults requirementsTotal to 0 when undefined', () => {
    const analysis = makeAnalysis();
    (analysis.summary as any).requirementsTotal = undefined;
    const result = serializePlan(analysis)!;
    expect(result.summary.requirementsTotal).toBe(0);
  });

  it('strips Map objects from traceability (no Map in output)', () => {
    const result = serializePlan(makeAnalysis())!;
    // Walk the serialised object — no value should be a Map
    const str = JSON.stringify(result);
    expect(str).not.toContain('"Map"');
  });
});

// ─── buildHtml ────────────────────────────────────────────────────────────────

describe('buildHtml', () => {
  const NONCE = 'test-nonce-abc123';
  let html: string;

  beforeAll(() => { html = buildHtml(NONCE); });

  it('starts with <!DOCTYPE html>', () => {
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('closes the html tag', () => {
    expect(html).toContain('</html>');
  });

  it('embeds the nonce in the script tag', () => {
    expect(html).toContain(`nonce="${NONCE}"`);
  });

  it('sets CSP meta tag that includes the nonce', () => {
    expect(html).toContain(`'nonce-${NONCE}'`);
  });

  it('disallows default-src in CSP (no external resources)', () => {
    expect(html).toContain("default-src 'none'");
  });

  it('renders Analyze button', () => {
    expect(html).toContain("send('analyze')");
    expect(html).toContain('Analyze');
  });

  it('renders Analyze Staged button', () => {
    expect(html).toContain("send('analyzeStaged')");
    expect(html).toContain('Analyze Staged');
  });

  it('renders Dry Run button', () => {
    expect(html).toContain("send('dryRun')");
    expect(html).toContain('Dry Run');
  });

  it('renders Execute button', () => {
    expect(html).toContain("send('execute')");
    expect(html).toContain('Execute');
  });

  it('calls acquireVsCodeApi()', () => {
    expect(html).toContain('acquireVsCodeApi()');
  });

  it('defines renderPlan function', () => {
    expect(html).toContain('function renderPlan(');
  });

  it('listens for postMessage events', () => {
    expect(html).toContain("addEventListener('message'");
  });

  it('handles loading messages', () => {
    expect(html).toContain("msg.type==='loading'");
  });

  it('handles error messages', () => {
    expect(html).toContain("msg.type==='error'");
  });

  it('handles update messages', () => {
    expect(html).toContain("msg.type==='update'");
  });

  it('shows spinner element for loading state', () => {
    expect(html).toContain('class="spin"');
  });

  it('uses VS Code CSS variables for theming', () => {
    expect(html).toContain('var(--vscode-button-background)');
    expect(html).toContain('var(--vscode-foreground)');
  });

  it('risk colours for critical commits', () => {
    expect(html).toContain('.commit.crit');
  });

  it('risk colours for medium commits', () => {
    expect(html).toContain('.commit.med');
  });

  it('risk colours for low commits', () => {
    expect(html).toContain('.commit.low');
  });

  it('does not embed the nonce in a different position', () => {
    // Nonce must appear in script tag, not in random places
    const nonceParts = html.split(NONCE);
    // Should appear exactly twice: in the CSP meta and in the script nonce attr
    expect(nonceParts.length - 1).toBe(2);
  });
});

// ─── PlanViewProvider ─────────────────────────────────────────────────────────

describe('PlanViewProvider', () => {
  let provider: PlanViewProvider;
  let mockWebview: ReturnType<typeof makeMockWebview>;
  let mockView: ReturnType<typeof makeMockView>;

  beforeEach(() => {
    jest.clearAllMocks();
    provider   = new PlanViewProvider({ fsPath: '/ext' } as any);
    mockWebview = makeMockWebview();
    mockView    = makeMockView(mockWebview);
  });

  it('exposes the correct viewType constant', () => {
    expect(PlanViewProvider.viewType).toBe('codeloom.planView');
  });

  // ── resolveWebviewView ──────────────────────────────────────────────────────

  describe('resolveWebviewView', () => {
    it('sets webview HTML', () => {
      provider.resolveWebviewView(mockView as any);
      expect(mockWebview.html).toContain('<!DOCTYPE html>');
    });

    it('enables scripts on the webview', () => {
      provider.resolveWebviewView(mockView as any);
      expect(mockWebview.options).toMatchObject({ enableScripts: true });
    });

    it('registers onDidReceiveMessage handler', () => {
      provider.resolveWebviewView(mockView as any);
      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalledWith(expect.any(Function));
    });

    it('registers onDidChangeVisibility handler', () => {
      provider.resolveWebviewView(mockView as any);
      expect(mockView.onDidChangeVisibility).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── message routing ─────────────────────────────────────────────────────────

  describe('message routing from webview', () => {
    let vscodeModule: any;
    let handler: (msg: any) => void;

    beforeEach(() => {
      vscodeModule = require('vscode');
      provider.resolveWebviewView(mockView as any);
      handler = (mockWebview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
    });

    it('routes analyze → codeloom.analyzeWorkingTree', () => {
      handler({ command: 'analyze' });
      expect(vscodeModule.commands.executeCommand).toHaveBeenCalledWith('codeloom.analyzeWorkingTree');
    });

    it('routes analyzeStaged → codeloom.analyzeStaged', () => {
      handler({ command: 'analyzeStaged' });
      expect(vscodeModule.commands.executeCommand).toHaveBeenCalledWith('codeloom.analyzeStaged');
    });

    it('routes dryRun → codeloom.dryRun', () => {
      handler({ command: 'dryRun' });
      expect(vscodeModule.commands.executeCommand).toHaveBeenCalledWith('codeloom.dryRun');
    });

    it('routes execute → codeloom.executePlan', () => {
      handler({ command: 'execute' });
      expect(vscodeModule.commands.executeCommand).toHaveBeenCalledWith('codeloom.executePlan');
    });

    it('ignores unknown commands without throwing', () => {
      expect(() => handler({ command: 'unknownCommand' })).not.toThrow();
    });

    it('ignores null message without throwing', () => {
      expect(() => handler(null)).not.toThrow();
    });
  });

  // ── setPlan ─────────────────────────────────────────────────────────────────

  describe('setPlan', () => {
    it('posts update message with serialised plan', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setPlan(makeAnalysis());
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update' })
      );
    });

    it('posts update message with null plan', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setPlan(null);
      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'update', plan: null });
    });

    it('serialised plan in postMessage is JSON-safe', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setPlan(makeAnalysis());
      const call = (mockWebview.postMessage as jest.Mock).mock.calls.find(
        c => c[0]?.type === 'update'
      );
      expect(() => JSON.stringify(call![0])).not.toThrow();
    });

    it('does not throw when called before view is resolved', () => {
      expect(() => provider.setPlan(makeAnalysis())).not.toThrow();
    });
  });

  // ── setLoading ──────────────────────────────────────────────────────────────

  describe('setLoading', () => {
    it('posts loading:true', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setLoading(true);
      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'loading', loading: true });
    });

    it('posts loading:false', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setLoading(false);
      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'loading', loading: false });
    });

    it('does not throw when called before view is resolved', () => {
      expect(() => provider.setLoading(true)).not.toThrow();
    });
  });

  // ── setError ────────────────────────────────────────────────────────────────

  describe('setError', () => {
    it('posts error message', () => {
      provider.resolveWebviewView(mockView as any);
      provider.setError('git failed');
      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'error', message: 'git failed' });
    });

    it('does not throw when called before view is resolved', () => {
      expect(() => provider.setError('oops')).not.toThrow();
    });
  });

  // ── visibility change ────────────────────────────────────────────────────────

  describe('onDidChangeVisibility', () => {
    it('re-sends plan when view becomes visible', () => {
      provider.resolveWebviewView(mockView as any);
      // Capture handler BEFORE clearing mocks
      const visHandler = (mockView.onDidChangeVisibility as jest.Mock).mock.calls[0][0];
      const analysis = makeAnalysis();
      provider.setPlan(analysis);
      jest.clearAllMocks();                           // reset call count

      // Simulate tab becoming visible
      mockView.visible = true;
      visHandler();

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update' })
      );
    });
  });
});
