# Trading Master Beta

Product UI for the Trading Master beta. Engine formulas remain unchanged; forward and historical performance are separated through the v2 portfolio contract.

## Data source

`dist/runtime-config.js` controls the read-only product data connection. Set `snapshotUrl` to an absolute batch JSON URL, or set `apiOrigin` to the HTTPS origin serving `/api/v2/snapshot`. The UI validates the two-account payload, refreshes live data every five minutes, and falls back to the bundled `dist/api/v2-portfolio.json` snapshot when the remote source is unavailable.

The KRX reference quote object is accepted separately from the engine portfolio and never overwrites engine prices or calculations.

## Interface and navigation

The default route is the KOSPI/KOSDAQ watchlist, with independent selection and
paper-holding status, sorting, filters and observed changes. `/watch/{market}/{code}`
contains selection evidence, observed prices, entry ceilings and the actual
paper-account addition/exit rules. It supports stocks without a paper position.
`/overview`, account and combined-performance routes retain the existing reports.
Desktop navigation stays in a side rail; smaller screens use a fixed bottom navigation.

Holdings and closed transactions link to separate transaction details. Closed lots have stable transaction keys, so a currently held position in the same stock cannot replace the selected closed record. Returning to a list or using browser history restores its tab and reading position. Background data refreshes preserve scroll, expanded explanations, and link focus. Older fallback snapshots do not replace newer displayed data.

Presentation uses `dist/index.html` and `dist/app.css`. The runtime connection and
all engine calculations remain unchanged. Watchlist and portfolio timestamps and
cycle IDs must agree; mismatched refreshes are rejected without replacing the
displayed pair. The bundled fallback now contains the full product snapshot.
Candidate history starts at the observer's tracking start, not an inferred past
selection date. Prices are Naver daily observations, not real-time order quotes.

Run `node --test tests/data-loader.test.js tests/performance-display.test.js tests/navigation.test.js tests/watchlist.test.js` for loading, financial display, navigation, same-cycle validation and actual watchlist routes.
