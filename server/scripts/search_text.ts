import fs from 'fs';
import path from 'path';

function searchInDir(dir: string, terms: string[]) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git')) {
      searchInDir(fullPath, terms);
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const term of terms) {
        if (content.includes(term)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes(term)) {
              console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  }
}

console.log('Searching in src/...');
searchInDir('c:/Users/Ay166/OneDrive/Desktop/kiropro/src', ['موجود', 'مسجل مسبق']);
searchInDir('c:/Users/Ay166/OneDrive/Desktop/kiropro/server/src', ['مسجل مسبقاً']);
