// Set apiOrigin to the public backend origin when it is ready.
// The UI will prefer /api/v2/snapshot and automatically fall back to the bundled snapshot.
window.TRADING_MASTER_CONFIG = Object.freeze({
  snapshotUrl: 'https://raw.githubusercontent.com/irruyan/trading-master-data/main/v2-snapshot.json',
  apiOrigin: '',
  snapshotPath: '/api/v2/snapshot',
  timeoutMs: 3500,
  refreshMs: 300000,
  retryMs: 60000
});
