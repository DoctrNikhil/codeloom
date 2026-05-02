# CodeLoom for VS Code

> **Deterministic diff analyzer** that transforms AI-generated code changes into atomic, requirement-traced git commits.

Turn messy diffs (from Cursor, Copilot, or Claude) into clean, dependency-safe commits with automatic requirement traceability. **No LLM, fully deterministic.**

## Features

✨ **Atomic Commit Generation**
- Analyzes diffs and generates semantically meaningful commits
- Ensures dependency-safe commit order via topological sorting
- Groups related hunks into atomic, focused commits

🎯 **Intent & Risk Classification**
- **Intent Detection**: Automatically classifies as feature, bugfix, security, docs, tests, refactor, or config
- **Risk Scoring**: Marks critical (auth/payments), medium, or low-risk changes
- **Confidence Scoring**: Shows how confident CodeLoom is in each classification

📋 **MBD Traceability**
- Link commits to requirements via YAML manifest
- Keyword, file glob, and category-based matching
- See coverage gaps and untraceable hunks
- Embeds `Traces-To` trailers in commit messages

🔍 **Dependency Analysis**
- Builds symbol dependency DAG (TypeScript/JavaScript)
- Detects function/class/interface definitions and references
- Breaks cycles deterministically
- Orders commits to satisfy dependencies

🚀 **Git Integration**
- Real atomic commits via simple-git
- Dry-run mode for safe preview
- Feature branch creation
- Automatic rollback on failure
- Full commit message trailers for CI/CD

## Installation

1. Open VS Code Extensions (Ctrl+Shift+X / Cmd+Shift+X)
2. Search for **"CodeLoom"**
3. Click **Install**
4. Open a git repository with changes

## Quick Start

### Basic Workflow

1. **Make your changes** in your editor or generate code with AI
2. **Stage files** you want to commit:
   ```bash
   git add src/auth src/types
   ```
3. **Open CodeLoom** sidebar (click the git-merge icon in Activity Bar)
4. **Click "Analyze Working Tree"** button to plan commits
5. **Review** the generated commit plan in the sidebar:
   - See hunks, commits, risk levels, and intent
   - View requirement traces (if using manifest)
   - Check coverage %
6. **Execute** to create real commits:
   - Click "Dry Run" for a safe preview
   - Click "Execute" to commit with trailers

### Example

After analyzing a typical AI-generated diff:

```
━━━ CodeLoom Analysis ━━━

Summary
  Hunks analyzed:      8
  Commits planned:     3
  Risk distribution:   1 medium, 7 low
  Intent distribution: 1 feature, 1 security, 1 docs

Commit plan
  #1  LOW    config      chore: Configure package.json
  #2  MEDI   security    security: Add password hashing
  #3  LOW    docs        docs: Document auth module
```

Then click "Execute" to create 3 atomic commits with:
- Proper commit messages
- `CodeLoom-Plan-Id: commit_1` (etc.) trailers
- `CodeLoom-Risk: low|medium|critical` trailers
- `CodeLoom-Intent: feature|bugfix|...` trailers
- `Traces-To: REQ-001, REQ-002` trailers (if using manifest)

## Configuration

Open Settings (Ctrl+Comma / Cmd+Comma) and search for **CodeLoom**:

### `codeloom.manifestPath`
- **Type**: string
- **Default**: `design/manifest.yaml`
- **Description**: Workspace-relative path to MBD manifest YAML for requirement traceability
- **Example**: `.codeloom/manifest.yaml` or `requirements/manifest.yaml`

### `codeloom.useGlobalCli`
- **Type**: boolean
- **Default**: `false`
- **Description**: Use globally-installed `codeloom` CLI instead of bundled library
- **When to use**: You want to use a custom/development version of CodeLoom

### `codeloom.defaultBranch`
- **Type**: string
- **Default**: `` (empty, no branch switch)
- **Description**: Default feature branch name when executing a plan
- **Example**: `codeloom/feature` or `dev`

## Commands

All commands accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | What it does | Shortcut |
|---------|-------------|----------|
| **CodeLoom: Analyze Working Tree** | Analyze unstaged changes | — |
| **CodeLoom: Analyze a Diff File** | Open file picker and analyze | — |
| **CodeLoom: Dry Run** | Preview commits without creating them | — |
| **CodeLoom: Execute Current Plan** | Create real commits from plan | — |

## MBD Manifest Format

Create a `design/manifest.yaml` in your repository root to enable requirement traceability:

```yaml
version: "1"
project: my-project

requirements:
  - id: REQ-001
    title: Secure password hashing
    description: Hash passwords with bcrypt before storage
    category: security
    priority: high
    keywords: [bcrypt, hash, password, secret]
    expectedFiles:
      - src/auth/**
      - tests/auth/**
    
  - id: REQ-002
    title: User authentication flow
    description: Implement login/logout with JWT tokens
    category: feature
    priority: high
    keywords: [jwt, login, authenticate, token]
    expectedFiles:
      - src/auth/**
      - src/middleware/**

  - id: REQ-003
    title: API documentation
    description: Document all endpoints with examples
    category: docs
    priority: medium
    keywords: [api, documentation, readme, guide]
    expectedFiles:
      - docs/**
      - README.md
```

