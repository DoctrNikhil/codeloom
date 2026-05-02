#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { simpleGit } from 'simple-git';
import { Analyzer } from '../analyzer/analyzer';
import { ManifestParser } from '../mbd/manifest-parser';
import { OutputFormatter } from './formatter';
import { GitExecutor } from '../executor/git-executor';

const program = new Command();

program
  .name('codeloom')
  .description('Architectural linker for AI-generated code: turns diffs into atomic, traceable commits with MBD support')
  .version('0.2.0');

program
  .command('analyze')
  .description('Analyze a diff and produce an atomic commit plan')
  .argument('[diffFile]', 'Path to a unified diff file (or use --stdin / --staged)')
  .option('--stdin', 'Read diff from stdin')
  .option('--staged', 'Read diff from currently staged changes (git diff --cached)')
  .option('-C, --cwd <path>', 'Repository to read --staged from (default: cwd)')
  .option('-m, --manifest <path>', 'Path to MBD manifest YAML for traceability')
  .option('-j, --json', 'Output as JSON instead of formatted text')
  .option('--no-fail', 'Always exit 0 even if critical risks detected')
  .action(async (diffFile, options) => {
    try {
      const diffText = await readDiff(diffFile, options.stdin, options.staged, options.cwd);
      const result = runAnalysis(diffText, options.manifest);
      const formatter = new OutputFormatter();
      if (options.json) { console.log(formatter.formatJson(result)); }
      else { console.log(formatter.formatHuman(result)); }
      if (result.summary.riskDistribution.critical > 0 && options.fail !== false) process.exit(3);
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`Analysis failed: ${(e as Error).message}`));
      if (process.env.CODELOOM_DEBUG) console.error((e as Error).stack);
      process.exit(2);
    }
  });

program
  .command('execute')
  .description('Apply the commit plan as real git commits (V0.2)')
  .argument('[diffFile]', 'Path to a unified diff file (or use --stdin / --staged)')
  .option('--stdin', 'Read diff from stdin')
  .option('--staged', 'Read diff from staged changes and split them into atomic commits')
  .option('-m, --manifest <path>', 'Path to MBD manifest YAML for traceability')
  .option('-C, --cwd <path>', 'Path to the git repository (default: cwd)')
  .option('-b, --branch <name>', 'Create or switch to this branch before committing')
  .option('--dry-run', 'Show what would be committed without touching git')
  .option('--allow-dirty', 'Proceed even if the working tree has unrelated changes')
  .option('--no-rollback', 'Do not roll back on error (debugging)')
  .option('-v, --verbose', 'Verbose output')
  .option('-j, --json', 'Output execution result as JSON')
  .action(async (diffFile, options) => {
    try {
      const diffText = await readDiff(diffFile, options.stdin, options.staged, options.cwd);
      const analysis = runAnalysis(diffText, options.manifest);
      const executor = new GitExecutor({
        cwd: options.cwd ? path.resolve(options.cwd) : process.cwd(),
        verbose: options.verbose,
      });
      const execResult = await executor.execute(analysis, {
        dryRun: options.dryRun,
        branch: options.branch,
        // --staged implies the staged files are "expected" — they ARE the plan.
        allowDirty: options.allowDirty || options.staged,
        unstageFirst: options.staged,
        noRollback: options.rollback === false,
        verbose: options.verbose,
      });
      if (options.json) { console.log(JSON.stringify(execResult, null, 2)); }
      else { printExecutionResult(execResult); }
      if (!execResult.success) process.exit(2);
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`Execution failed: ${(e as Error).message}`));
      if (process.env.CODELOOM_DEBUG) console.error((e as Error).stack);
      process.exit(2);
    }
  });

