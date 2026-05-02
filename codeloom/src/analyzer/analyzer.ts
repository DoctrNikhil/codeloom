import {
  AnalysisResult, AnnotatedHunk, IntentCategory, MBDManifest, RiskLevel, TraceabilityMatrix,
} from '../types';
import { DiffParser } from '../parser/diff-parser';
import { SymbolAnalyzer } from './symbol-analyzer';
import { IntentClassifier } from './intent-classifier';
import { DependencyDetector } from './dependency-detector';
import { CommitPlanner } from '../planner/commit-planner';
import { RequirementMapper } from '../mbd/requirement-mapper';

export interface AnalyzeOptions {
  manifest?: MBDManifest;
}

export class Analyzer {
  private diffParser = new DiffParser();
  private symbolAnalyzer = new SymbolAnalyzer();
  private intentClassifier = new IntentClassifier();
  private dependencyDetector = new DependencyDetector();
  private commitPlanner = new CommitPlanner();
  private requirementMapper = new RequirementMapper();

  analyze(diffText: string, options: AnalyzeOptions = {}): AnalysisResult {
    const rawHunks = this.diffParser.parse(diffText);

    const annotated: AnnotatedHunk[] = rawHunks.map(hunk => {
      const symbolResult = this.symbolAnalyzer.analyze(hunk);
      const ctx = {
        hunk,
        definedSymbols: symbolResult.defined,
        referencedSymbols: symbolResult.referenced,
        addedImports: symbolResult.addedImports,
      };
      const { intent, confidence } = this.intentClassifier.classifyIntent(ctx);
      const risk = this.intentClassifier.classifyRisk(ctx);
      const description = this.intentClassifier.generateDescription(ctx, intent);

      return {
        ...hunk,
        definedSymbols: symbolResult.defined,
        referencedSymbols: symbolResult.referenced,
        addedImports: symbolResult.addedImports,
        intent, risk, confidence,
        dependsOn: [],
        tracesTo: [],
        description,
      };
    });

    this.dependencyDetector.detect(annotated);

    let traceability: TraceabilityMatrix = {
      requirementToHunks: new Map(),
      hunkToRequirements: new Map(),
      uncoveredRequirements: [],
      untraceableHunks: [],
    };
    if (options.manifest) {
      traceability = this.requirementMapper.map(annotated, options.manifest);
    }

    const sortedHunks = this.dependencyDetector.topologicalSort(annotated);
    const commits = this.commitPlanner.plan(sortedHunks);
    const summary = this.computeSummary(annotated, commits, options.manifest, traceability);

    return { hunks: annotated, commits, manifest: options.manifest, traceability, summary };
  }

  private computeSummary(
    hunks: AnnotatedHunk[],
    commits: any[],
    manifest: MBDManifest | undefined,
    traceability: TraceabilityMatrix
  ) {
    const riskDistribution: Record<RiskLevel, number> = { critical: 0, medium: 0, low: 0 };
    const intentDistribution: Record<IntentCategory, number> = {
      feature: 0, refactor: 0, bugfix: 0, security: 0, test: 0, docs: 0, config: 0, style: 0, unknown: 0,
    };

    for (const h of hunks) {
      riskDistribution[h.risk]++;
      intentDistribution[h.intent]++;
    }

    const requirementsTotal = manifest?.requirements.length ?? 0;
    const requirementsCovered = requirementsTotal - traceability.uncoveredRequirements.length;

    return {
      totalHunks: hunks.length,
      totalCommits: commits.length,
      riskDistribution,
      intentDistribution,
      requirementsCovered,
      requirementsTotal,
      gaps: traceability.uncoveredRequirements,
    };
  }
}
