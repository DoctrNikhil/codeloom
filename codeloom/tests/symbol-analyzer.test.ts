import { SymbolAnalyzer } from '../src/analyzer/symbol-analyzer';
import { Hunk } from '../src/types';

function makeHunk(addedLines: string[]): Hunk {
  return {
    id: 'h1', filePath: 'x.ts', oldStart: 0, oldLines: 0, newStart: 1,
    newLines: addedLines.length, header: '@@ -0,0 +1,N @@',
    rawContent: addedLines.map(l => '+' + l).join('\n'),
    addedLines, removedLines: [], contextLines: [], changeType: 'added',
  };
}

describe('SymbolAnalyzer', () => {
  const sa = new SymbolAnalyzer();

  it('detects function declarations', () => {
    const r = sa.analyze(makeHunk(['export function hashPassword(p: string) {']));
    expect(r.defined.find(s => s.name === 'hashPassword' && s.kind === 'function')).toBeTruthy();
  });

  it('detects classes', () => {
    const r = sa.analyze(makeHunk(['export class AuthService extends Base {']));
    expect(r.defined.find(s => s.name === 'AuthService' && s.kind === 'class')).toBeTruthy();
  });

  it('detects interfaces and types', () => {
    const r = sa.analyze(makeHunk(['export interface User { id: string }', 'export type UserId = string;']));
    expect(r.defined.find(s => s.name === 'User' && s.kind === 'interface')).toBeTruthy();
    expect(r.defined.find(s => s.name === 'UserId' && s.kind === 'type')).toBeTruthy();
  });

  it('detects named imports', () => {
    const r = sa.analyze(makeHunk(["import { hash, compare } from 'bcrypt';"]));
    expect(r.addedImports).toContain('bcrypt');
    expect(r.defined.find(s => s.name === 'hash')).toBeTruthy();
    expect(r.defined.find(s => s.name === 'compare')).toBeTruthy();
  });

  it('detects symbol references via type annotations', () => {
    const r = sa.analyze(makeHunk(['function login(user: User): Token {', '  return new Token();', '}']));
    const refNames = r.referenced.map(s => s.name);
    expect(refNames).toContain('User');
    expect(refNames).toContain('Token');
  });

  it('does not flag language keywords as references', () => {
    const r = sa.analyze(makeHunk(['if (x) { return; }', 'for (let i = 0; i < 10; i++) {}']));
    const names = r.referenced.map(s => s.name);
    expect(names).not.toContain('if');
    expect(names).not.toContain('for');
    expect(names).not.toContain('return');
  });

  it('does not list a symbol as referenced if defined in same hunk', () => {
    const r = sa.analyze(makeHunk(['function helper() { return 1; }', 'function caller() { return helper(); }']));
    expect(r.referenced.find(s => s.name === 'helper')).toBeFalsy();
  });

  it('deduplicates repeated references', () => {
    const r = sa.analyze(makeHunk(['doSomething();', 'doSomething();', 'doSomething();']));
    expect(r.referenced.filter(s => s.name === 'doSomething').length).toBe(1);
  });
});
