# PROJECT-CONTEXT.md — CodeLoom

> Drop this file into any AI assistant session (Claude, ChatGPT, Cursor, Gemini, Copilot Chat, …) to get the assistant up to speed in seconds. It's a self-contained briefing — paths, types, behaviour, invariants, and gotchas.

---

## What CodeLoom is

A **deterministic, end-to-end commit pipeline for AI-generated diffs and staged changes**. Take the messy unified diff that an AI coding tool (Cursor, Copilot, Claude Code) produces — or the pile of files you just `git add`'d — and CodeLoom turns it into an ordered sequence of small, atomic, semantically meaningful **real git commits**, with optional traceability to formal requirements (MBD / safety-critical / regulated industries).

**One-liner:** `git add . && codeloom execute --staged --branch codeloom/feature` → clean stack of real commits with `Traces-To` trailers. No LLM, fully deterministic.

---

## Three input modes (V0.2)

CodeLoom accepts diff input from three sources — pick the one that fits the workflow:

| Mode | Command | Use when |
|---|---|---|
| **File** | `codeloom analyze patch.diff` | You have a `.diff`/`.patch` from somewhere (PR, AI output, email) |
| **Stdin** | `git diff HEAD~5 \| codeloom analyze --stdin` | Piping from `git diff` or another tool |
| **Staged** | `codeloom analyze --staged` | Most ergonomic — you've `git add`'d files and want to commit them as atomic commits |

The pipeline (parser → analyzer → planner → executor) is identical regardless of input source.

---

## Tech stack

- **Language**: TypeScript (Node.js 18+)
- **CLI**: commander
- **YAML**: js-yaml
- **Git**: simple-git (used by GitExecutor)
- **Tests**: jest + ts-jest (38 tests, including real-git-repo integration tests for both file-mode and staged-mode flows)
- **Build**: tsc → `dist/`
- **VS Code extension**: at `../vscode-extension/` (sibling to `codeloom/`)

---

## File map

```
codeloom/
├── src/
│   ├── types/index.ts                  Hunk, AnnotatedHunk, PlannedCommit, MBDManifest, ...
│   ├── parser/diff-parser.ts           Unified diff → Hunk[]
│   ├── analyzer/
│   │   ├── analyzer.ts                 Pipeline orchestrator (Analyzer.analyze)
│   │   ├── symbol-analyzer.ts          Regex-based symbol extraction (TS/JS, V1)
│   │   ├── intent-classifier.ts        Intent + risk + confidence (heuristics)
│   │   └── dependency-detector.ts      Symbol DAG + Kahn's topo sort + cycle-breaking
│   ├── mbd/
│   │   ├── manifest-parser.ts          YAML → MBDManifest
│   │   └── requirement-mapper.ts       Hunks → requirements (keyword + glob + category scoring)
│   ├── planner/commit-planner.ts       Cluster hunks → PlannedCommit[]; aggregate risk/intent; topo-order
│   ├── executor/git-executor.ts        Stage + commit + branch + rollback (simple-git, V0.2)
│   └── cli/
│       ├── index.ts                    `analyze`, `execute`, `trace` commands
│       └── formatter.ts                Human + JSON output
├── examples/
│   ├── sample.diff                     Realistic auth-service example (7 hunks)
│   └── manifest.yaml                   5 requirements + AuthFlow state machine
├── tests/
│   ├── diff-parser.test.ts             7 cases
│   ├── symbol-analyzer.test.ts         8 cases
│   ├── dependency-detector.test.ts     4 cases
│   ├── commit-planner.test.ts          6 cases
│   └── integration/
│       ├── executor.integration.test.ts        7 cases — real git repo, file-mode
│       └── staged-mode.integration.test.ts     6 cases — real git repo, --staged flow
├── package.json                         v0.2.0 — bin: { "codeloom": "dist/cli/index.js" }
├── tsconfig.json
└── README.md

../vscode-extension/                    Sibling package (see its own README)
```

---

## CLI surface

