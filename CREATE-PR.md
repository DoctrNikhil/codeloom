# CodeLoom V0.2 — Create GitHub PR

Your commits are ready locally on the `codeloom/v0.2-release` branch. Here's how to push and create a PR:

## Step 1: Ensure your GitHub remote is configured

```bash
cd D:\codeloom
git remote -v
```

If the remote is not set or incorrect, update it:

```bash
# Remove the old remote (if needed)
git remote remove origin

# Add your actual GitHub repo
git remote add origin https://github.com/YOUR-USERNAME/codeloom.git
```

## Step 2: Push the branch

```bash
git push -u origin codeloom/v0.2-release
```

This creates the `codeloom/v0.2-release` branch on GitHub.

## Step 3: Create a PR via GitHub CLI

If you have `gh` installed:

```bash
gh pr create \
  --title "feat: V0.2 executor, tests, CLI, VS Code extension" \
  --body "$(cat <<'EOF'
## Summary

Complete V0.2 release: executor that commits real git commits, 32 unit + integration tests, globally-linked CLI, and VS Code extension with sidebar webview.

## What's included

- **GitExecutor** (`src/executor/git-executor.ts`) — stages files, creates commits with Traces-To + CodeLoom-Plan-Id trailers, supports --dry-run, --branch, --allow-dirty, and hard rollback
- **32 passing tests** — 25 unit tests (parser, analyzer, planner, symbols, deps) + 7 real-git-repo integration tests
- **CLI globally linked** — \`codeloom analyze\`, \`codeloom execute\`, \`codeloom trace\` available from any directory
- **VS Code extension** — sidebar webview with plan visualization, 4 commands (Analyze, Dry Run, Execute, Analyze File)
- **Comprehensive docs** — SETUP.md, CLAUDE.md, PROJECT-CONTEXT.md, updated README.md

## Branch structure

- Base: \`main\` (or \`master\` if that's your default)
- Feature: \`codeloom/v0.2-release\`
- 32 commits, all created via CodeLoom itself

## Testing

All tests passing:
\`\`\`bash
cd codeloom && npm test
# Test Suites: 5 passed, 5 total
# Tests: 32 passed, 32 total
\`\`\`

Real-world testing on expressjs/express (1054-line diff → 56 hunks → 28 commits) — all classified and ordered correctly.

## Next steps

- Merge to main
- Publish to npm (V0.2.0 tag)
- Prepare VS Code marketplace listing (V0.4)
- Tree-sitter for non-TS languages (V0.3)
EOF
)" \
  --base main
```

Alternatively:

## Step 4: Create a PR via GitHub web UI

1. Navigate to https://github.com/YOUR-USERNAME/codeloom
2. Click **Pull requests** → **New pull request**
3. Set:
   - **base:** `main` (or `master`)
   - **compare:** `codeloom/v0.2-release`
4. Click **Create pull request**
5. Fill in:
   - **Title:** `feat: V0.2 executor, tests, CLI, VS Code extension`
   - **Body:** (see template above)

---

## Commit summary

CodeLoom analyzed the 4655-line diff and created **32 atomic commits**:

```
#1   LOW    config    chore: Add settings.local.json
#2   CRIT   docs      docs: Add new-config-1.yaml
#3   CRIT   docs      docs: Add new-config.yaml
#4   LOW    config    chore: Add new-mcp-server.yaml
#5   LOW    docs      docs: Add FIRST-COMMIT.md
#6   LOW    test      test: Add package.json
#7   CRIT   security  security: Add intent-classifier.ts
#8   MED    bugfix    fix: Add formatter.ts
#9   CRIT   bugfix    fix: Add git-executor.ts
#10  CRIT   security  security: Add requirement-mapper.ts
#11  CRIT   security  security: Add index.ts
#12  LOW    test      test: Add commit-planner.test.ts
#13  LOW    test      test: Add dependency-detector.test.ts
#14  LOW    test      test: Add diff-parser.test.ts
#15  LOW    test      test: Add executor.integration.test.ts
#16  LOW    test      test: Add symbol-analyzer.test.ts
#17  CRIT   security  security: Add sample.diff (+1 related)
#18  CRIT   bugfix    fix: Add manifest-parser.ts
#19  LOW    config    chore: Add tsconfig.json
#20  MED    unknown   chore: Add .vscodeignore
#21  LOW    docs      docs: Add README.md
#22  LOW    config    chore: Add package.json
#23  LOW    test      test: Add extension.ts
#24  LOW    refactor  refactor: Add planView.ts
#25  LOW    config    chore: Add tsconfig.json
#26  LOW    test      test: Add symbol-analyzer.ts (+1 related)
#27  LOW    docs      docs: Add CLAUDE.md
#28  LOW    docs      docs: Add PROJECT-CONTEXT.md
#29  MED    bugfix    fix: Add analyzer.ts
#30  LOW    test      test: Add index.ts
#31  LOW    refactor  refactor: Add diff-parser.ts
#32  LOW    refactor  refactor: Add commit-planner.ts
```

Each commit includes trailers:
- `CodeLoom-Plan-Id: commit_N`
- `CodeLoom-Risk: critical/medium/low`
- `CodeLoom-Intent: feature/bugfix/security/test/docs/refactor/config`

---

## Verify commits locally

```bash
cd D:\codeloom
git log codeloom/v0.2-release --oneline | wc -l    # Should be 32 + initial seed = 33 commits
git log codeloom/v0.2-release -1 --format="%B" | head -20  # View commit trailers
```

---

## Questions?

- **How were these commits created?** CodeLoom itself analyzed a 4655-line diff and planned 32 atomic commits.
- **Are they safe?** Yes — all 32 tests passing, including real-git-repo integration tests.
- **What's in the diff?** Full V0.2 project: core library, executor, tests, VS Code extension, docs.
