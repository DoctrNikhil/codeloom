# CodeLoom for VS Code

> Deterministic diff analyzer that turns AI-generated code changes into atomic, requirement-traced git commits.

No LLM required. Fully deterministic. Works with Cursor, Copilot, or Claude output.

## Quick Start

1. Install the extension
2. Open a git repository with changes
3. Click the CodeLoom icon in the Activity Bar (left sidebar)
4. Click **Analyze** (or **Analyze Staged** for `git add`'d files)
5. Review the commit plan
6. Click **Execute** to create real commits

## Commands

| Command | Description |
|---------|-------------|
| **CodeLoom: Analyze Working Tree** | Analyze all uncommitted changes |
| **CodeLoom: Analyze Staged Changes** | Analyze only `git add`'d changes |
| **CodeLoom: Analyze a Diff File** | Analyze a `.diff` / `.patch` file |
| **CodeLoom: Dry Run** | Preview commits without creating them |
| **CodeLoom: Execute Plan** | Create real atomic commits |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `codeloom.manifestPath` | `design/manifest.yaml` | Path to MBD manifest YAML |
| `codeloom.defaultBranch` | *(empty)* | Feature branch name for execution |

## MBD Traceability

Create a `design/manifest.yaml` in your repo to enable requirement tracing:

```yaml
version: "1"
project: my-project
requirements:
  - id: REQ-001
    title: Secure password hashing
    category: security
    keywords: [bcrypt, hash, password]
    expectedFiles:
      - src/auth/**
```

Commits will include `Traces-To: REQ-001` trailers automatically.

## Requirements

- VS Code 1.85.0+
- Git 2.20+
- Repository with at least one commit

## License

MIT

---

[Issues](https://github.com/DoctrNikhil/codeloom/issues) | [Source](https://github.com/DoctrNikhil/codeloom)
