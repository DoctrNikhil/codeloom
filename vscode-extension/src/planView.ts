import * as vscode from 'vscode';
import type { AnalysisResult } from 'codeloom/dist/types';

// ─── Serialisable types (Maps can't cross postMessage) ───────────────────────

export interface SerializableCommit {
  id: string;
  order: number;
  title: string;
  intent: string;
  risk: string;
  tracesTo: string[];
  hunks: Array<{ filePath: string }>;
}

export interface SerializablePlan {
  commits: SerializableCommit[];
  summary: {
    totalHunks: number;
    totalCommits: number;
    riskDistribution: { critical: number; medium: number; low: number };
    requirementsCovered: number;
    requirementsTotal: number;
  };
}

/** Convert an AnalysisResult into a plain-object form safe for postMessage. */
export function serializePlan(plan: AnalysisResult | null): SerializablePlan | null {
  if (!plan) return null;
  return {
    commits: plan.commits.map(c => ({
      id: c.id,
      order: c.order,
      title: c.title,
      intent: c.intent,
      risk: c.risk,
      tracesTo: c.tracesTo,
      hunks: c.hunks.map(h => ({ filePath: h.filePath })),
    })),
    summary: {
      totalHunks: plan.summary.totalHunks,
      totalCommits: plan.summary.totalCommits,
      riskDistribution: { ...plan.summary.riskDistribution },
      requirementsCovered: plan.summary.requirementsCovered,
      requirementsTotal: plan.summary.requirementsTotal ?? 0,
    },
  };
}

// ─── Webview provider ────────────────────────────────────────────────────────

export class PlanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeloom.planView';

  private view?: vscode.WebviewView;
  private latest: AnalysisResult | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml(view.webview);

    // Deliver any plan that arrived before the webview was visible
    setTimeout(() => this.postPlan(this.latest), 50);

    // Route button clicks from webview → VS Code commands
    view.webview.onDidReceiveMessage(msg => {
      switch (msg?.command) {
        case 'analyze':       vscode.commands.executeCommand('codeloom.analyzeWorkingTree'); break;
        case 'analyzeStaged': vscode.commands.executeCommand('codeloom.analyzeStaged');      break;
        case 'dryRun':        vscode.commands.executeCommand('codeloom.dryRun');             break;
        case 'execute':       vscode.commands.executeCommand('codeloom.executePlan');        break;
      }
    });

    // Re-send plan when the tab becomes visible again
    view.onDidChangeVisibility(() => {
      if (view.visible) this.postPlan(this.latest);
    });
  }

  setPlan(plan: AnalysisResult | null): void {
    this.latest = plan;
    this.postPlan(plan);
  }

  setLoading(on: boolean): void {
    this.view?.webview.postMessage({ type: 'loading', loading: on });
  }

  setError(message: string): void {
    this.view?.webview.postMessage({ type: 'error', message });
  }

  private postPlan(plan: AnalysisResult | null): void {
    this.view?.webview.postMessage({ type: 'update', plan: serializePlan(plan) });
  }

  /** Exposed so tests can call it without a real Webview. */
  getHtml(_webview: vscode.Webview): string {
    return buildHtml(getNonce());
  }
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) n += chars[Math.floor(Math.random() * chars.length)];
  return n;
}

