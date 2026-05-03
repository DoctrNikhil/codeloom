# Change Log

## [0.2.0] - 2026-05-03

### Added
- Sidebar webview with commit plan visualization
- Commands: Analyze Working Tree, Analyze Staged, Analyze Diff File, Dry Run, Execute
- MBD manifest integration for requirement traceability
- Summary cards: hunks, commits, risk distribution, coverage
- Color-coded risk badges (critical/medium/low)
- Git integration via simple-git with rollback support
- Configuration: manifest path, default branch

### Fixed
- Webview buttons use addEventListener (CSP-compatible, no inline onclick)
