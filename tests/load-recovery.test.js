const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync(new URL('../dist/index.html', 'file://' + __filename), 'utf8');
const code = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace("window.addEventListener('hashchange',render);loadData();", '');
const payload = JSON.parse(fs.readFileSync(new URL('../dist/api/v2-portfolio.json', 'file://' + __filename)));

function runtime(fetcher) {
  const elements = new Map(), calls = [], timers = new Map();
  let timerId = 0;
  function el(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { innerHTML: '', textContent: '', classes,
        classList: { toggle(key, yes) { yes ? classes.add(key) : classes.delete(key); }, add(key) { classes.add(key); }, remove(key) { classes.delete(key); } },
        setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; } });
    }
    return elements.get(id);
  }
  const context = { payload, console, AbortController, URLSearchParams, navigator: { onLine: true }, location: { hash: '#/' },
    document: { hidden: false, getElementById: el, querySelector() { return el('status'); } },
    window: { TRADING_MASTER_CONFIG: { snapshotUrl: 'https://feed.example/snapshot.json', timeoutMs: 3500, refreshMs: 300000, retryMs: 60000 }, addEventListener() {}, scrollTo() {} },
    fetch: async url => { calls.push(url); return fetcher(url); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, calls, timers, el, run(value) { return vm.runInContext(value, context); } };
}
const response = data => ({ ok: true, json: async () => data });

test('concurrent foreground and manual refresh share one network request', async () => {
  let resolve;
  const r = runtime(() => new Promise(done => { resolve = done; }));
  const first = r.run('loadData()'), second = r.run('loadData()');
  assert.equal(first, second);
  assert.equal(r.calls.length, 1);
  resolve(response(payload));
  await first;
  assert.equal(r.run('DATA.meta.generated_at'), payload.portfolio.meta.generated_at);
  assert.equal(r.context.window.TRADING_MASTER_DATA_STATE().loading, false);
});

test('network failure preserves the verified account/watchlist pair without fetching an older fallback', async () => {
  let failed = false;
  const r = runtime(() => { if (failed) throw Error('offline'); return response(payload); });
  await r.run('loadData()');
  const before = r.run('JSON.stringify({DATA,WATCHLIST,REFERENCE_QUOTES})');
  failed = true;
  await r.run('loadData()');
  assert.equal(r.calls.length, 2);
  assert.equal(r.run('JSON.stringify({DATA,WATCHLIST,REFERENCE_QUOTES})'), before);
  assert.equal(r.context.window.TRADING_MASTER_DATA_STATE().refreshFailed, true);
  assert.equal(r.el('status').classes.has('live'), false);
  assert.equal(r.el('status-tag').textContent, '연결 재시도');
  failed = false;
  await r.run('loadData()');
  assert.equal(r.context.window.TRADING_MASTER_DATA_STATE().refreshFailed, false);
  assert.equal(r.el('status').classes.has('live'), true);
});

test('older remote records never replace the current pair or appear as a successful latest refresh', async () => {
  const newer = structuredClone(payload);
  newer.portfolio.meta.generated_at = '2026-10-07 13:20:56';
  newer.watchlist.generated_at = newer.portfolio.meta.generated_at;
  for (const row of newer.watchlist.items) {
    if (row.analysis) row.analysis.generated_at = newer.watchlist.generated_at;
    if (row.analysis?.diagnosis) row.analysis.diagnosis.generated_at = newer.watchlist.generated_at;
  }
  let data = newer;
  const r = runtime(() => response(data));
  await r.run('loadData()');
  const before = r.run('JSON.stringify({DATA,WATCHLIST})');
  data = payload;
  await r.run('loadData()');
  assert.equal(r.run('JSON.stringify({DATA,WATCHLIST})'), before);
  assert.equal(r.context.window.TRADING_MASTER_DATA_STATE().awaitingNewData, true);
  assert.equal(r.el('status-tag').textContent, '최신 데이터 대기');
  assert.equal(r.el('status').classes.has('live'), false);
});

test('background timer does not fetch while hidden; foreground refresh remains available', async () => {
  const r = runtime(() => response(payload));
  await r.run('loadData()');
  const refresh = [...r.timers.values()].find(timer => timer.delay === 300000);
  r.context.document.hidden = true;
  refresh.fn();
  assert.equal(r.calls.length, 1);
  r.context.document.hidden = false;
  await r.context.window.TRADING_MASTER_REFRESH();
  assert.equal(r.calls.length, 2);
});

test('member mode cannot load account data before authentication or after logout', async () => {
  const r = runtime(() => response(payload));
  r.context.window.TRADING_MASTER_CONFIG.membersEnabled = true;
  let allowed = false;
  r.context.window.TRADING_MASTER_MEMBERS = { canRead: () => allowed, render: () => !allowed };
  await r.context.window.TRADING_MASTER_REFRESH();
  assert.equal(r.calls.length, 0);
  allowed = true;
  await r.context.window.TRADING_MASTER_REFRESH();
  assert.equal(r.run('DATA !== null'), true);
  allowed = false;
  r.context.window.TRADING_MASTER_CLEAR_DATA();
  await r.context.window.TRADING_MASTER_REFRESH();
  assert.equal(r.calls.length, 1);
  assert.equal(r.run('DATA === null && WATCHLIST === null'), true);
});

test('an in-flight financial response cannot repopulate data after logout', async () => {
  let finish, allowed = true;
  const r = runtime(() => new Promise(resolve => { finish = resolve; }));
  r.context.window.TRADING_MASTER_CONFIG.membersEnabled = true;
  r.context.window.TRADING_MASTER_MEMBERS = { canRead: () => allowed, render: () => !allowed };
  const pending = r.context.window.TRADING_MASTER_REFRESH();
  allowed = false;
  r.context.window.TRADING_MASTER_CLEAR_DATA();
  finish(response(payload));
  await pending;
  assert.equal(r.run('DATA === null && WATCHLIST === null'), true);
  assert.equal(r.run('REFERENCE_QUOTES && Object.keys(REFERENCE_QUOTES).length'), 0);
});
