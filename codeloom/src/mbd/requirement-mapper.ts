import { AnnotatedHunk, MBDManifest, Requirement, TraceabilityMatrix } from '../types';

const SECONDARY_GAP = 3;

export class RequirementMapper {
  map(hunks: AnnotatedHunk[], manifest: MBDManifest): TraceabilityMatrix {
    const requirementToHunks = new Map<string, string[]>();
    const hunkToRequirements = new Map<string, string[]>();

    for (const req of manifest.requirements) {
      requirementToHunks.set(req.id, []);
    }

    for (const hunk of hunks) {
      const scores = manifest.requirements.map(req => ({
        req,
        score: this.scoreMatch(hunk, req),
      })).filter(s => s.score >= 5).sort((a, b) => b.score - a.score);

      const matches = scores.length > 0
        ? scores.filter((s, i) => i === 0 || (scores[0].score - s.score) <= SECONDARY_GAP).slice(0, 2)
        : [];

      const reqIds = matches.map(m => m.req.id);
      hunk.tracesTo = reqIds;
      hunkToRequirements.set(hunk.id, reqIds);

      for (const reqId of reqIds) {
        requirementToHunks.get(reqId)!.push(hunk.id);
      }
    }

    const uncoveredRequirements = manifest.requirements
      .filter(req => (requirementToHunks.get(req.id) || []).length === 0)
      .map(req => req.id);

    const untraceableHunks = hunks
      .filter(h => (hunkToRequirements.get(h.id) || []).length === 0)
      .map(h => h.id);

    return { requirementToHunks, hunkToRequirements, uncoveredRequirements, untraceableHunks };
  }

  private scoreMatch(hunk: AnnotatedHunk, req: Requirement): number {
    let score = 0;
    const content = [...hunk.addedLines, ...hunk.removedLines].join('\n').toLowerCase();

    // Keyword matching
    for (const keyword of req.keywords) {
      if (content.includes(keyword.toLowerCase())) score += 2;
    }

    // File path glob matching
    if (req.expectedFiles) {
      for (const pattern of req.expectedFiles) {
        if (this.matchGlob(hunk.filePath, pattern)) { score += 5; break; }
      }
    }

    // Category / intent matching
    if (req.category) {
      if (hunk.intent === req.category) score += 3;
      else if (hunk.intent.includes(req.category) || req.category.includes(hunk.intent)) score += 1;
    }

    // State machine reference
    if (req.stateMachine) {
      if (content.includes(req.stateMachine.name.toLowerCase())) score += 2;
      if (req.stateMachine.transition) {
        const states = req.stateMachine.transition.split('->').map(s => s.trim().toLowerCase());
        for (const state of states) {
          if (content.includes(state)) score += 1;
        }
      }
    }

    return score;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE_STAR___/g, '.*');
    try {
      return new RegExp(`^${regexStr}$`).test(normalized) ||
             new RegExp(`^${regexStr}`).test(normalized);
    } catch {
      return false;
    }
  }
}
