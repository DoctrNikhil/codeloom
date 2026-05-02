import { AnnotatedHunk } from '../types';

export class DependencyDetector {
  detect(hunks: AnnotatedHunk[]): AnnotatedHunk[] {
    const definitionMap = new Map<string, string[]>();

    for (const hunk of hunks) {
      for (const sym of hunk.definedSymbols) {
        if (!definitionMap.has(sym.name)) definitionMap.set(sym.name, []);
        definitionMap.get(sym.name)!.push(hunk.id);
      }
    }

    for (const hunk of hunks) {
      const deps = new Set<string>();
      for (const ref of hunk.referencedSymbols) {
        const definers = definitionMap.get(ref.name);
        if (definers) {
          for (const definerId of definers) {
            if (definerId !== hunk.id) deps.add(definerId);
          }
        }
      }
      hunk.dependsOn = Array.from(deps);
    }

    this.breakCycles(hunks);
    return hunks;
  }

  topologicalSort(hunks: AnnotatedHunk[]): AnnotatedHunk[] {
    const result: AnnotatedHunk[] = [];
    const hunkMap = new Map(hunks.map(h => [h.id, h]));
    const remainingDeps = new Map<string, Set<string>>();

    for (const hunk of hunks) {
      remainingDeps.set(hunk.id, new Set(hunk.dependsOn));
    }

    while (result.length < hunks.length) {
      let next: AnnotatedHunk | undefined;
      for (const [id, deps] of remainingDeps) {
        if (deps.size === 0) {
          next = hunkMap.get(id);
          if (next) break;
        }
      }

      if (!next) {
        for (const id of remainingDeps.keys()) {
          const hunk = hunkMap.get(id);
          if (hunk && !result.includes(hunk)) result.push(hunk);
        }
        break;
      }

      result.push(next);
      remainingDeps.delete(next.id);
      for (const deps of remainingDeps.values()) deps.delete(next.id);
    }

    return result;
  }

  private breakCycles(hunks: AnnotatedHunk[]): void {
    const hunkMap = new Map(hunks.map(h => [h.id, h]));
    for (const hunk of hunks) {
      for (const depId of [...hunk.dependsOn]) {
        const dep = hunkMap.get(depId);
        if (dep && dep.dependsOn.includes(hunk.id)) {
          const hunkNum = parseInt(hunk.id.replace('hunk_', ''), 10);
          const depNum = parseInt(dep.id.replace('hunk_', ''), 10);
          if (hunkNum > depNum) {
            hunk.dependsOn = hunk.dependsOn.filter(d => d !== depId);
          } else {
            dep.dependsOn = dep.dependsOn.filter(d => d !== hunk.id);
          }
        }
      }
    }
  }
}
