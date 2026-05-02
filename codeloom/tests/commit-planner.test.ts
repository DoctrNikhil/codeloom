import { CommitPlanner } from '../src/planner/commit-planner';
import { AnnotatedHunk } from '../src/types';

function mkHunk(opts: Partial<AnnotatedHunk> & { id: string; filePath: string }): AnnotatedHunk {
  return {
    id: opts.id, filePath: opts.filePath, oldStart: 0, oldLines: 0, newStart: 1, newLines: 1,
    header: '', rawContent: '', addedLines: [], removedLines: [], contextLines: [],
    changeType: 'added', definedSymbols: [], referencedSymbols: [], addedImports: [],
    intent: opts.intent ?? 'feature', risk: opts.risk ?? 'low', confidence: 0.5,
    dependsOn: opts.dependsOn ?? [], tracesTo: opts.tracesTo ?? [],
    description: opts.description ?? `${opts.id} description`,
  };
}

describe('CommitPlanner', () => {
  it('clusters hunks tracing to the same requirement', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'src/a.ts', tracesTo: ['REQ-001'] });
    const h2 = mkHunk({ id: 'hunk_2', filePath: 'src/b.ts', tracesTo: ['REQ-001'] });
    const h3 = mkHunk({ id: 'hunk_3', filePath: 'src/c.ts', tracesTo: ['REQ-002'] });
    const commits = new CommitPlanner().plan([h1, h2, h3]);
    expect(commits).toHaveLength(2);
    expect(commits.find(c => c.tracesTo.includes('REQ-001'))!.hunks.length).toBe(2);
  });

  it('clusters hunks in the same file with the same intent', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'src/a.ts', intent: 'feature' });
    const h2 = mkHunk({ id: 'hunk_2', filePath: 'src/a.ts', intent: 'feature' });
    const commits = new CommitPlanner().plan([h1, h2]);
    expect(commits).toHaveLength(1);
    expect(commits[0].hunks).toHaveLength(2);
  });

  it('escalates risk to max of contained hunks', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'src/a.ts', risk: 'low' });
    const h2 = mkHunk({ id: 'hunk_2', filePath: 'src/a.ts', risk: 'critical' });
    expect(new CommitPlanner().plan([h1, h2])[0].risk).toBe('critical');
  });

  it('orders commits so dependencies come first', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'lib/a.ts', intent: 'feature' });
    const h2 = mkHunk({ id: 'hunk_2', filePath: 'app/views/b.tsx', intent: 'refactor', dependsOn: ['hunk_1'] });
    const commits = new CommitPlanner().plan([h1, h2]);
    expect(commits.length).toBe(2);
    const c1 = commits.find(c => c.hunks.some(h => h.id === 'hunk_1'))!;
    const c2 = commits.find(c => c.hunks.some(h => h.id === 'hunk_2'))!;
    expect(c1.order).toBeLessThan(c2.order);
  });

  it('uses conventional-commits style title prefixes', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'src/auth.ts', intent: 'security', description: 'add bcrypt hashing' });
    expect(new CommitPlanner().plan([h1])[0].title.startsWith('security:')).toBe(true);
  });

  it('emits Traces-To in the commit description when traces exist', () => {
    const h1 = mkHunk({ id: 'hunk_1', filePath: 'src/a.ts', tracesTo: ['REQ-001'] });
    expect(new CommitPlanner().plan([h1])[0].description).toContain('REQ-001');
  });
});