```bash
codeloom --version                                   # 0.2.0

# analyze
codeloom analyze <diffFile>                          # from file
codeloom analyze --stdin                             # from stdin
codeloom analyze --staged                            # from `git diff --cached` (V0.2)
codeloom analyze --staged -C /path/to/repo           # different repo
codeloom analyze --staged --manifest design/manifest.yaml   # with MBD traceability
codeloom analyze --staged --json                     # JSON output

# execute (real git commits)
codeloom execute --staged --dry-run                  # preview, no git ops
codeloom execute --staged --branch codeloom/feat     # create + switch branch first
codeloom execute --staged --manifest m.yaml          # with traceability trailers
codeloom execute path.diff --allow-dirty             # ignore unrelated dirty files

# trace
codeloom trace --staged --manifest design/manifest.yaml
codeloom trace --diff p.diff --manifest design/manifest.yaml
```

**Exit codes:** 0 = success / dry-run shown; 1 = bad args / file not found; 2 = analysis or execution error; 3 = critical risks detected on `analyze` (override with `--no-fail`).

---

## Pipeline flow

```
[diff source: file / stdin / --staged]
        │
        ▼
   DiffParser              Splits on "diff --git", parses @@ headers → Hunk[]
        │
        ▼
   SymbolAnalyzer          Regex: functions, classes, interfaces, types, imports
        │
        ▼
   IntentClassifier        Heuristics → intent + risk + confidence
        │
        ▼
   RequirementMapper       (only if MBD manifest provided) keyword+glob+category → tracesTo[]
        │
        ▼
   DependencyDetector      Symbol references build edges; Kahn's algo orders them
        │
        ▼
   CommitPlanner           Clusters hunks; aggregates risk (max), intent (priority order)
        │
        ▼
   GitExecutor (V0.2)      For --staged: `git reset HEAD` first to unstage,
        │                  then per planned commit: `git add <files>`, `git commit -m <msg+trailers>`
        ▼
   Real commits (or `--dry-run` preview)
```

---

## Key types (cheat-sheet)

```typescript
interface AnnotatedHunk {
  id: string;                       // "hunk_3"
  filePath: string;
  changeType: 'added' | 'modified' | 'removed';
  addedLines: string[]; removedLines: string[];
  definedSymbols: Symbol[];         // What this hunk DEFINES
  referencedSymbols: Symbol[];      // What this hunk USES (drives DAG)
  intent: 'feature'|'bugfix'|'refactor'|'security'|'test'|'docs'|'config'|'style'|'unknown';
  risk: 'critical' | 'medium' | 'low';
  confidence: number;               // 0–0.95
  dependsOn: string[];              // hunk IDs this depends on
  tracesTo: string[];               // requirement IDs (e.g. "REQ-001")
}

interface PlannedCommit {
  id: string;                       // "commit_3"
  order: number;                    // topologically safe commit order
  title: string;                    // "<prefix>: <desc> [REQ-IDs]"
  description: string;              // body with file list + Traces-To
  intent: IntentCategory;
  risk: RiskLevel;
  hunks: AnnotatedHunk[];
  tracesTo: string[];
  dependsOn: string[];              // commit IDs
}

interface ExecuteOptions {
  cwd?: string; dryRun?: boolean; branch?: string;
  allowDirty?: boolean; noRollback?: boolean; verbose?: boolean;
  unstageFirst?: boolean;           // V0.2 — set by --staged
}
```

---

## Executor invariants (V0.2)

- Refuses to run when not in a git repo.
- Refuses to run on a dirty tree if files outside the plan are modified, unless `--allow-dirty` (auto-implied by `--staged`).
- Refuses to run if the working tree has merge conflicts.
- Each commit message gets four trailers: `Traces-To` (when manifest used), `CodeLoom-Plan-Id`, `CodeLoom-Risk`, `CodeLoom-Intent`.
- On any failure mid-sequence: hard reset to the pre-execution HEAD (rollback). Reset is scoped to commits this run created — never resets past startSha.
- Never pushes. Never force-resets past startSha. Never amends.
- `--dry-run` performs zero git operations.
- `--staged` mode: runs `git reset HEAD` first to unstage, then stages & commits per planned commit. Working tree contents are unchanged by the unstage step (mixed-mode reset).

---

## Test coverage

