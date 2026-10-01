# Trading Master Beta

Product UI for the Trading Master beta. Engine formulas remain unchanged; forward and historical performance are separated through the v2 portfolio contract.

## Data source

`dist/runtime-config.js` controls the read-only product data connection. Set `snapshotUrl` to an absolute batch JSON URL, or set `apiOrigin` to the HTTPS origin serving `/api/v2/snapshot`. The UI validates the two-account payload, refreshes live data every five minutes, and falls back to the bundled `dist/api/v2-portfolio.json` snapshot when the remote source is unavailable.

The KRX reference quote object is accepted separately from the engine portfolio and never overwrites engine prices or calculations.

## Interface and navigation

The workspace has overview, KOSPI, KOSDAQ, and combined-performance routes. Desktop navigation stays in a side rail; smaller screens use a fixed bottom navigation.

Holdings and closed transactions link to separate transaction details. Closed lots have stable transaction keys, so a currently held position in the same stock cannot replace the selected closed record. Returning to a list or using browser history restores its tab and reading position. Background data refreshes preserve scroll, expanded explanations, and link focus. Older fallback snapshots do not replace newer displayed data.

Presentation uses `dist/index.html` and `dist/app.css`. The runtime connection and all engine calculations remain unchanged.

Run `node --test tests/data-loader.test.js tests/performance-display.test.js tests/navigation.test.js` for live/fallback loading, financial display, and navigation regression checks.
