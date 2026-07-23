const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') getFiles(filePath, files);
    } else {
      if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
        files.push(filePath);
      }
    }
  }
  return files;
}

const allFiles = getFiles(__dirname);
const map = new Map();

for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf8');
  // Match style="something" or style='something'
  const regex = /style=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    let s = match[1];
    if (!s.startsWith('display:') && !s.includes('${')) {
      map.set(s, (map.get(s) || 0) + 1);
    }
  }
}

const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
for (const [s, count] of sorted) {
  console.log(`${count}x : ${s}`);
}
