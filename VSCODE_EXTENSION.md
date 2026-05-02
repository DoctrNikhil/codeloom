# CodeLoom VS Code Extension

Complete guide for building, testing, and publishing the CodeLoom VS Code extension.

---

## Overview

The CodeLoom VS Code extension analyzes git diffs and generates atomic, requirement-traced commits with a single click.

**Current Status**: ✅ Ready to use
- Extension code compiled
- Dependencies installed
- VSIX package ready to create
- Ready to test or publish to marketplace

---

## Generate VSIX File (Package)

### Prerequisites (One-Time)
```bash
npm install -g @vscode/vsce
vsce --version  # Verify installation
```

### Generate VSIX in 5 Steps

**Step 1: Navigate to extension folder**
```bash
cd D:\codeloom\vscode-extension
```

**Step 2: Install dependencies**
```bash
npm install
```

**Step 3: Compile TypeScript**
```bash
npm run compile
```

**Step 4: Copy CodeLoom library to node_modules**
```bash
rm -rf node_modules/codeloom
cp -r ../codeloom node_modules/
```

**Step 5: Create VSIX package**
```bash
vsce package --no-update-package-json
```

**Result**: `codeloom-vscode-0.2.0.vsix` file created (15 MB)

### Verify Success
```bash
ls -lh codeloom-vscode-0.2.0.vsix
# Should show ~15 MB file
```

---

## Test Extension Locally

### Method 1: Using VSIX File
1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Click `⋯` (three dots menu)
4. Select "Install from VSIX..."
5. Browse to `codeloom-vscode-0.2.0.vsix`
6. Click Install

### Method 2: Using F5 (Development Mode)
1. Open `vscode-extension` folder in VS Code
2. Press `F5` → New VS Code window opens with extension
3. Extension loads automatically
4. Test with any git repository

### Testing Steps
1. **Find CodeLoom Icon**: Look in left sidebar (Activity Bar)
2. **Click Icon**: Opens "Commit Plan" sidebar
3. **Make Changes**: Edit files in your git repo
4. **Click "Analyze"**: See generated commit plan
5. **Click "Dry Run"**: Preview commits (no changes)
6. **Click "Execute"**: Create real commits
7. **Verify**: Run `git log` to see CodeLoom commits with trailers

---

## Publish to VS Code Marketplace

### Prerequisites

1. **Microsoft Account**
   - Go to https://account.microsoft.com
   - Sign up if needed

2. **VS Code Publisher Account**
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in → "Create publisher"
   - Enter name: `codeloom`
   - Verify email

