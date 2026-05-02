import { DiffParser } from '../src/parser/diff-parser';

describe('DiffParser', () => {
  it('parses a single-file added diff', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
new file mode 100644
--- /dev/null
+++ b/src/foo.ts
@@ -0,0 +1,3 @@
+export function foo() {
+  return 1;
+}
`;
    const hunks = new DiffParser().parse(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].filePath).toBe('src/foo.ts');
    expect(hunks[0].changeType).toBe('added');
    expect(hunks[0].addedLines).toEqual(['export function foo() {', '  return 1;', '}']);
    expect(hunks[0].removedLines).toEqual([]);
  });

  it('parses a multi-file diff', () => {
    const diff = `diff --git a/a.ts b/a.ts
new file mode 100644
--- /dev/null
+++ b/a.ts
@@ -0,0 +1,1 @@
+export const a = 1;
diff --git a/b.ts b/b.ts
new file mode 100644
--- /dev/null
+++ b/b.ts
@@ -0,0 +1,1 @@
+export const b = 2;
`;
    const hunks = new DiffParser().parse(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks.map(h => h.filePath).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('parses a modification with adds and removes', () => {
    const diff = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;
    const hunks = new DiffParser().parse(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].changeType).toBe('modified');
    expect(hunks[0].addedLines).toEqual(['const b = 3;', 'const c = 4;']);
    expect(hunks[0].removedLines).toEqual(['const b = 2;']);
  });

  it('parses a deletion', () => {
    const diff = `diff --git a/del.ts b/del.ts
deleted file mode 100644
--- a/del.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line one
-line two
`;
    const hunks = new DiffParser().parse(diff);
    expect(hunks[0].changeType).toBe('removed');
    expect(hunks[0].removedLines).toEqual(['line one', 'line two']);
  });

  it('returns empty array for empty input', () => {
    expect(new DiffParser().parse('')).toEqual([]);
  });

  it('skips text without @@ markers', () => {
    expect(new DiffParser().parse('this is not a diff')).toEqual([]);
  });

  it('handles multiple hunks within one file', () => {
    const diff = `diff --git a/multi.ts b/multi.ts
--- a/multi.ts
+++ b/multi.ts
@@ -1,2 +1,3 @@
 line1
+inserted
 line2
@@ -10,1 +11,2 @@
 line10
+also inserted
`;
    const hunks = new DiffParser().parse(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].addedLines).toEqual(['inserted']);
    expect(hunks[1].addedLines).toEqual(['also inserted']);
  });
});
