const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'site');
fs.mkdirSync(path.join(output, 'api'), { recursive: true });
// Publish only the improved UI and its required data/assets. Keep legacy files locally.
for (const file of ['index.html', 'runtime-config.js', 'manifest.json', 'icon.svg', 'sw.js', 'api/v2-portfolio.json']) {
  fs.copyFileSync(path.join(root, 'dist', file), path.join(output, file));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Static artifact ready: build/site');
