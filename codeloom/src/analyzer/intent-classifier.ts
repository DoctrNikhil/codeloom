import { Hunk, IntentCategory, RiskLevel, Symbol } from '../types';

interface ClassifyContext {
  hunk: Hunk;
  definedSymbols: Symbol[];
  referencedSymbols: Symbol[];
  addedImports: string[];
}

export class IntentClassifier {
  classifyIntent(ctx: ClassifyContext): { intent: IntentCategory; confidence: number } {
    const { hunk, definedSymbols, addedImports } = ctx;
    const content = [...hunk.addedLines, ...hunk.removedLines].join('\n').toLowerCase();
    const filePath = hunk.filePath.toLowerCase();

    let score = 0;
    let intent: IntentCategory = 'unknown';

    // Security
    const securityPatterns = ['auth', 'password', 'encrypt', 'decrypt', 'token', 'jwt', 'csrf', 'xss', 'sql', 'hash', 'salt', 'bcrypt', 'secret', 'apikey', 'oauth'];
    const securityScore = securityPatterns.filter(p => content.includes(p) || filePath.includes(p)).length;
    if (securityScore >= 2 || (securityScore >= 1 && (filePath.includes('/auth') || filePath.includes('/security')))) {
      intent = 'security'; score = securityScore * 3;
    }

    // Test
    const testPatterns = ['describe(', 'it(', 'test(', 'expect(', 'jest', 'mocha', 'vitest', 'beforeeach', 'aftereach', 'beforeall', 'afterall'];
    const testScore = testPatterns.filter(p => content.includes(p)).length;
    const isTestFile = /\.(test|spec)\.(ts|js)$/.test(filePath) || filePath.includes('/__tests__/') || filePath.startsWith('tests/') || filePath.startsWith('test/');
    if (isTestFile || testScore >= 2) {
      if (testScore * 2 > score) { intent = 'test'; score = testScore * 2; }
    }

    // Docs
    const isDocFile = /\.(md|mdx)$/.test(filePath) || filePath.includes('/docs/') || filePath.toLowerCase().includes('readme') || filePath.toLowerCase().includes('changelog');
    if (isDocFile) {
      if (10 > score) { intent = 'docs'; score = 10; }
    }

    // Config
    const isConfigFile = /\.(json|yaml|yml|toml|env|ini)$/.test(filePath) || filePath.includes('package.json') || filePath.includes('tsconfig') || filePath.includes('dockerfile') || filePath.includes('.github/');
    if (isConfigFile) {
      if (8 > score) { intent = 'config'; score = 8; }
    }

    // Bugfix
    const bugPatterns = ['fix', 'bug', 'crash', 'error', 'null check', 'undefined', 'race condition', 'off by one'];
    const bugScore = bugPatterns.filter(p => content.includes(p)).length;
    if (bugScore >= 1 && bugScore * 2 > score) { intent = 'bugfix'; score = bugScore * 2; }

    // Refactor
    const refactorPatterns = ['rename', 'extract', 'simplify', 'optimize', 'consolidate', 'deduplicate', 'restructure', 'reorganize'];
    const refactorScore = refactorPatterns.filter(p => content.includes(p)).length;
    if (refactorScore >= 1 && refactorScore * 2 > score) { intent = 'refactor'; score = refactorScore * 2; }

    // Style
    const isStyleFile = /\.(css|scss|less|sass)$/.test(filePath) || filePath.includes('prettier') || filePath.includes('eslint') || filePath.includes('.stylelint');
    if (isStyleFile && 7 > score) { intent = 'style'; score = 7; }

    // Feature (default when new symbols added)
    if (intent === 'unknown' && definedSymbols.length > 0) {
      intent = 'feature'; score = definedSymbols.length;
    }

    // Boost from imports
    if (addedImports.some(i => ['bcrypt', 'jsonwebtoken', 'crypto', 'argon2'].includes(i))) {
      if (intent !== 'security') { intent = 'security'; score += 5; }
    }

    const confidence = Math.min(0.95, 0.5 + score / 20);
    return { intent, confidence };
  }

  classifyRisk(ctx: ClassifyContext): RiskLevel {
    const { hunk } = ctx;
    const filePath = hunk.filePath.toLowerCase();
    const content = [...hunk.addedLines, ...hunk.removedLines].join('\n').toLowerCase();

    // File-type caps: tests/docs/styles → LOW unless critical patterns hit
    const isSafeFile = /\.(test|spec)\.(ts|js)$/.test(filePath) || /\.(md|mdx|css|scss)$/.test(filePath) || filePath.startsWith('tests/') || filePath.startsWith('test/');

    // Critical patterns override everything
    const criticalPatterns = ['password', 'auth', 'encrypt', 'decrypt', 'token', 'secret', 'credit.?card', 'pii', 'admin', 'delete', 'drop table', 'migration'];
    const hitsCritical = criticalPatterns.some(p => new RegExp(p).test(content));

    const criticalPaths = ['/auth/', '/security/', '/payment/', '/admin/', '/migration/', '.env', '/config/secrets'];
    const isCriticalPath = criticalPaths.some(p => filePath.includes(p));

    if ((hitsCritical || isCriticalPath) && !isSafeFile) return 'critical';

    const lineCount = hunk.addedLines.length + hunk.removedLines.length;
    if (isSafeFile) return 'low';
    if (lineCount > 50) return 'critical';
    if (lineCount > 10) return 'medium';
    return 'low';
  }

  generateDescription(ctx: ClassifyContext, intent: IntentCategory): string {
    const { hunk } = ctx;
    const verb = this.intentToVerb(intent);
    const fileName = hunk.filePath.split('/').pop() || hunk.filePath;
    const action = hunk.changeType === 'added' ? 'Add' : hunk.changeType === 'removed' ? 'Remove' : verb;
    return `${action} ${fileName}`;
  }

  private intentToVerb(intent: IntentCategory): string {
    const map: Record<IntentCategory, string> = {
      feature: 'Implement', refactor: 'Refactor', bugfix: 'Fix', security: 'Harden',
      test: 'Test', docs: 'Document', config: 'Configure', style: 'Style', unknown: 'Update',
    };
    return map[intent];
  }
}
