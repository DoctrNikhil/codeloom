// Helper: apply a unified diff (additions only) to disk.
const fs = require('fs');
const path = require('path');

const diff = fs.readFileSync(process.argv[2], 'utf-8');
const target = process.argv[3];

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
  const added = [];
  while (i < lines.length) {
    if (lines[i].startsWith('diff --git ')) break;
    if (lines[i].startsWith('+') && !lines[i].startsWith('+++')) {
      added.push(lines[i].substring(1));
    }
    i++;
  }
  const abs = path.join(target, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (isNew) {
    fs.writeFileSync(abs, added.join('\n') + '\n');
  } else if (fs.existsSync(abs)) {
    fs.appendFileSync(abs, added.join('\n') + '\n');
  } else {
    fs.writeFileSync(abs, added.join('\n') + '\n');
  }
  console.log('wrote', filePath);
}
