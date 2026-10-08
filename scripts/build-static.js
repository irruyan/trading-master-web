const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'site');
// Rebuild the generated artifact so old UI/data files cannot remain in a later upload.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'api'), { recursive: true });
fs.mkdirSync(path.join(output, 'icons'), { recursive: true });
// Publish only the improved UI and its required data/assets. Keep legacy files locally.
for (const file of ['index.html', 'app.css', 'app-runtime.js', 'member-runtime.js', 'runtime-config.js', 'manifest.json', 'icon.svg', 'sw.js',
                    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'api/v2-portfolio.json']) {
  fs.copyFileSync(path.join(root, 'dist', file), path.join(output, file));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Static artifact ready: build/site');
