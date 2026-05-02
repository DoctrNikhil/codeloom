# CodeLoom — Setup & Development

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/your-org/codeloom.git
cd codeloom
npm install
```

### 2. Build

```bash
npm run build
```

This compiles TypeScript → `dist/` for both the CLI and VS Code extension.

### 3. Link the CLI globally (optional)

```bash
cd codeloom
npm link
```

Now you can run `codeloom` from anywhere:

```bash
codeloom analyze path/to/changes.diff
codeloom analyze path/to/changes.diff --manifest design/manifest.yaml
codeloom execute path/to/changes.diff --branch codeloom/feature
```

---

## Project structure

```
D:\codeloom\
├── codeloom/                    Core npm package (the main deliverable)
│   ├── src/
│   │   ├── types/              Shared data types
│   │   ├── parser/             DiffParser
│   │   ├── analyzer/           Symbol analysis, intent classification, dependencies
│   │   ├── mbd/                Manifest parsing, requirement mapping
│   │   ├── planner/            Commit planning
│   │   ├── executor/           GitExecutor — real git operations (V0.2)
│   │   └── cli/                CLI entry point
│   ├── examples/               sample.diff + manifest.yaml
│   ├── tests/                  Unit + integration tests (32 tests)
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── vscode-extension/           VS Code extension
│   ├── src/
│   │   ├── extension.ts        Activation, commands, state
│   │   └── planView.ts         Sidebar webview + UI
│   ├── package.json            Extension manifest
│   └── tsconfig.json
├── .gitignore                  Git ignore rules
├── CLAUDE.md                   Claude session context
├── PROJECT-CONTEXT.md          Hand-off doc for other AI tools
└── SETUP.md                    This file
```

---

## Running tests

```bash
cd codeloom

# All tests (32 total, ~20s)
npm test

# Unit tests only
npm run test:unit

# Integration tests (real git repos)
npm run test:integration
```

Integration tests create real temp directories, init git repos, and verify that the executor produces real commits with correct trailers. They're slower (~20s) but catch real issues.

---

## Development workflow

### Core library changes

```bash
cd codeloom
npm run build           # Compile TypeScript
npm test               # Run tests
npm link               # Update global CLI
```

### CLI testing

```bash
codeloom analyze examples/sample.diff --manifest examples/manifest.yaml
codeloom execute examples/sample.diff --manifest examples/manifest.yaml --dry-run
```

### VS Code extension development

```bash
cd vscode-extension
npm run compile         # Compile TypeScript

# In VS Code:
# - Press F5 to launch "Extension Development Host"
# - The extension will auto-activate and show the CodeLoom sidebar
```

---

## Configuration

### VS Code extension settings

Add to your workspace `.vscode/settings.json`:

```json
{
  "codeloom.manifestPath": "design/manifest.yaml",
  "codeloom.defaultBranch": "codeloom/feature",
  "codeloom.useGlobalCli": false
}
```

- `manifestPath` — path to MBD manifest YAML (relative to workspace root)
- `defaultBranch` — feature branch to create when executing a plan (empty = current branch)
- `useGlobalCli` — if true, shell out to globally-installed `codeloom` CLI instead of using library

---

## Deployment

### npm package (`codeloom`)

```bash
cd codeloom
npm version patch          # bumps version in package.json
npm publish               # publish to npm registry
```

Users can then:
```bash
npm install -g codeloom
codeloom --version
```

### VS Code extension

(V0.4+ milestone)

```bash
cd vscode-extension
npm run compile
vsce package               # creates .vsix file
# Upload to: https://marketplace.visualstudio.com/
```

---

## Architecture decisions

- **Deterministic by design** — no LLM calls required. Same diff + manifest = same plan always.
- **Symbol-level DAG** — dependency analysis via symbol references (functions, classes, types). Kahn's topological sort guarantees safe commit order.
- **Heuristic-based** — intent classification and risk scoring use pattern matching (keywords, file paths), not ML.
- **V0.2: Real git execution** — `GitExecutor` uses `simple-git` to stage files, create commits with full trailers (`Traces-To`, `CodeLoom-Plan-Id`, `CodeLoom-Risk`, `CodeLoom-Intent`), support branching, and rollback on failure.
- **Test-driven** — 32 unit + integration tests, including real-git-repo verification of executor behavior.

---

## Roadmap

| Version | Feature | Status |
|---|---|---|
| V0.1 | Analysis pipeline + CLI plan | Done |
| **V0.2** | Executor + tests + VS Code extension scaffold | **Current** |
| V0.3 | Tree-sitter for Python/Go/Rust/Java | Planned |
| V0.4 | VS Code marketplace publish | Planned |
| V0.5 | Optional LLM polish layer | Planned |

---

## Troubleshooting

### `codeloom command not found`

```bash
cd codeloom
npm run build
npm link
```

### Tests fail

```bash
# Clean rebuild
rm -rf codeloom/dist node_modules
npm install
npm run build
npm test
```

### VS Code extension won't compile

```bash
cd vscode-extension
rm -rf out node_modules
npm install
npm run compile
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b codeloom/my-feature`
3. Make changes and run tests: `npm test`
4. Commit with meaningful messages
5. Open a PR

---

## License

MIT
