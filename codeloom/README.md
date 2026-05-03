# CodeLoom

> Architectural linker for AI-generated code. Turns chaotic diffs into atomic, traceable, MBD-aligned commits.

CodeLoom takes a unified diff (typically from AI code generation in Cursor / Copilot / Claude) and produces an ordered sequence of small, semantic, dependency-safe commits. With a Model-Based Development manifest, every commit is also traced back to the requirements it implements.

## What's in the box (V0.2)

- **Diff parser** — fully deterministic, parses unified diff into structured hunks
- **Symbol analyzer** — regex-based detection of functions, classes, imports, types (TypeScript/JavaScript)
- **Intent classifier** — heuristic intent (`feature` / `refactor` / `bugfix` / `security` / `test` / `docs` / `config` / `style`)
- **Risk scorer** — `critical` / `medium` / `low` with file-type caps so tests don't get false-flagged
- **Dependency detector** — builds a DAG between hunks based on symbol references
- **Topological sorter** — guarantees commit order is dependency-safe
- **MBD manifest parser** — YAML format with requirements + state machines
- **Requirement mapper** — links each hunk to the requirements it implements
- **Commit planner** — clusters hunks into atomic commits with traceability tags
- **Git executor** — stages + commits via simple-git, with `Traces-To` trailers, branch switching, dry-run, rollback
- **Staged-mode** — `--staged` flag reads `git diff --cached` and turns your `git add`'d changes into atomic commits
- **CLI** — `codeloom analyze`, `codeloom execute`, and `codeloom trace` commands (globally linked)
- **Unit + integration tests** — 38 tests including real-git-repo executor and staged-mode verification
- **VS Code extension** — sidebar webview with commit plan visualization (commands: Analyze, Dry Run, Execute)

## VS Code Extension

**CodeLoom is available as a VS Code extension!**

Install from VS Code Marketplace: [CodeLoom](https://marketplace.visualstudio.com/items?itemName=DoctrNikhil.codeloom-vscode)

### Features
- Analyze diffs in VS Code sidebar
- Interactive commit plan visualization
- One-click execution to create real commits
- MBD manifest integration for requirement tracing
- Dry-run mode for safe preview
- Full git integration with trailers

### Quick Start (VS Code)
1. Install extension from marketplace
2. Open a git repository
3. Click CodeLoom icon in Activity Bar
4. Click "Analyze Working Tree"
5. Review commit plan and click "Execute"

See [vscode-extension/README.md](./vscode-extension/README.md) for full documentation.

## Usage (CLI)

```bash
# Build + link globally (one-time)
npm install && npm run build && npm link
```

### Three input modes

CodeLoom can read changes from three sources. Pick whichever fits your workflow:

```bash
# 1) From a saved diff file
codeloom analyze path/to/changes.diff

# 2) From stdin (pipe `git diff` directly)
git diff HEAD~1 | codeloom analyze --stdin

# 3) From your currently staged changes (NEW in V0.2 — most ergonomic)
git add src/auth/ src/types/      # stage what you want
codeloom analyze --staged          # reads `git diff --cached`
```

### Analyze (plan only)

```bash
# With MBD traceability
codeloom analyze --staged --manifest design/manifest.yaml

# JSON output (for piping into other tools)
codeloom analyze --staged --json

# Different repo
codeloom analyze --staged -C /path/to/other/repo
```

### Execute (create real commits)

```bash
# Most ergonomic flow: stage → review → commit
git add .
codeloom execute --staged --dry-run                                 # preview only
codeloom execute --staged --branch codeloom/feature                 # commit on a new branch
codeloom execute --staged --manifest design/manifest.yaml           # with MBD trailers

# From a diff file (e.g. an AI-generated patch you haven't applied yet)
codeloom execute path/to/changes.diff --manifest design/manifest.yaml --branch codeloom/feature
```

When `--staged` is used with `execute`, CodeLoom:
1. Reads `git diff --cached`
2. Plans atomic commits
3. **Unstages everything** (`git reset HEAD` — working tree is unchanged)
4. Stages and commits each planned commit's files in turn
5. Leaves you with a clean tree and N atomic commits in `git log`

### Trace (requirements coverage)

```bash
# From a diff file
codeloom trace --diff changes.diff --manifest design/manifest.yaml

# Or from staged changes
codeloom trace --staged --manifest design/manifest.yaml
```

## Quick demo

```bash
npm run demo
```

This runs the analyzer on `examples/sample.diff` (a fake auth service implementation) using `examples/manifest.yaml` (5 requirements covering password hashing, login, JWT, rate limiting, and tests).

## Architecture

```
   raw diff
      |
      v
   DiffParser              [deterministic, no LLM]
      |
      v
   SymbolAnalyzer          [regex on TS/JS]
      |
      v
   IntentClassifier        [heuristics]
      |
      v
   RequirementMapper       [if MBD manifest provided]
      |
      v
   DependencyDetector      [pure graph analysis]
      |
      v
   CommitPlanner           [grouping + topological sort]
      |
      v
   GitExecutor (V0.2)      [stages + commits via simple-git]
      |
      v
   Real commits (or --dry-run preview)
```

The pipeline is **deterministic by design**. The same diff and manifest will always produce the same commit plan. No LLM calls required for correctness.

**V0.2 adds real git execution:** `GitExecutor` stages the hunk files, creates commits with `Traces-To` + `CodeLoom-Plan-Id` trailers, supports `--branch` (feature branch creation), `--dry-run` (preview), `--allow-dirty`, `--staged` (turns staged changes into atomic commits), and hard-rollback on failure.

### Commit message trailers

Every commit produced by CodeLoom embeds these trailers (machine-readable):

```
<title produced by the planner>

Files changed (N):
  - path/one
  - path/two

Traces-To: REQ-001, REQ-002      # only when MBD manifest used
CodeLoom-Plan-Id: commit_3
CodeLoom-Risk: critical
CodeLoom-Intent: security
```

These let downstream tools (CI, audit, release notes) reason about the change without re-parsing the diff.

## MBD manifest format

See `examples/manifest.yaml` for a complete example. Minimal shape:

```yaml
version: "1"
project: my-project
requirements:
  - id: REQ-001
    title: Short title
    description: Longer description
    category: security    # used for fuzzy intent matching
    priority: high
    keywords: [bcrypt, hash, password]   # matched against hunk content
    expectedFiles:                       # glob patterns for file paths
      - src/auth/**
    stateMachine:                        # optional
      name: AuthFlow
      transition: ANONYMOUS -> AUTHENTICATING
```

## What's not included (yet)

- Tree-sitter integration for non-TS/JS languages. V0.3.
- VS Code extension marketplace publishing. V0.4.
- Optional LLM enhancement layer (BYO API key). V0.5.

## Project layout

```
src/
  types/                 shared TypeScript types
  parser/                diff parsing
  analyzer/              symbol detection, intent, risk, dependencies, orchestration
  mbd/                   manifest loading and requirement mapping
  planner/               commit clustering and ordering
  executor/              GitExecutor — git operations (stage, commit, branch, rollback)
  cli/                   CLI entry point: analyze, execute, trace commands + formatter
examples/
  sample.diff            example AI-generated diff
  manifest.yaml          example MBD manifest
tests/
  *.test.ts              unit tests (parser, analyzer, planner, symbols, deps)
  integration/           real-git-repo integration tests for executor
dist/                    compiled JS (npm run build → tsc)
```

For the **VS Code extension**, see `../vscode-extension/`.

## License

MIT