| Suite | Tests | Coverage |
|---|---|---|
| `diff-parser.test.ts`                     | 7 | added/modified/removed, multi-file, multi-hunk, empty input |
| `symbol-analyzer.test.ts`                 | 8 | functions, classes, interfaces, types, imports, refs, keywords, dedup |
| `dependency-detector.test.ts`             | 4 | edges, topo sort, cycle-break, disconnected hunks |
| `commit-planner.test.ts`                  | 6 | requirement clustering, file-intent clustering, risk max, ordering, prefixes, traces |
| `executor.integration.test.ts`            | 7 | real temp git repos — not-a-repo, dry-run, real commits, Traces-To, branch creation, rollback, dirty-tree |
| `staged-mode.integration.test.ts`         | 6 | real temp git repos — staged-diff plan, real commits from staged, trailers, branch+staged, MBD+staged, empty-staged |

**Total: 38 passing tests, ~20s.**

```bash
cd codeloom
npm test                  # all 38
npm run test:unit         # only the 25 unit tests
npm run test:integration  # only the 13 real-git-repo tests
```

---

## Setup (from clean clone)

```bash
cd codeloom
npm install
npm run build       # tsc → dist/
npm link            # makes `codeloom` available globally
codeloom --version  # → 0.2.0
npm test            # → 38 passing
```

For the VS Code extension:
```bash
cd ../vscode-extension
npm install
npm run compile
# Then F5 in VS Code → "Extension Development Host"
```

---

## What V0.2 does NOT do

- Does not call any LLM (heuristics only).
- Tree-sitter for non-TS/JS languages still pending (V0.3).
- Does not push to remotes or open PRs.
- Does not yet ship to the VS Code marketplace (V0.4).
- DiffParser handles add/modify/delete but not renames or binary files.
- Symbol analysis is regex-based — misses some advanced TS patterns (decorators, conditional types).

---

## Roadmap

| Version | Feature | Status |
|---|---|---|
| V0.1 | Analysis pipeline + CLI plan | Done |
| **V0.2** | Executor + tests + global CLI + VS Code extension scaffold + **--staged mode** | **Current** |
| V0.3 | Tree-sitter for Python/Go/Rust/Java/C/C++ | Planned |
| V0.4 | VS Code marketplace publish | Planned |
| V0.5 | Optional LLM polish layer (BYO key) | Planned |

---

## Competitive context

| Tool | What it does | CodeLoom's edge |
|---|---|---|
| Conventional Commits | Naming convention | CodeLoom infers + enforces them automatically |
| commitizen | Interactive prompt | CodeLoom does it from a diff or `git add`'d files, no prompts |
| semantic-release | Auto-versioning | Downstream consumer; needs clean commits first |
| `git add -p` | Manual hunk staging | CodeLoom auto-clusters, orders, and commits |
| **(no other tool)** | **MBD traceability from diffs** | **Unique to CodeLoom** |

---

## Common AI tool prompts (paste-ready)

When handing off to another AI, you can prefix with:

> "I'm working on **CodeLoom** — a deterministic commit planner that turns AI-generated diffs (or `git add`'d staged changes) into atomic, traceable git commits. I'm at version 0.2.0. The pipeline is fully implemented: parser → analyzer → planner → GitExecutor. There are 38 tests passing. Read PROJECT-CONTEXT.md for the full briefing. Now I want to: ___"

Or for a focused task:

> "CodeLoom v0.2 — adding [feature]. Relevant files: `src/[area]/[file].ts`. Tests live in `tests/`. The pipeline is documented in PROJECT-CONTEXT.md. Don't change the deterministic invariants (no LLM calls in the core pipeline). Add a test in `tests/[file].test.ts` for the new behaviour."

---

## Troubleshooting

- **`codeloom: command not found`** → `cd codeloom && npm run build && npm link`
- **Tests fail on Windows due to CRLF** → safe to ignore the LF→CRLF warnings; tests still pass.
- **`--staged` says "no staged changes"** → run `git add <files>` first.
- **`--staged` execute fails on initial-commit repo** → unstageFirst silently no-ops if HEAD doesn't exist; the per-commit staging will still run, but you need at least one prior commit (use `git commit --allow-empty -m seed`).

---

## License

MIT
