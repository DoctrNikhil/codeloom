import chalk from 'chalk';
import { AnalysisResult, PlannedCommit, AnnotatedHunk } from '../types';

export class OutputFormatter {
  formatHuman(result: AnalysisResult): string {
    const lines: string[] = [];
    const { summary } = result;

    lines.push('');
    lines.push(chalk.bold.cyan('━━━ CodeLoom Analysis ━━━'));
    lines.push('');
    lines.push(chalk.bold('Summary'));
    lines.push(`  Hunks analyzed:      ${summary.totalHunks}`);
    lines.push(`  Commits planned:     ${summary.totalCommits}`);

    const r = summary.riskDistribution;
    const riskParts = [
      r.critical > 0 ? chalk.red(`${r.critical} critical`) : null,
      r.medium > 0 ? chalk.yellow(`${r.medium} medium`) : null,
      r.low > 0 ? chalk.green(`${r.low} low`) : null,
    ].filter(Boolean);
    lines.push(`  Risk distribution:   ${riskParts.join(', ')}`);

    const i = summary.intentDistribution;
    const intentParts = (Object.entries(i) as [string, number][])
      .filter(([, count]) => count > 0)
      .map(([intent, count]) => `${count} ${intent}`);
    lines.push(`  Intent distribution: ${intentParts.join(', ')}`);

    if (summary.requirementsTotal > 0) {
      const pct = Math.round((summary.requirementsCovered / summary.requirementsTotal) * 100);
      lines.push(`  Requirement coverage: ${summary.requirementsCovered}/${summary.requirementsTotal} (${pct}%)`);
      if (summary.gaps.length > 0) {
        lines.push(chalk.yellow(`  Gaps (no code):      ${summary.gaps.join(', ')}`));
      }
    }

    lines.push('');
    lines.push(chalk.bold('Commit plan'));
    lines.push(chalk.dim('  (commits are ordered; each is atomic and dependency-safe)'));
    lines.push('');

    for (const commit of result.commits) {
      lines.push(this.formatCommitLine(commit));
    }

    lines.push('');
    lines.push(chalk.bold('Hunk details'));
    lines.push('');
    for (const hunk of result.hunks) {
      lines.push(this.formatHunkDetail(hunk));
    }

    return lines.join('\n');
  }

  private formatCommitLine(commit: PlannedCommit): string {
    const riskColor = commit.risk === 'critical' ? chalk.red : commit.risk === 'medium' ? chalk.yellow : chalk.green;
    const riskBadge = riskColor(commit.risk.slice(0, 4).toUpperCase().padEnd(4));
    const files = Array.from(new Set(commit.hunks.map(h => h.filePath)));
    const depStr = commit.dependsOn.length > 0 ? chalk.dim(`\n        depends on: ${commit.dependsOn.join(', ')}`) : '';
    return [
      `  ${chalk.bold(`#${commit.order + 1}`)}  ${riskBadge}   ${chalk.cyan(commit.intent.padEnd(10))}  ${commit.title}`,
      depStr,
      chalk.dim(`        files (${files.length}): ${files.join(', ')}`),
      commit.tracesTo.length > 0 ? chalk.dim(`        traces to: ${commit.tracesTo.join(', ')}`) : '',
      '',
    ].filter(l => l !== undefined).join('\n');
  }

  private formatHunkDetail(hunk: AnnotatedHunk): string {
    const riskColor = hunk.risk === 'critical' ? chalk.red : hunk.risk === 'medium' ? chalk.yellow : chalk.green;
    const confPct = Math.round(hunk.confidence * 100);
    const lines = [
      `  ${chalk.bold(hunk.id)}  ${riskColor(hunk.risk.slice(0, 4).toUpperCase().padEnd(4))}   ${chalk.cyan(hunk.intent.padEnd(10))}  ${hunk.filePath}:${hunk.newStart}`,
      chalk.dim(`        ${hunk.description} · confidence ${confPct}%`),
    ];
    if (hunk.definedSymbols.length > 0) {
      const syms = hunk.definedSymbols.slice(0, 5).map(s => `${s.kind}:${s.name}`).join(', ');
      lines.push(chalk.dim(`        defines: ${syms}${hunk.definedSymbols.length > 5 ? '...' : ''}`));
    }
    if (hunk.dependsOn.length > 0) lines.push(chalk.dim(`        depends on: ${hunk.dependsOn.join(', ')}`));
    if (hunk.tracesTo.length > 0) lines.push(chalk.dim(`        traces to: ${hunk.tracesTo.join(', ')}`));
    lines.push('');
    return lines.join('\n');
  }

  formatJson(result: AnalysisResult): string {
    const serializable = {
      ...result,
      traceability: {
        requirementToHunks: Object.fromEntries(result.traceability.requirementToHunks),
        hunkToRequirements: Object.fromEntries(result.traceability.hunkToRequirements),
        uncoveredRequirements: result.traceability.uncoveredRequirements,
        untraceableHunks: result.traceability.untraceableHunks,
      },
    };
    return JSON.stringify(serializable, null, 2);
  }
}
