const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(new URL('../dist/index.html', `file://${__filename}`), 'utf8');
const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
const snapshot = JSON.parse(fs.readFileSync(new URL('../dist/api/v2-portfolio.json', `file://${__filename}`)));

async function run({ apiOrigin, snapshotUrl = '', livePayload, liveFails = false, pathname = '/' }) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', classList: { toggle() {}, add() {}, remove() {} } });
    return elements.get(id);
  };
  const status = { classList: { toggle() {}, add() {}, remove() {} } };
  const calls = [];
  const context = {
    console,
    AbortController,
    URLSearchParams,
    location: { hash: '', pathname },
    document: { getElementById: element, querySelector: () => status },
    window: {
      TRADING_MASTER_CONFIG: { apiOrigin, snapshotUrl, snapshotPath: '/api/v2/snapshot', timeoutMs: 50, refreshMs: 999999, retryMs: 999999 },
      addEventListener() {},
      scrollTo() {}
    },
    fetch: async url => {
      calls.push(url);
      if (String(url).includes('/api/v2/snapshot')) {
        if (liveFails) return { ok: false, status: 503 };
        return { ok: true, json: async () => livePayload };
      }
      return { ok: true, json: async () => snapshot };
    },
    setTimeout: () => 1,
    clearTimeout() {}
  };
  context.globalThis = context;
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { calls, statusText: element('header-status').textContent, page: element('app').innerHTML };
}

(async () => {
  const live = await run({ apiOrigin: 'https://api.example.test/', livePayload: { portfolio: snapshot, reference_quotes: { '005930': { close: 100 } } } });
  assert.deepStrictEqual(live.calls, ['https://api.example.test/api/v2/snapshot']);
  assert.match(live.statusText, /^운영 데이터 /);
  assert.match(live.page, /코스피/);

  const batch = await run({ snapshotUrl: 'https://data.example.test/v2-snapshot.json', livePayload: { portfolio: snapshot } });
  assert.deepStrictEqual(batch.calls, ['https://data.example.test/v2-snapshot.json']);
  assert.match(batch.statusText, /^운영 데이터 /);

  const fallback = await run({ apiOrigin: 'https://api.example.test', liveFails: true });
  assert.deepStrictEqual(fallback.calls, ['https://api.example.test/api/v2/snapshot', './api/v2-portfolio.json']);
  assert.match(fallback.statusText, /^스냅샷 /);
  assert.match(fallback.page, /코스닥/);
  const subpath = await run({ apiOrigin: 'https://api.example.test', liveFails: true, pathname: '/trading-master-web/' });
  assert.strictEqual(new URL(subpath.calls[1], 'https://irruyan.github.io/trading-master-web/').pathname, '/trading-master-web/api/v2-portfolio.json');
  assert.match(subpath.page, /코스피/);
  const invalid = await run({ apiOrigin: 'https://api.example.test', livePayload: { accounts: { ks_mid: {} } } });
  assert.match(invalid.statusText, /^스냅샷 /);
  console.log('data loader live/fallback tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
