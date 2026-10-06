// Read the snapshot published by the engine's scheduled GitHub workflow.
// Keep the bundled snapshot as a fallback when the public feed is unavailable.
window.TRADING_MASTER_CONFIG = Object.freeze({
  snapshotUrl: 'https://raw.githubusercontent.com/irruyan/trading-master-data/main/v2-snapshot.json',
  apiOrigin: '',
  capitalRebaseId: '20261001-opening-100m-50m',
  snapshotPath: '/api/v2/snapshot',
  timeoutMs: 3500,
  refreshMs: 300000,
  retryMs: 60000
});