3. **Personal Access Token (PAT)**
   - Go to https://dev.azure.com
   - Sign in → Profile → "Personal access tokens"
   - Click "+ New Token"
   - Name: `codeloom-marketplace`
   - Scopes: "All accessible scopes"
   - Expiration: 1 year
   - Click Create
   - **COPY TOKEN IMMEDIATELY** (won't show again!)

### Publish Steps

**Step 1: Login with vsce**
```bash
cd vscode-extension
vsce login codeloom
# When prompted: Paste your PAT token and press Enter
```

**Step 2: Publish**
```bash
vsce publish
```

**Expected Output**:
```
Publishing 'codeloom/codeloom-vscode' v0.2.0...
 DONE  Published to https://marketplace.visualstudio.com/items?itemName=codeloom.codeloom-vscode
```

**Step 3: Verify**
Visit: https://marketplace.visualstudio.com/items?itemName=codeloom.codeloom-vscode
- Should see extension page
- "Install" button available

### Share Extension
Users can now install with:
```
https://marketplace.visualstudio.com/items?itemName=codeloom.codeloom-vscode
```

---

## Configuration

Users can configure in VS Code Settings (Ctrl + ,):

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `codeloom.manifestPath` | string | `design/manifest.yaml` | Path to MBD manifest for requirement tracing |
| `codeloom.useGlobalCli` | boolean | `false` | Use globally-installed CodeLoom CLI |
| `codeloom.defaultBranch` | string | `` | Default feature branch name |

### Example: Custom Manifest Path
1. Open Settings
2. Search: `codeloom.manifestPath`
3. Change to: `config/requirements.yaml`
4. Extension will use that file for traceability

---

## Troubleshooting

### "vsce command not found"
```bash
npm install -g @vscode/vsce
```

### "npm ERR! extraneous" during vsce package
Check `package.json` doesn't have `"codeloom": "file:../codeloom"` in dependencies.
Remove if present and try again.

### "TypeScript compilation failed"
```bash
npm run compile
```
Check output for errors. All should compile with zero errors.

### Extension doesn't appear after install
```bash
# Reload VS Code
Ctrl+Shift+P → "Developer: Reload Window" → Enter
```

### Commands not available in Command Palette
- Check extension is enabled: `Ctrl+Shift+X` → search "CodeLoom" → enable if disabled
- Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"

### Analyze shows no plan
1. Make sure you're in a git repository: `git status`
2. Make sure you have changes: `git diff`
3. Check output channel: `Ctrl+`` → Select "CodeLoom" → See logs

### "LICENSE file missing"
Copy from root:
```bash
cp ../LICENSE ./LICENSE
```

### VSIX file too small (< 1 MB)
Codeloom library didn't copy properly. Redo:
```bash
rm -rf node_modules/codeloom
cp -r ../codeloom node_modules/
vsce package --no-update-package-json
```

---

## File Structure

```
vscode-extension/
├── src/
│   ├── extension.ts        # Main extension entry point
│   └── planView.ts         # Webview UI provider
├── out/
│   ├── extension.js        # Compiled extension
│   ├── extension.js.map
│   ├── planView.js         # Compiled UI
│   └── planView.js.map
├── package.json            # Marketplace metadata
├── README.md               # User documentation
├── CHANGELOG.md            # Version history
├── .vscodeignore           # Package exclusions
├── .vscodeignore           # TypeScript config
└── codeloom-vscode-0.2.0.vsix  # Generated package
```

---

## Common Workflows

### Workflow 1: Quick Test
```bash
cd vscode-extension
code .           # Open in VS Code
# Press F5 → Extension loads in new window
# Create test repo and test commands
```

### Workflow 2: Build & Publish
```bash
cd vscode-extension
npm install
npm run compile
rm -rf node_modules/codeloom && cp -r ../codeloom node_modules/
vsce package --no-update-package-json
vsce login codeloom          # Paste PAT
vsce publish
```

### Workflow 3: Update Version & Republish
```bash
# Edit package.json version: 0.2.0 → 0.2.1
nano package.json

# Recompile if needed
npm run compile

# Republish
vsce publish
```

---

## Features

### Commands
- **Analyze Working Tree**: Analyze unstaged changes
- **Analyze from Diff File**: Analyze .diff or .patch file
- **Dry Run**: Preview commits (no git changes)
- **Execute**: Create real commits with CodeLoom trailers

### Output
Each commit includes trailers:
```
commit abc1234
    docs: Update README.md

    CodeLoom-Plan-Id: commit_1
    CodeLoom-Risk: low
    CodeLoom-Intent: docs
    Traces-To: REQ-001, REQ-002
```

### UI
- Summary cards showing:
  - Total hunks analyzed
  - Number of commits planned
  - Risk distribution (low/medium/critical)
  - Requirement coverage %
- Interactive commit list with color-coded risk
- Requirement trace matrix (if manifest configured)

---

## Updating Extension

### To Bump Version
1. Edit `vscode-extension/package.json`
2. Change `"version": "0.2.0"` to `"version": "0.2.1"`
3. Update `vscode-extension/CHANGELOG.md`
4. Compile and test
5. Publish: `vsce publish`

### To Add New Command
1. Edit `src/extension.ts`
2. Register command in `activate()`
3. Add to `package.json` → `contributes.commands`
4. Compile: `npm run compile`
5. Test with F5
6. Publish: `vsce publish`

---

## Requirements

- VS Code 1.85.0+
- Git repository
- Node.js 18+ (for development)
- npm (for building)

---

## Support

**Issues**: Check CodeLoom main repo
**Docs**: Read vscode-extension/README.md

---

**Last Updated**: 2026-05-02
**Version**: 0.2.0
**Status**: ✅ Ready for use
