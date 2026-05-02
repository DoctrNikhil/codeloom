import { AnnotatedHunk, PlannedCommit, IntentCategory, RiskLevel } from '../types';

export class CommitPlanner {
  private commitCounter = 0;

  plan(sortedHunks: AnnotatedHunk[]): PlannedCommit[] {
    const clusters = this.clusterHunks(sortedHunks);
    const commits = clusters.map(cluster => this.buildCommit(cluster));
    this.computeCommitDependencies(commits);
    return this.orderCommits(commits);
  }

  private clusterHunks(hunks: AnnotatedHunk[]): AnnotatedHunk[][] {
    const clusters: AnnotatedHunk[][] = [];
    const assigned = new Set<string>();

    for (const hunk of hunks) {
      if (assigned.has(hunk.id)) continue;
      const cluster: AnnotatedHunk[] = [hunk];
      assigned.add(hunk.id);

      for (const other of hunks) {
        if (assigned.has(other.id)) continue;
        if (this.shouldCluster(hunk, other, hunks)) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  private shouldCluster(a: AnnotatedHunk, b: AnnotatedHunk, _allHunks: AnnotatedHunk[]): boolean {
    // Rule 1: Shared primary requirement
    if (a.tracesTo.length > 0 && b.tracesTo.length > 0 && a.tracesTo[0] === b.tracesTo[0]) return true;
    // Rule 2: Same file + same intent
    if (a.filePath === b.filePath && a.intent === b.intent) return true;
    // Rule 3: Direct dependency + same intent + related files
    if (a.intent === b.intent) {
      if (a.dependsOn.includes(b.id) || b.dependsOn.includes(a.id)) {
        if (this.areRelatedFiles(a.filePath, b.filePath)) return true;
      }
    }
    return false;
  }

  private areRelatedFiles(a: string, b: string): boolean {
    const aParts = a.split('/');
    const bParts = b.split('/');
    if (aParts.slice(0, -1).join('/') === bParts.slice(0, -1).join('/')) return true;
    if (aParts.length >= 2 && bParts.length >= 2) {
      if (aParts.slice(0, -2).join('/') === bParts.slice(0, -2).join('/')) {
        return aParts[aParts.length - 2] === bParts[bParts.length - 2];
      }
    }
    return false;
  }

  private buildCommit(hunks: AnnotatedHunk[]): PlannedCommit {
    const id = `commit_${++this.commitCounter}`;
    const intent = this.aggregateIntent(hunks);
    const risk = this.aggregateRisk(hunks);
    const tracesTo = this.aggregateTraces(hunks);
    const title = this.generateTitle(hunks, intent, tracesTo);
    const description = this.generateDescription(hunks, tracesTo);
    return { id, order: 0, title, description, intent, risk, hunks, tracesTo, dependsOn: [] };
  }

  private aggregateIntent(hunks: AnnotatedHunk[]): IntentCategory {
    const priority: IntentCategory[] = ['security', 'bugfix', 'feature', 'refactor', 'test', 'config', 'docs', 'style', 'unknown'];
    const intents = new Set(hunks.map(h => h.intent));
    for (const p of priority) { if (intents.has(p)) return p; }
    return 'unknown';
  }

  private aggregateRisk(hunks: AnnotatedHunk[]): RiskLevel {
    if (hunks.some(h => h.risk === 'critical')) return 'critical';
    if (hunks.some(h => h.risk === 'medium')) return 'medium';
    return 'low';
  }

  private aggregateTraces(hunks: AnnotatedHunk[]): string[] {
    const all = new Set<string>();
    for (const h of hunks) { for (const t of h.tracesTo) all.add(t); }
    return Array.from(all);
  }

  private generateTitle(hunks: AnnotatedHunk[], intent: IntentCategory, traces: string[]): string {
    const prefix = this.intentToPrefix(intent);
    const primary = hunks.find(h => h.tracesTo.length > 0) || hunks[0];
    let title = `${prefix}: ${primary.description}`;
    if (hunks.length > 1) title += ` (+${hunks.length - 1} related)`;
    if (traces.length > 0) title += ` [${traces.join(', ')}]`;
    return title;
  }

  private intentToPrefix(intent: IntentCategory): string {
    const map: Record<IntentCategory, string> = {
      feature: 'feat', refactor: 'refactor', bugfix: 'fix', security: 'security',
      test: 'test', docs: 'docs', config: 'chore', style: 'style', unknown: 'chore',
    };
    return map[intent];
  }

  private generateDescription(hunks: AnnotatedHunk[], traces: string[]): string {
    const lines: string[] = [];
    const files = new Set(hunks.map(h => h.filePath));
    lines.push(`Files changed (${files.size}):`);
    for (const f of files) lines.push(`  - ${f}`);
    if (traces.length > 0) { lines.push(''); lines.push(`Traces-To: ${traces.join(', ')}`); }
    return lines.join('\n');
  }

  private computeCommitDependencies(commits: PlannedCommit[]): void {
    const hunkToCommit = new Map<string, string>();
    for (const c of commits) { for (const h of c.hunks) hunkToCommit.set(h.id, c.id); }
    for (const c of commits) {
      const deps = new Set<string>();
      for (const h of c.hunks) {
        for (const depHunkId of h.dependsOn) {
          const depCommitId = hunkToCommit.get(depHunkId);
          if (depCommitId && depCommitId !== c.id) deps.add(depCommitId);
        }
      }
      c.dependsOn = Array.from(deps);
    }
  }

  private orderCommits(commits: PlannedCommit[]): PlannedCommit[] {
    const result: PlannedCommit[] = [];
    const commitMap = new Map(commits.map(c => [c.id, c]));
    const remainingDeps = new Map<string, Set<string>>();
    for (const c of commits) remainingDeps.set(c.id, new Set(c.dependsOn));

    let order = 0;
    while (result.length < commits.length) {
      let next: PlannedCommit | undefined;
      for (const [id, deps] of remainingDeps) {
        if (deps.size === 0) { next = commitMap.get(id); if (next) break; }
      }
      if (!next) {
        for (const id of remainingDeps.keys()) {
          const c = commitMap.get(id);
          if (c && !result.includes(c)) { c.order = order++; result.push(c); }
        }
        break;
      }
      next.order = order++;
      result.push(next);
      remainingDeps.delete(next.id);
      for (const deps of remainingDeps.values()) deps.delete(next.id);
    }
    return result;
  }
}
