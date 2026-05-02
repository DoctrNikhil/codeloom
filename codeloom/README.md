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
- **CLI** — `codeloom analyze`, `codeloom execute`, and `codeloom trace` commands (globally linked)
- **Unit + integration tests** — 32 tests including real-git-repo executor verification
- **VS Code extension** — sidebar webview with commit plan visualization (commands: Analyze, Dry Run, Execute)

## Usage

```bash
# Build + link globally (one-time)
npm install && npm run build && npm link

# Analyze a diff (no MBD)
codeloom analyze path/to/changes.diff

# Analyze with MBD traceability
codeloom analyze path/to/changes.diff --manifest design/manifest.yaml

# EXECUTE: apply the plan as real git commits (V0.2)
codeloom execute path/to/changes.diff --manifest design/manifest.yaml --branch codeloom/feature
codeloom execute path/to/changes.diff --manifest design/manifest.yaml --dry-run    # preview only

# Read diff from stdin
git diff HEAD~1 | codeloom analyze --stdin --manifest design/manifest.yaml

# JSON output (for piping into other tools)
codeloom analyze changes.diff --json

# Show traceability matrix only
codeloom trace --diff changes.diff --manifest design/manifest.yaml
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

**V0.2 adds real git execution:** `GitExecutor` stages the hunk files, creates commits with `Traces-To` + `CodeLoom-Plan-Id` trailers, supports `--branch` (feature branch creation), `--dry-run` (preview), `--allow-dirty`, and hard-rollback on failure.

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
