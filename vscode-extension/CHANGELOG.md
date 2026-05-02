# Change Log

All notable changes to the "CodeLoom" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-02

### Added
- **VS Code Extension** for CodeLoom v0.2.0
- **Sidebar View** ("Commit Plan") in Activity Bar with git-merge icon
- **Analysis Pipeline**: Analyze working tree diffs or imported diff files
- **Four Core Commands**:
  - `CodeLoom: Analyze Working Tree` — Analyze unstaged git changes
  - `CodeLoom: Analyze a Diff File` — Open file picker to analyze `.diff`/`.patch`
  - `CodeLoom: Execute Current Plan` — Create real commits from plan
  - `CodeLoom: Dry Run` — Preview commits without git operations
- **Interactive Webview** with:
  - Summary cards: hunks, commits, risk distribution, requirement coverage
  - Ordered commit plan with risk badges (color-coded), intents, files, requirement traces
  - Real-time updates after analysis and execution
- **MBD Manifest Integration**:
  - Load YAML manifest for requirement traceability
  - Match hunks to requirements by keywords, file globs, and category
  - Show coverage % and unimplemented requirements
  - Embed `Traces-To` trailers in commits
- **Configuration Options**:
  - `codeloom.manifestPath` — Workspace-relative path to manifest YAML
  - `codeloom.useGlobalCli` — Shell out to global CodeLoom CLI
  - `codeloom.defaultBranch` — Default feature branch name for commits
- **Git Operations**:
  - Deterministic commit creation via simple-git
  - Dependency-safe commit ordering
  - Automatic rollback on execution failure
  - Feature branch support (`--branch` flag)
  - Commit message trailers for CI/CD integration
- **Error Handling**:
  - User-friendly dialog prompts for confirmation
  - Detailed error messages
  - Output channel logging for execution results
  - Graceful fallback for missing manifests

### Features Inherited from CodeLoom v0.2
- **Atomic Commit Generation**: Semantically meaningful, dependency-safe commits
- **Intent Classification**: 9 categories (feature, bugfix, security, docs, tests, config, style, refactor, unknown)
- **Risk Scoring**: Critical, medium, low assessment based on file type and content
- **Symbol Analysis**: TypeScript/JavaScript function, class, interface, and type detection
- **Dependency Detection**: DAG building with topological sort and cycle breaking
- **Full Determinism**: No LLM, same input = same output always

### Technical Details
- **TypeScript**: Strict mode, ES2020 target
- **Dependencies**:
  - `codeloom` (bundled local package) — Core analysis and execution library
  - `simple-git` (v3.22.0) — Git repository operations
  - `@types/vscode` (v1.85.0) — VS Code API types
- **Activation**: `onStartupFinished` — Automatically activates on VS Code startup
- **Auto-analysis**: Runs initial analysis if workspace detected (1s delay)
- **Build**: TypeScript compilation to `/out` directory

### Known Limitations
- Symbol analysis is **TypeScript/JavaScript only** (Python, Go, Rust coming in v0.3)
- Cannot analyze non-git directories
- Manifest auto-discovery not yet implemented (manual path configuration required)
- No visualization of dependency graphs
- No advanced CLI options exposed (verbose logging, allow-dirty, no-rollback)

### Testing
- 38 unit tests in CodeLoom core (diff parser, symbol analyzer, planner, executor)
- 6 staged-mode integration tests with real git repositories
- Manual testing verified on Windows

## [0.1.0] - 2026-04-01

### Added
- Initial VS Code extension scaffold
- Basic command registration
- Placeholder webview UI
- TypeScript configuration