program
  .command('trace')
  .description('Show the traceability matrix between requirements and code')
  .option('-d, --diff <path>', 'Path to diff file')
  .option('--staged', 'Use staged changes instead of a diff file')
  .option('-C, --cwd <path>', 'Repository to read --staged from (default: cwd)')
  .requiredOption('-m, --manifest <path>', 'Path to MBD manifest YAML')
  .action(async (options) => {
    try {
      if (!options.diff && !options.staged) {
        console.error(chalk.red('Error: provide --diff <path> or --staged'));
        process.exit(1);
      }
      const diffText = options.staged
        ? await readStagedDiff(options.cwd ? path.resolve(options.cwd) : process.cwd())
        : fs.readFileSync(options.diff, 'utf-8');
      const manifest = new ManifestParser().loadFromFile(options.manifest);
      const result = new Analyzer().analyze(diffText, { manifest });
      console.log(chalk.bold.cyan('\n--- Traceability Matrix ---\n'));
      for (const req of manifest.requirements) {
        const hunkIds = result.traceability.requirementToHunks.get(req.id) || [];
        const status = hunkIds.length > 0 ? chalk.green('IMPLEMENTED') : chalk.red('GAP');
        console.log(`${chalk.cyan(req.id)} [${status}] ${req.title}`);
        if (req.description) console.log(chalk.dim(`  ${req.description}`));
        for (const hunkId of hunkIds) {
          const hunk = result.hunks.find(h => h.id === hunkId);
          if (hunk) console.log(chalk.dim(`  -> ${hunkId} ${hunk.filePath}:${hunk.newStart} (${hunk.intent})`));
        }
        console.log('');
      }
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`Trace failed: ${(e as Error).message}`));
      process.exit(2);
    }
  });

async function readDiff(
  diffFile: string | undefined,
  useStdin: boolean,
  useStaged?: boolean,
  cwd?: string
): Promise<string> {
  if (useStaged) return readStagedDiff(cwd ? path.resolve(cwd) : process.cwd());
  if (useStdin) return readStdin();
  if (!diffFile) {
    console.error(chalk.red('Error: provide a diff file path, --stdin, or --staged'));
    process.exit(1);
  }
  if (!fs.existsSync(diffFile)) { console.error(chalk.red(`Error: diff file not found: ${diffFile}`)); process.exit(1); }
  return fs.readFileSync(diffFile, 'utf-8');
}

async function readStagedDiff(cwd: string): Promise<string> {
  const git = simpleGit(cwd);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    console.error(chalk.red(`Error: not a git repository: ${cwd}`));
    process.exit(1);
  }
  const diff = await git.diff(['--cached']);
  if (!diff.trim()) {
    console.error(chalk.red('Error: no staged changes (run `git add` first)'));
    process.exit(1);
  }
  return diff;
}

function runAnalysis(diffText: string, manifestPath: string | undefined) {
  const analyzer = new Analyzer();
  const opts: { manifest?: any } = {};
  if (manifestPath) {
    const resolved = path.resolve(manifestPath);
    if (!fs.existsSync(resolved)) { console.error(chalk.red(`Error: manifest file not found: ${resolved}`)); process.exit(1); }
    opts.manifest = new ManifestParser().loadFromFile(resolved);
  }
  return analyzer.analyze(diffText, opts);
}

function printExecutionResult(r: import('../executor/git-executor').ExecutionResult): void {
  const banner = r.dryRun ? '[DRY RUN]' : r.success ? '[SUCCESS]' : '[FAILED]';
  const colorFn = r.dryRun ? chalk.yellow : r.success ? chalk.green : chalk.red;
  console.log('');
  console.log(colorFn.bold(`${banner} Branch: ${r.branch}`));
  console.log(chalk.dim(`Start: ${r.startSha.slice(0, 7) || '(none)'}${r.endSha ? `  End: ${r.endSha.slice(0, 7)}` : ''}`));
  console.log('');
  for (const c of r.commits) {
    const tag = r.dryRun ? chalk.yellow('would commit') : chalk.green(c.sha.slice(0, 7));
    console.log(`  ${tag}  ${c.title}`);
    if (c.tracesTo.length > 0) console.log(chalk.dim(`         Traces: ${c.tracesTo.join(', ')}`));
    if (c.files.length > 0) console.log(chalk.dim(`         Files:  ${c.files.join(', ')}`));
  }
  if (!r.success) {
    console.log('');
    console.log(chalk.red(`Error: ${r.error}`));
    if (r.rolledBack) console.log(chalk.yellow(`Rolled back to ${r.startSha.slice(0, 7)}`));
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

program.parse();