When you analyze diffs with this manifest:
- CodeLoom matches hunks to requirements based on keywords, file paths, and intent
- Shows which requirements are **IMPLEMENTED** vs **GAP** (uncovered)
- Embeds requirement IDs in commit messages as `Traces-To: REQ-001, REQ-002`
- Downstream tools (CI/CD, release notes) can parse trailers for traceability

## Understanding the UI

### Summary Cards
- **Hunks analyzed**: Total code chunks detected
- **Commits planned**: Number of atomic commits that will be created
- **Risk distribution**: Count of critical, medium, and low-risk changes
- **Coverage %**: Percentage of hunks mapped to requirements (MBD only)

### Commit List
Each commit shows:
- **Order** (#1, #2, etc.) — dependency-safe sequence
- **Risk badge** (color-coded):
  - 🔴 Critical (auth, payments, security keywords)
  - 🟠 Medium (10-50 lines in non-safe files)
  - 🟢 Low (tests, docs, styles, <10 lines)
- **Title** — semantic commit title
- **Intent** — feature/bugfix/security/docs/etc
- **Files** — changed file paths
- **Traces** — requirement IDs (if MBD enabled)

### Hunk Details
Expandable list showing:
- File path and line numbers
- Changed lines (+ added, - removed)
- Defined symbols (functions, classes, types)
- Referenced symbols (function calls, type uses)
- Dependencies on other hunks (if applicable)

## Troubleshooting

### "No staged changes" error
- Make sure you ran `git add <files>` first
- CodeLoom analyzes **staged** changes by default
- Alternative: Click "Analyze a Diff File" to analyze a `.diff` or `.patch` file

### Extension doesn't show up
- Make sure VS Code is v1.85.0 or later
- Try reloading VS Code (Cmd+R / Ctrl+R)
- Check if extension is installed but disabled (Extensions sidebar)

### Commits not created
- Review the **Dry Run** first to see what would happen
- Check for uncommitted changes outside the plan (use `--allow-dirty` in settings)
- Verify you're in a git repository: `git status`

### Manifest not found
- Create `design/manifest.yaml` in your repo root
- Or set `codeloom.manifestPath` in Settings to the correct path
- CodeLoom will warn if manifest not found

### Wrong requirement mapping
- Review the `keywords` in your manifest — they must match hunk content
- Check `expectedFiles` globs — they must match file paths
- Increase `category` matching by aligning with detected intent

## Architecture

CodeLoom's analysis pipeline (deterministic, no LLM):

```
     Unified Diff
          ↓
   ┌─────────────────┐
   │  DiffParser     │  Parse hunks, line ranges, change type
   └─────────────────┘
          ↓
   ┌─────────────────────┐
   │  SymbolAnalyzer     │  Extract functions, classes, types (TS/JS)
   └─────────────────────┘
          ↓
   ┌──────────────────────┐
   │  IntentClassifier    │  Detect intent & risk (heuristic)
   └──────────────────────┘
          ↓
   ┌───────────────────────┐
   │  RequirementMapper    │  Match hunks to requirements (if MBD)
   └───────────────────────┘
          ↓
   ┌──────────────────────┐
   │ DependencyDetector   │  Build DAG, topological sort
   └──────────────────────┘
          ↓
   ┌─────────────────────┐
   │  CommitPlanner      │  Cluster hunks → atomic commits
   └─────────────────────┘
          ↓
   ┌─────────────────────┐
   │   GitExecutor       │  Stage & commit via simple-git
   └─────────────────────┘
          ↓
   Real Git Commits (or dry-run preview)
```

Each stage is **deterministic** — same input always produces same output.

## Requirements

- **VS Code**: 1.85.0 or later
- **Git**: Recent version (2.20+)
- **Repository**: At least one commit (to have a HEAD to diff against)
- **Node.js**: 18+ (bundled with CodeLoom, but your system may need it)

## Known Limitations

- ⚠️ **Symbol analysis is TS/JS only** — Can't detect Python/Go/Rust symbols yet (planned for v0.3)
- ⚠️ **Can't undo commits once created** — Use `git reset --hard <sha>` manually if needed
- ⚠️ **No binary file support** — CodeLoom skips binary diffs
- ⚠️ **No file rename detection** — Renames are treated as delete + add
- ⚠️ **Manifest not auto-discovered** — You must create it in the expected path

## Performance

- **Typical analysis**: 1-3 seconds for 10-50 hunks
- **Execution**: <1 second per commit
- **Memory**: Lightweight; ~50MB for moderate-sized repos

## Security

- ✅ **No LLM calls** — Fully deterministic, no cloud API usage
- ✅ **Local only** — All analysis happens on your machine
- ✅ **Git safe** — Uses simple-git; never runs arbitrary git commands
- ✅ **Rollback enabled** — Automatic rollback on error

## Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/codeloom/codeloom/issues)
- **Discussions**: [GitHub Discussions](https://github.com/codeloom/codeloom/discussions)
- **Documentation**: [CodeLoom README](https://github.com/codeloom/codeloom)

## License

MIT — See LICENSE file in repository

---

**Built for AI-generated code.** 🤖→🎯

*Transform chaotic diffs into clean, requirement-traced commits. Fast, deterministic, traceable.*
