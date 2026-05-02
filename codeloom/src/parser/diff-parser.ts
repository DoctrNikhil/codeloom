import { Hunk, ChangeType } from '../types';

export class DiffParser {
  private hunkCounter = 0;

  parse(diffText: string): Hunk[] {
    const hunks: Hunk[] = [];
    const fileBlocks = this.splitByFile(diffText);
    for (const block of fileBlocks) {
      hunks.push(...this.parseFileBlock(block));
    }
    return hunks;
  }

  private splitByFile(diffText: string): string[] {
    const lines = diffText.split('\n');
    const blocks: string[] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git ') && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) blocks.push(currentBlock.join('\n'));
    return blocks.filter(b => b.includes('@@'));
  }

  private parseFileBlock(block: string): Hunk[] {
    const lines = block.split('\n');
    const filePath = this.extractFilePath(lines);
    const changeType = this.detectChangeType(lines);
    const hunks: Hunk[] = [];

    let currentHunk: Partial<Hunk> | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (currentHunk) {
          this.finalizeHunk(currentHunk, currentContent, filePath, changeType);
          hunks.push(currentHunk as Hunk);
        }
        const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (!match) continue;
        currentHunk = {
          id: `hunk_${++this.hunkCounter}`,
          filePath,
          oldStart: parseInt(match[1], 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3], 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          header: line,
          changeType,
        };
        currentContent = [];
      } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        currentContent.push(line);
      }
    }

    if (currentHunk) {
      this.finalizeHunk(currentHunk, currentContent, filePath, changeType);
      hunks.push(currentHunk as Hunk);
    }
    return hunks;
  }

  private extractFilePath(lines: string[]): string {
    for (const line of lines) {
      if (line.startsWith('+++ b/')) return line.substring(6).trim();
      if (line.startsWith('+++ ') && !line.includes('/dev/null')) return line.substring(4).trim();
    }
    for (const line of lines) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) return match[2];
    }
    return 'unknown';
  }

  private detectChangeType(lines: string[]): ChangeType {
    for (const line of lines) {
      if (line.startsWith('new file mode')) return 'added';
      if (line.startsWith('deleted file mode')) return 'removed';
      if (line.startsWith('--- /dev/null')) return 'added';
      if (line.startsWith('+++ /dev/null')) return 'removed';
    }
    return 'modified';
  }

  private finalizeHunk(hunk: Partial<Hunk>, content: string[], _fp: string, _ct: ChangeType): void {
    hunk.rawContent = content.join('\n');
    hunk.addedLines = content.filter(l => l.startsWith('+')).map(l => l.substring(1));
    hunk.removedLines = content.filter(l => l.startsWith('-')).map(l => l.substring(1));
    hunk.contextLines = content.filter(l => l.startsWith(' ')).map(l => l.substring(1));
  }
}