/** Pure function — exported so tests can verify the HTML. */
export function buildHtml(nonce: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);
         color:var(--vscode-foreground);padding:8px;line-height:1.4}

    .actions{display:flex;gap:6px;padding:6px 0 10px;flex-wrap:wrap}
    button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);
           border:none;padding:5px 10px;cursor:pointer;border-radius:2px;font-size:12px;white-space:nowrap}
    button:hover{background:var(--vscode-button-hoverBackground)}
    button:disabled{opacity:.45;cursor:default}
    button.sec{background:var(--vscode-button-secondaryBackground,#3a3d41);
               color:var(--vscode-button-secondaryForeground,#ccc)}
    button.sec:hover{background:var(--vscode-button-secondaryHoverBackground,#45494e)}

    #status{font-size:11px;min-height:18px;color:var(--vscode-descriptionForeground);margin-bottom:4px}
    .spin{display:inline-block;width:11px;height:11px;border:2px solid var(--vscode-descriptionForeground);
          border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;
          vertical-align:middle;margin-right:5px}
    @keyframes spin{to{transform:rotate(360deg)}}

    .empty{color:var(--vscode-descriptionForeground);padding:24px 4px;text-align:center}
    .empty b{color:var(--vscode-foreground)}
    .err{background:var(--vscode-inputValidation-errorBackground,rgba(255,0,0,.1));
         border:1px solid var(--vscode-inputValidation-errorBorder,#be1100);
         padding:8px 10px;border-radius:2px;font-size:12px;margin:6px 0}

    .sec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;
               color:var(--vscode-descriptionForeground);margin:12px 0 5px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
    .card{background:var(--vscode-editorWidget-background,var(--vscode-editor-background));
          padding:8px 10px;border-radius:3px;border:1px solid var(--vscode-widget-border,transparent)}
    .card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.4px;
               color:var(--vscode-descriptionForeground);margin-bottom:2px}
    .card .val{font-size:20px;font-weight:700;line-height:1}

    .commit{border-left:3px solid var(--vscode-textBlockQuote-border);padding:7px 10px;
            margin:5px 0;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));
            border-radius:0 3px 3px 0}
    .commit.crit{border-left-color:#f14c4c}
    .commit.med {border-left-color:#e9a700}
    .commit.low {border-left-color:#4ec9b0}
    .ctitle{font-weight:600;font-size:12px;word-break:break-word}
    .cmeta{font-size:11px;color:var(--vscode-descriptionForeground);
           margin-top:3px;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
    .badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;
           background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
    .badge.crit{background:rgba(241,76,76,.18);color:#f14c4c}
    .badge.med {background:rgba(233,167,0,.18);color:#e9a700}
    .badge.low {background:rgba(78,201,176,.18);color:#4ec9b0}
    .files{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;
           color:var(--vscode-descriptionForeground);margin-top:4px;word-break:break-all}
  </style>
</head>
<body>
  <div class="actions">
    <button id="btn-analyze">Analyze</button>
    <button id="btn-staged" class="sec">Analyze Staged</button>
    <button id="btn-dryrun" class="sec">Dry Run</button>
    <button id="btn-execute">Execute</button>
  </div>
  <div id="status"></div>
  <div id="content">
    <div class="empty">Click <b>Analyze</b> to inspect working-tree changes,<br>
    or <b>Analyze Staged</b> for <code>git add</code>'d files.</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    /* ── Wire buttons via addEventListener (CSP blocks inline onclick) ── */
    document.getElementById('btn-analyze').addEventListener('click', () => {
      vscode.postMessage({ command: 'analyze' });
    });
    document.getElementById('btn-staged').addEventListener('click', () => {
      vscode.postMessage({ command: 'analyzeStaged' });
    });
    document.getElementById('btn-dryrun').addEventListener('click', () => {
      vscode.postMessage({ command: 'dryRun' });
    });
    document.getElementById('btn-execute').addEventListener('click', () => {
      vscode.postMessage({ command: 'execute' });
    });

    /* ── Helpers ── */
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const btnIds = ['btn-analyze','btn-staged','btn-dryrun','btn-execute'];

    function setLoading(on) {
      document.getElementById('status').innerHTML =
        on ? '<span class="spin"></span>Analyzing…' : '';
      btnIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = on;
      });
    }

    function showError(msg) {
      document.getElementById('status').innerHTML = '';
      document.getElementById('content').innerHTML =
        '<div class="err">&#9888; ' + esc(msg) + '</div>' +
        '<div class="empty" style="padding-top:8px">Fix the issue, then click <b>Analyze</b>.</div>';
    }

    function renderPlan(plan) {
      const el = document.getElementById('content');
      if (!plan) {
        el.innerHTML = '<div class="empty">Click <b>Analyze</b> to inspect working-tree changes,<br>' +
          'or <b>Analyze Staged</b> for <code>git add</code>\\\'d files.</div>';
        return;
      }

      const r = plan.summary.riskDistribution;
      const cov = plan.summary.requirementsCovered;
      const tot = plan.summary.requirementsTotal;

      let h = '<div class="sec-title">Summary</div><div class="grid">';
      h += '<div class="card"><div class="lbl">Hunks</div><div class="val">' + plan.summary.totalHunks + '</div></div>';
      h += '<div class="card"><div class="lbl">Commits</div><div class="val">' + plan.summary.totalCommits + '</div></div>';
      h += '<div class="card"><div class="lbl">Risk</div><div class="val" style="font-size:13px">' +
           '<span style="color:#f14c4c">' + r.critical + 'c</span> ' +
           '<span style="color:#e9a700">' + r.medium + 'm</span> ' +
           '<span style="color:#4ec9b0">' + r.low + 'l</span></div></div>';
      h += '<div class="card"><div class="lbl">Coverage</div><div class="val" style="font-size:16px">' +
           (tot > 0 ? cov + '/' + tot : '—') + '</div></div>';
      h += '</div>';

      const sorted = plan.commits.slice().sort((a, b) => a.order - b.order);
      h += '<div class="sec-title">Planned Commits (' + sorted.length + ')</div>';

      for (const c of sorted) {
        const cls = c.risk === 'critical' ? 'crit' : c.risk === 'medium' ? 'med' : 'low';
        const files = [...new Set(c.hunks.map(x => x.filePath))];
        const traces = c.tracesTo.map(t => '<span class="badge">' + esc(t) + '</span>').join(' ');
        h += '<div class="commit ' + cls + '">';
        h += '<div class="ctitle">#' + (c.order + 1) + ' &middot; ' + esc(c.title) + '</div>';
        h += '<div class="cmeta">' +
             '<span class="badge ' + cls + '">' + esc(c.risk) + '</span>' +
             '<span class="badge">' + esc(c.intent) + '</span>' +
             '<span>' + c.hunks.length + ' hunk' + (c.hunks.length === 1 ? '' : 's') + '</span>' +
             (traces ? '<span>' + traces + '</span>' : '') + '</div>';
        h += '<div class="files">' + files.map(esc).join(' &middot; ') + '</div>';
        h += '</div>';
      }
      el.innerHTML = h;
    }

    /* ── Listen for messages from the extension host ── */
    window.addEventListener('message', ev => {
      const msg = ev.data;
      if      (msg.type === 'update')  { setLoading(false); renderPlan(msg.plan); }
      else if (msg.type === 'loading') { setLoading(msg.loading); }
      else if (msg.type === 'error')   { setLoading(false); showError(msg.message); }
    });
  </script>
</body>
</html>`;
}
