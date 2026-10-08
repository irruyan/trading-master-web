const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');

test('published artifact includes every installed-app asset and excludes old generated files', () => {
  const output = path.join(root, 'build/site');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'legacy.html'), 'old generated page');
  require('../scripts/build-static.js');
  assert.equal(fs.existsSync(path.join(output, 'legacy.html')), false);
  const head = fs.readFileSync(path.join(output, 'index.html'), 'utf8').match(/<head>([\s\S]*?)<\/head>/)[1];
  for (const match of head.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.equal(fs.existsSync(path.join(output, match[1])), true, 'missing HTML asset: ' + match[1]);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const buffer = fs.readFileSync(path.join(output, icon.src));
    const dimension = Number(icon.sizes.split('x')[0]);
    assert.equal(buffer.readUInt32BE(16), dimension);
    assert.equal(buffer.readUInt32BE(20), dimension);
  }
  const apple = fs.readFileSync(path.join(output, 'icons/apple-touch-icon.png'));
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
  assert.equal(fs.readFileSync(path.join(output, 'api/v2-portfolio.json'), 'utf8'),
    fs.readFileSync(path.join(root, 'dist/api/v2-portfolio.json'), 'utf8'), 'packaging must not change financial data');
  assert.equal(fs.readFileSync(path.join(output, 'app.css'), 'utf8'), fs.readFileSync(path.join(root, 'dist/app.css'), 'utf8'));
  const admin = fs.readFileSync(path.join(output, 'admin.html'), 'utf8');
  for (const match of admin.matchAll(/(?:href|src)="([^"#]+\.(?:css|js|svg))"/g)) {
    assert.equal(fs.existsSync(path.join(output, match[1])), true, 'missing admin asset: ' + match[1]);
  }
});
