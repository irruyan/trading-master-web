const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(new URL('../dist/app-runtime.js', 'file://' + __filename), 'utf8');

function runtime(state, refresh, { standalone = false } = {}) {
  const elements = new Map(), events = new Map(), documentEvents = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', disabled: false,
      classList: { remove() {} }, addEventListener() {}, showModal() {}, close() {} });
    return elements.get(id);
  };
  const window = { matchMedia: () => ({ matches: standalone, addEventListener() {} }),
    TRADING_MASTER_DATA_STATE: () => state, TRADING_MASTER_REFRESH: refresh,
    addEventListener(name, fn) { events.set(name, fn); } };
  const document = { hidden: false, getElementById: el, querySelector: () => el('status'),
    addEventListener(name, fn) { documentEvents.set(name, fn); } };
  vm.runInNewContext(source, { window, document, navigator: { onLine: true }, location: {}, URL });
  return { window, document, elements, events, documentEvents, el };
}

test('reconnect during an in-flight request waits, then performs one fresh check', async () => {
  let finish, newRequests = 0, reused = 0;
  const current = new Promise(resolve => { finish = resolve; });
  const state = { hasData: true, loading: true, generatedAt: '2026-10-06 13:20' };
  const r = runtime(state, () => {
    if (state.loading) { reused++; return current; }
    newRequests++;
    return Promise.resolve();
  });
  for (let n = 0; n < 3; n++) r.events.get('online')();
  assert.equal(reused, 1);
  assert.equal(newRequests, 0);
  state.loading = false;
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(newRequests, 1);
});

test('quick foreground changes do not refetch, but returning after failure retries', () => {
  let calls = 0;
  const state = { hasData: true, loading: false, lastAttemptAt: Date.now(), refreshFailed: false };
  const r = runtime(state, () => { calls++; });
  r.documentEvents.get('visibilitychange')();
  assert.equal(calls, 0);
  state.refreshFailed = true;
  r.documentEvents.get('visibilitychange')();
  assert.equal(calls, 1);
  r.document.hidden = true;
  r.events.get('online')();
  assert.equal(calls, 1);
});

test('an installed standalone window hides the install action', () => {
  const r = runtime({ hasData: false }, () => {}, { standalone: true });
  assert.equal(r.el('app-install').hidden, true);
});
