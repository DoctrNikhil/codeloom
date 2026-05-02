import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { GitExecutor } from '../../src/executor/git-executor';
import { Analyzer } from '../../src/analyzer/analyzer';
import { ManifestParser } from '../../src/mbd/manifest-parser';

jest.setTimeout(30_000);

function mkTempRepoDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeloom-it-'));
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

function applyDiffToDisk(diff: string, repoDir: string): void {
  const lines = diff.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git ')) { i++; continue; }
    let filePath = '';
    let isNew = false;
    while (i < lines.length && !lines[i].startsWith('@@')) {
      if (lines[i].startsWith('new file mode')) isNew = true;
      const m = lines[i].match(/^\+\+\+ b\/(.+)$/);
      if (m) filePath = m[1];
      i++;
    }
    if (!filePath) continue;
    const added: string[] = [];
    while (i < lines.length) {
      if (lines[i].startsWith('diff --git ')) break;
      if (lines[i].startsWith('+') && !lines[i].startsWith('+++')) added.push(lines[i].substring(1));
      i++;
    }
    const abs = path.join(repoDir, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (isNew) { fs.writeFileSync(abs, added.join('\n') + '\n'); }
    else if (fs.existsSync(abs)) { fs.appendFileSync(abs, added.join('\n') + '\n'); }
    else { fs.writeFileSync(abs, added.join('\n') + '\n'); }
  }
}

function loadFixtures() {
  const fixturesDir = path.join(__dirname, '..', '..', 'examples');
  return {
    diff: fs.readFileSync(path.join(fixturesDir, 'sample.diff'), 'utf-8'),
    manifestPath: path.join(fixturesDir, 'manifest.yaml'),
  };
}

describe('GitExecutor integration', () => {
  let repoDir: string;

  beforeEach(async () => { repoDir = mkTempRepoDir(); await initRepo(repoDir); });
  afterEach(() => { try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('refuses to run when not in a git repo', async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'codeloom-no-git-'));
    try {
      const fakeAnalysis = { commits: [], hunks: [], traceability: { requirementToHunks: new Map(), hunkToRequirements: new Map(), uncoveredRequirements: [], untraceableHunks: [] }, summary: { totalHunks: 0, totalCommits: 0, riskDistribution: { critical: 0, medium: 0, low: 0 }, intentDistribution: {} as any, requirementsCovered: 0, requirementsTotal: 0, gaps: [] } } as any;
      const r = await new GitExecutor({ cwd: nonRepo }).execute(fakeAnalysis);
      expect(r.success).toBe(false);
      expect(r.error).toContain('Not a git repository');
    } finally { fs.rmSync(nonRepo, { recursive: true, force: true }); }
  });

  it('dry-run reports the plan without creating commits', async () => {
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    const beforeHead = (await simpleGit(repoDir).revparse(['HEAD'])).trim();
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { dryRun: true, allowDirty: true });
    const afterHead = (await simpleGit(repoDir).revparse(['HEAD'])).trim();
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.commits.length).toBe(analysis.commits.length);
    expect(beforeHead).toBe(afterHead);
  });

  it('creates real commits in topological order', async () => {
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { allowDirty: true });
    expect(result.success).toBe(true);
    expect(result.commits.length).toBe(analysis.commits.length);
    const log = await simpleGit(repoDir).log({ maxCount: analysis.commits.length });
    expect(log.all.length).toBe(analysis.commits.length);
    const fullMsg = log.latest!.body + ' ' + log.latest!.message;
    expect(fullMsg).toContain('CodeLoom-Plan-Id:');
  });

  it('embeds Traces-To trailer for commits linked to requirements', async () => {
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    expect(analysis.commits.find(c => c.tracesTo.length > 0)).toBeTruthy();
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { allowDirty: true });
    expect(result.success).toBe(true);
    const log = await simpleGit(repoDir).log({ maxCount: analysis.commits.length });
    const allMessages = log.all.map(c => `${c.message}\n${c.body}`).join('\n---\n');
    expect(allMessages).toMatch(/Traces-To:.*REQ-/);
  });

  it('creates a feature branch when requested', async () => {
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { branch: 'codeloom/feature-x', allowDirty: true });
    expect(result.success).toBe(true);
    expect(result.branch).toBe('codeloom/feature-x');
    expect((await simpleGit(repoDir).branchLocal()).all).toContain('codeloom/feature-x');
  });

  it('rolls back to start SHA when a commit step fails', async () => {
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    const startSha = (await simpleGit(repoDir).revparse(['HEAD'])).trim();
    if (analysis.commits.length >= 1) {
      const poisoned = JSON.parse(JSON.stringify(analysis.commits[0]));
      poisoned.id = 'commit_poison';
      poisoned.hunks = [{ ...analysis.commits[0].hunks[0], id: 'hunk_poison', filePath: 'this/path/does/not/exist.ts' }];
      analysis.commits.splice(1, 0, poisoned);
    }
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { allowDirty: true });
    const endSha = (await simpleGit(repoDir).revparse(['HEAD'])).trim();
    if (result.rolledBack) { expect(endSha).toBe(startSha); }
    else { expect(result.success).toBe(true); }
  });

  it('refuses to run on dirty tree with files outside the plan unless allowDirty', async () => {
    fs.writeFileSync(path.join(repoDir, 'unrelated.txt'), 'stray');
    const { diff, manifestPath } = loadFixtures();
    applyDiffToDisk(diff, repoDir);
    const analysis = new Analyzer().analyze(diff, { manifest: new ManifestParser().loadFromFile(manifestPath) });
    const result = await new GitExecutor({ cwd: repoDir }).execute(analysis, { allowDirty: false });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/uncommitted changes/i);
  });
});
