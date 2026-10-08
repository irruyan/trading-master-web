const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const code = fs.readFileSync(new URL('../dist/sw.js', 'file://' + __filename), 'utf8');

function runtime({ failInstall = false } = {}) {
  const events = new Map(), stored = new Map(), puts = [], deleted = [], network = [];
  let claimed = false, skipped = false;
  const cache = { async addAll(urls) { if (failInstall) throw Error('asset missing'); for (const url of urls) stored.set(url, { cached: true }); },
    async match(key) { return stored.get(key); }, async put(key, value) { puts.push(key); stored.set(key, value); } };
  const self = { registration: { scope: 'https://app.example/tm/' }, addEventListener(type, fn) { events.set(type, fn); },
    clients: { async claim() { claimed = true; } }, skipWaiting() { skipped = true; } };
  const context = { URL, self, caches: { async open() { return cache; }, async keys() { return ['tm-shell-v17', 'tm-shell-20261008-members-1', 'other-app-cache']; }, async delete(key) { deleted.push(key); } },
    fetch: async request => { network.push(request.url); return { ok: true, type: 'basic', clone() { return this; } }; } };
  vm.runInNewContext(code, context);
  function fetchEvent(url, method = 'GET', mode = 'cors') {
    let response;
    events.get('fetch')({ request: { url, method, mode }, respondWith(value) { response = value; } });
    return response;
  }
  async function lifecycle(type) { let pending; events.get(type)({ waitUntil(value) { pending = value; } }); await pending; }
  return { events, context, stored, puts, deleted, network, fetchEvent, lifecycle,
    get claimed() { return claimed; }, get skipped() { return skipped; } };
}

test('offline navigation and styles use the complete cached app shell, including nested paths', async () => {
  const r = runtime();
  await r.lifecycle('install');
  r.context.fetch = async () => { throw Error('offline'); };
  assert.equal((await r.fetchEvent('https://app.example/tm/?source=home', 'GET', 'navigate')).cached, true);
  assert.equal((await r.fetchEvent('https://app.example/tm/app.css')).cached, true);
  assert.equal((await r.fetchEvent('https://app.example/tm/app-runtime.js')).cached, true);
  assert.equal((await r.fetchEvent('https://app.example/tm/member-runtime.js')).cached, true);
  assert.equal((await r.fetchEvent('https://app.example/tm/icons/apple-touch-icon.png')).cached, true);
});

test('snapshots, prices, third-party requests and writes are never intercepted or cached', () => {
  const r = runtime();
  for (const url of ['https://app.example/tm/api/v2-portfolio.json', 'https://app.example/api/quotes',
    'https://app.example/tm/global/api/quotes', 'https://raw.githubusercontent.com/owner/data/main/v2-snapshot.json',
    'https://app.example/tm/private-profile', 'https://app.example/tm/api/auth/session',
    'https://app.example/tm/api/members/me', 'https://app.example/tm/app.css?token=private']) {
    assert.equal(r.fetchEvent(url), undefined, url);
  }
  assert.equal(r.fetchEvent('https://app.example/tm/index.html', 'POST'), undefined);
  assert.deepEqual(r.puts, []);
});

test('activation deletes only this app cache and keeps other application data', async () => {
  const r = runtime();
  await r.lifecycle('activate');
  assert.deepEqual(r.deleted, ['tm-shell-v17']);
  assert.equal(r.claimed, true);
});

test('a missing installation asset rejects the new worker instead of activating a broken shell', async () => {
  const r = runtime({ failInstall: true });
  await assert.rejects(r.lifecycle('install'), /asset missing/);
  assert.equal(r.skipped, false);
});

test('install does not force a running app to reload; update is activated by an explicit message', async () => {
  const r = runtime();
  await r.lifecycle('install');
  assert.equal(r.skipped, false);
  r.events.get('message')({ data: { type: 'unknown' } });
  assert.equal(r.skipped, false);
  r.events.get('message')({ data: { type: 'SKIP_WAITING' } });
  assert.equal(r.skipped, true);
});

test('a failed static response is not saved as the next offline screen', async () => {
  const r = runtime();
  r.context.fetch = async () => ({ ok: false, status: 503, type: 'basic', clone() { return this; } });
  assert.equal((await r.fetchEvent('https://app.example/tm/index.html', 'GET', 'navigate')).status, 503);
  assert.deepEqual(r.puts, []);
});
