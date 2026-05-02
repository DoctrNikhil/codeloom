import { DependencyDetector } from '../src/analyzer/dependency-detector';
import { AnnotatedHunk } from '../src/types';

function mkHunk(id: string, defined: string[], referenced: string[]): AnnotatedHunk {
  return {
    id, filePath: `${id}.ts`, oldStart: 0, oldLines: 0, newStart: 1, newLines: 1,
    header: '', rawContent: '', addedLines: [], removedLines: [], contextLines: [],
    changeType: 'added',
    definedSymbols: defined.map(n => ({ name: n, kind: 'function' as const, line: 1 })),
    referencedSymbols: referenced.map(n => ({ name: n, kind: 'function' as const, line: 1 })),
    addedImports: [], intent: 'feature', risk: 'low', confidence: 0.5,
    dependsOn: [], tracesTo: [], description: '',
  };
}

describe('DependencyDetector', () => {
  const dd = new DependencyDetector();

  it('builds a dependency edge from referencer to definer', () => {
    const h1 = mkHunk('hunk_1', ['hashPassword'], []);
    const h2 = mkHunk('hunk_2', ['login'], ['hashPassword']);
    dd.detect([h1, h2]);
    expect(h2.dependsOn).toContain('hunk_1');
    expect(h1.dependsOn).toEqual([]);
  });

  it('topologically sorts so dependencies come first', () => {
    const h1 = mkHunk('hunk_1', ['hashPassword'], []);
    const h2 = mkHunk('hunk_2', ['login'], ['hashPassword']);
    const h3 = mkHunk('hunk_3', ['router'], ['login']);
    dd.detect([h3, h2, h1]);
    const sorted = dd.topologicalSort([h3, h2, h1]);
    const idx = (id: string) => sorted.findIndex(h => h.id === id);
    expect(idx('hunk_1')).toBeLessThan(idx('hunk_2'));
    expect(idx('hunk_2')).toBeLessThan(idx('hunk_3'));
  });

  it('breaks mutual cycles so topological sort terminates', () => {
    const h1 = mkHunk('hunk_1', ['a'], ['b']);
    const h2 = mkHunk('hunk_2', ['b'], ['a']);
    dd.detect([h1, h2]);
    const cycleStillExists = h1.dependsOn.includes('hunk_2') && h2.dependsOn.includes('hunk_1');
    expect(cycleStillExists).toBe(false);
    const sorted = dd.topologicalSort([h1, h2]);
    expect(sorted).toHaveLength(2);
  });

  it('handles disconnected hunks', () => {
    const h1 = mkHunk('hunk_1', ['a'], []);
    const h2 = mkHunk('hunk_2', ['b'], []);
    dd.detect([h1, h2]);
    expect(h1.dependsOn).toEqual([]);
    expect(h2.dependsOn).toEqual([]);
  });
});
