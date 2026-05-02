import { Hunk, Symbol } from '../types';

export class SymbolAnalyzer {
  analyze(hunk: Hunk): { defined: Symbol[]; referenced: Symbol[]; addedImports: string[] } {
    const defined: Symbol[] = [];
    const referenced: Symbol[] = [];
    const addedImports: string[] = [];

    hunk.addedLines.forEach((line, idx) => {
      const lineNum = hunk.newStart + idx;

      const importMatch = line.match(/^\s*import\s+(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const source = importMatch[4];
        addedImports.push(source);
        if (importMatch[1]) {
          importMatch[1].split(',').forEach(name => {
            const cleanName = name.trim().split(/\s+as\s+/)[0].trim();
            if (cleanName) defined.push({ name: cleanName, kind: 'import', line: lineNum });
          });
        } else if (importMatch[2]) {
          defined.push({ name: importMatch[2], kind: 'import', line: lineNum });
        } else if (importMatch[3]) {
          defined.push({ name: importMatch[3], kind: 'import', line: lineNum });
        }
        return;
      }

      const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fnMatch) defined.push({ name: fnMatch[1], kind: 'function', line: lineNum });

      const arrowFnMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=].*?(?:=>|function)/);
      if (arrowFnMatch && !fnMatch) defined.push({ name: arrowFnMatch[1], kind: 'function', line: lineNum });

      const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) defined.push({ name: classMatch[1], kind: 'class', line: lineNum });

      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) defined.push({ name: interfaceMatch[1], kind: 'interface', line: lineNum });

      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
      if (typeMatch) defined.push({ name: typeMatch[1], kind: 'type', line: lineNum });

      const constMatch = line.match(/^export\s+(?:const|enum)\s+(\w+)/);
      if (constMatch) defined.push({ name: constMatch[1], kind: 'const', line: lineNum });
    });

    const definedNames = new Set(defined.map(s => s.name));

    hunk.addedLines.forEach((line, idx) => {
      const lineNum = hunk.newStart + idx;

      const callPattern = /\b([A-Z][a-zA-Z0-9_]*|[a-z_][a-zA-Z0-9_]*)\s*\(/g;
      let match;
      while ((match = callPattern.exec(line)) !== null) {
        const name = match[1];
        if (this.isKeyword(name) || definedNames.has(name)) continue;
        referenced.push({ name, kind: 'function', line: lineNum });
      }

      const typePattern = /(?::\s*|extends\s+|implements\s+|<\s*)([A-Z][a-zA-Z0-9_]*)/g;
      while ((match = typePattern.exec(line)) !== null) {
        const name = match[1];
        if (this.isKeyword(name) || definedNames.has(name)) continue;
        referenced.push({ name, kind: 'type', line: lineNum });
      }
    });

    return { defined, referenced: this.deduplicateSymbols(referenced), addedImports };
  }

  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'interface', 'type', 'const', 'let', 'var',
      'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'typeof',
      'instanceof', 'in', 'of', 'await', 'async', 'yield', 'export', 'import',
      'from', 'as', 'default', 'extends', 'implements', 'public', 'private',
      'protected', 'static', 'readonly', 'abstract', 'enum',
      'String', 'Number', 'Boolean', 'Array', 'Object', 'Function', 'Promise',
      'Map', 'Set', 'Date', 'Error', 'RegExp', 'JSON', 'Math', 'console',
      'undefined', 'null', 'true', 'false', 'void', 'any', 'unknown', 'never',
      'window', 'document', 'process', 'require', 'module', 'exports',
    ]);
    return keywords.has(name);
  }

  private deduplicateSymbols(symbols: Symbol[]): Symbol[] {
    const seen = new Map<string, Symbol>();
    for (const sym of symbols) {
      const key = `${sym.name}:${sym.kind}`;
      if (!seen.has(key)) seen.set(key, sym);
    }
    return Array.from(seen.values());
  }
}
