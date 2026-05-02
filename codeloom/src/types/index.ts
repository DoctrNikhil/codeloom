export type IntentCategory =
  | 'feature'
  | 'refactor'
  | 'bugfix'
  | 'security'
  | 'test'
  | 'docs'
  | 'config'
  | 'style'
  | 'unknown';

export type RiskLevel = 'critical' | 'medium' | 'low';

export type ChangeType = 'added' | 'modified' | 'removed';

export interface Hunk {
  id: string;
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  rawContent: string;
  addedLines: string[];
  removedLines: string[];
  contextLines: string[];
  changeType: ChangeType;
}

export interface AnnotatedHunk extends Hunk {
  definedSymbols: Symbol[];
  referencedSymbols: Symbol[];
  addedImports: string[];
  intent: IntentCategory;
  risk: RiskLevel;
  confidence: number;
  dependsOn: string[];
  tracesTo: string[];
  description: string;
}

export interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'import' | 'export';
  line: number;
}

export interface PlannedCommit {
  id: string;
  order: number;
  title: string;
  description: string;
  intent: IntentCategory;
  risk: RiskLevel;
  hunks: AnnotatedHunk[];
  tracesTo: string[];
  dependsOn: string[];
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
  keywords: string[];
  stateMachine?: {
    name: string;
    transition?: string;
  };
  expectedFiles?: string[];
}

export interface MBDManifest {
  version: string;
  project: string;
  description?: string;
  requirements: Requirement[];
  stateMachines?: StateMachine[];
}

export interface StateMachine {
  name: string;
  states: string[];
  transitions: Array<{
    from: string;
    to: string;
    trigger?: string;
    requirementId?: string;
  }>;
}

export interface AnalysisResult {
  hunks: AnnotatedHunk[];
  commits: PlannedCommit[];
  manifest?: MBDManifest;
  traceability: TraceabilityMatrix;
  summary: {
    totalHunks: number;
    totalCommits: number;
    riskDistribution: Record<RiskLevel, number>;
    intentDistribution: Record<IntentCategory, number>;
    requirementsCovered: number;
    requirementsTotal: number;
    gaps: string[];
  };
}

export interface TraceabilityMatrix {
  requirementToHunks: Map<string, string[]>;
  hunkToRequirements: Map<string, string[]>;
  uncoveredRequirements: string[];
  untraceableHunks: string[];
}
