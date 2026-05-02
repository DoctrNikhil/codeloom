/**
 * Integration tests for --staged mode.
 *
 * Flow under test:
 *   1. User runs `git add` to stage files
 *   2. CodeLoom reads `git diff --cached`, plans commits
 *   3. Executor unstages everything (`git reset HEAD`)
 *   4. Executor stages and commits each planned commit's files in turn
 *   5. End state: HEAD has N atomic commits, working tree clean
 *
 * No mocks. Real git binary, real temp repos.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { GitExecutor } from '../../src/executor/git-executor';
import { Analyzer } from '../../src/analyzer/analyzer';
import { ManifestParser } from '../../src/mbd/manifest-parser';

jest.setTimeout(30_000);

function mkTempRepoDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeloom-staged-'));
}

async function initRepo(dir: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.email', 'test@codeloom.dev');
  await git.addConfig('user.name', 'CodeLoom Test');
  await git.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), '# seed\n');
  await git.add('README.md');
  await git.commit('initial commit');
}

/**
 * Create a realistic multi-file change set on disk and `git add` it.
 * Returns the list of staged files for assertions.
 */
async function stageRealisticChanges(repoDir: string): Promise<string[]> {
  const files: Record<string, string> = {
    'src/auth/hash.ts': `import bcrypt from 'bcrypt';
export async function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 12);
}
`,
    'src/auth/jwt.ts': `import jwt from 'jsonwebtoken';
export function signToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev');
}
`,
    'src/types/user.ts': `export interface User {
  id: string;
  email: string;
  passwordHash: string;
}
`,
    'tests/auth.test.ts': `import { hashPassword } from '../src/auth/hash';
describe('hash', () => {
  it('hashes', async () => {
    expect(await hashPassword('x')).toBeTruthy();
  });
});
`,
    'docs/AUTH.md': `# Authentication\n\nPasswords are bcrypt-hashed.\n`,
  };

  const staged: string[] = [];
  const git = simpleGit(repoDir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(repoDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    await git.add(rel);
    staged.push(rel.replace(/\\/g, '/'));
  }
  return staged;
}

describe('--staged mode (integration)', () => {
  let repoDir: string;

  beforeEach(async () => { repoDir = mkTempRepoDir(); await initRepo(repoDir); });
  afterEach(() => { try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('reads `git diff --cached` and produces a non-empty plan', async () => {
    await stageRealisticChanges(repoDir);
    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    expect(stagedDiff.trim().length).toBeGreaterThan(0);

    const analysis = new Analyzer().analyze(stagedDiff);
    expect(analysis.summary.totalHunks).toBeGreaterThanOrEqual(5);
    expect(analysis.summary.totalCommits).toBeGreaterThanOrEqual(1);
  });

  it('with unstageFirst: creates real commits from staged files and ends clean', async () => {
    const stagedFiles = await stageRealisticChanges(repoDir);
    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    const analysis = new Analyzer().analyze(stagedDiff);

    const startCount = (await simpleGit(repoDir).log()).total;

    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, {
      unstageFirst: true,
      allowDirty: true,
    });

    expect(result.success).toBe(true);
    expect(result.commits.length).toBe(analysis.commits.length);

    // Commits actually exist
    const log = await simpleGit(repoDir).log();
    expect(log.total).toBe(startCount + analysis.commits.length);

    // Working tree is clean — every file made it into a commit
    const status = await simpleGit(repoDir).status();
    expect(status.files.length).toBe(0);

    // Every staged file is now tracked in HEAD
    const trackedFiles = (await simpleGit(repoDir).raw(['ls-tree', '-r', '--name-only', 'HEAD']))
      .split('\n').map(s => s.trim()).filter(Boolean);
    for (const f of stagedFiles) {
      expect(trackedFiles).toContain(f);
    }
  });

  it('embeds CodeLoom-Plan-Id trailer in staged-mode commits', async () => {
    await stageRealisticChanges(repoDir);
    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    const analysis = new Analyzer().analyze(stagedDiff);

    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, {
      unstageFirst: true,
      allowDirty: true,
    });
    expect(result.success).toBe(true);

    const log = await simpleGit(repoDir).log({ maxCount: analysis.commits.length });
    const allMsgs = log.all.map(c => `${c.message}\n${c.body}`).join('\n---\n');
    expect(allMsgs).toContain('CodeLoom-Plan-Id:');
    expect(allMsgs).toContain('CodeLoom-Risk:');
    expect(allMsgs).toContain('CodeLoom-Intent:');
  });

  it('staged-mode + branch: creates commits on a fresh feature branch', async () => {
    await stageRealisticChanges(repoDir);
    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    const analysis = new Analyzer().analyze(stagedDiff);

    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, {
      unstageFirst: true,
      allowDirty: true,
      branch: 'codeloom/staged-feature',
    });

    expect(result.success).toBe(true);
    expect(result.branch).toBe('codeloom/staged-feature');
    const branches = await simpleGit(repoDir).branchLocal();
    expect(branches.all).toContain('codeloom/staged-feature');
    expect(branches.current).toBe('codeloom/staged-feature');
  });

  it('staged-mode honors MBD manifest for traceability trailers', async () => {
    await stageRealisticChanges(repoDir);

    // Drop a tiny manifest into the repo
    const manifestPath = path.join(repoDir, 'manifest.yaml');
    fs.writeFileSync(manifestPath, `version: "1"
project: stage-test
requirements:
  - id: REQ-AUTH-001
    title: Password hashing
    description: Hash with bcrypt
    category: security
    keywords: [bcrypt, hash, password]
    expectedFiles: [src/auth/**]
  - id: REQ-DOC-001
    title: Auth documentation
    description: Document the auth system
    category: docs
    keywords: [authentication, auth]
    expectedFiles: [docs/**]
`);

    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    const manifest = new ManifestParser().loadFromFile(manifestPath);
    const analysis = new Analyzer().analyze(stagedDiff, { manifest });

    // At least one commit should trace
    expect(analysis.commits.some(c => c.tracesTo.length > 0)).toBe(true);

    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, {
      unstageFirst: true,
      allowDirty: true,
    });
    expect(result.success).toBe(true);

    const log = await simpleGit(repoDir).log({ maxCount: analysis.commits.length });
    const allMsgs = log.all.map(c => `${c.message}\n${c.body}`).join('\n---\n');
    expect(allMsgs).toMatch(/Traces-To:.*REQ-/);
  });

  it('unstageFirst is a no-op when there are no staged changes (still runs successfully on empty plan)', async () => {
    // Stage nothing — empty diff
    const stagedDiff = await simpleGit(repoDir).diff(['--cached']);
    expect(stagedDiff.trim()).toBe('');

    // Empty diff → empty plan → executor succeeds with zero commits
    const analysis = new Analyzer().analyze(stagedDiff);
    expect(analysis.commits.length).toBe(0);

    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, {
      unstageFirst: true,
      allowDirty: true,
    });
    expect(result.success).toBe(true);
    expect(result.commits.length).toBe(0);
  });
});
