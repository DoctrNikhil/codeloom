import * as vscode from 'vscode';
import type { AnalysisResult } from 'codeloom/dist/types';

export class PlanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeloom.planView';
  private view?: vscode.WebviewView;
  private latest: AnalysisResult | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.render(this.latest);
    view.webview.onDidReceiveMessage(msg => {
      if (msg?.command === 'analyze') vscode.commands.executeCommand('codeloom.analyzeWorkingTree');
      else if (msg?.command === 'execute') vscode.commands.executeCommand('codeloom.executePlan');
      else if (msg?.command === 'dryRun') vscode.commands.executeCommand('codeloom.dryRun');
    });
  }

  setPlan(plan: AnalysisResult | null): void {
    this.latest = plan;
    if (this.view) this.view.webview.html = this.render(plan);
  }

  private render(plan: AnalysisResult | null): string {
    const css = `
      body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
      h2 { font-size: 14px; margin: 16px 0 8px; }
      .actions { display: flex; gap: 8px; margin-bottom: 16px; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; border-radius: 2px; font-size: 12px; }
      button:hover { background: var(--vscode-button-hoverBackground); }
      .empty { color: var(--vscode-descriptionForeground); padding: 20px; text-align: center; }
      .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
      .card { background: var(--vscode-editorWidget-background); padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-widget-border); }
      .card .label { font-size: 10px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
      .card .value { font-size: 18px; font-weight: 600; }
      .commit { border-left: 3px solid var(--vscode-textBlockQuote-border); padding: 8px 12px; margin: 8px 0; background: var(--vscode-editorWidget-background); border-radius: 0 4px 4px 0; }
      .commit.crit { border-left-color: #f14c4c; }
      .commit.med  { border-left-color: #ffaa00; }
      .commit.low  { border-left-color: #4ec9b0; }
      .commit-title { font-weight: 600; font-size: 13px; }
      .commit-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
      .traces { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 6px; border-radius: 8px; font-size: 10px; margin-left: 6px; }
      .files { font-family: var(--vscode-editor-font-family); font-size: 11px; margin-top: 4px; opacity: 0.85; }
    `;
    const actions = `<div class="actions"><button onclick="send('analyze')">Analyze</button><button onclick="send('dryRun')">Dry Run</button><button onclick="send('execute')">Execute</button></div>`;
    const script = `<script>const vscode=acquireVsCodeApi();function send(cmd){vscode.postMessage({command:cmd});}</script>`;

    if (!plan) {
      return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${actions}<div class="empty">No plan yet.<br/>Click <b>Analyze</b> to inspect your working tree.</div>${script}</body></html>`;
    }

    const r = plan.summary.riskDistribution;
    const summaryHtml = `<div class="summary">
      <div class="card"><div class="label">Hunks</div><div class="value">${plan.summary.totalHunks}</div></div>
      <div class="card"><div class="label">Commits</div><div class="value">${plan.summary.totalCommits}</div></div>
      <div class="card"><div class="label">Risk</div><div class="value">${r.critical}c / ${r.medium}m / ${r.low}l</div></div>
      <div class="card"><div class="label">Coverage</div><div class="value">${plan.summary.requirementsCovered}/${plan.summary.requirementsTotal || 0}</div></div>
    </div>`;

    const commits = plan.commits.slice().sort((a, b) => a.order - b.order).map(c => {
      const cls = c.risk === 'critical' ? 'crit' : c.risk === 'medium' ? 'med' : 'low';
      const traces = c.tracesTo.map(t => `<span class="traces">${esc(t)}</span>`).join('');
      const files = Array.from(new Set(c.hunks.map(h => h.filePath)));
      return `<div class="commit ${cls}"><div class="commit-title">#${c.order + 1} · ${esc(c.title)}${traces}</div><div class="commit-meta">${esc(c.intent)} · ${esc(c.risk)} · ${c.hunks.length} hunk${c.hunks.length === 1 ? '' : 's'}</div><div class="files">${files.map(esc).join(', ')}</div></div>`;
    }).join('');

    return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${actions}<h2>Summary</h2>${summaryHtml}<h2>Planned commits</h2>${commits}${script}</body></html>`;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
