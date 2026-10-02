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


## Read-only stock analysis

The stock detail has diagnosis, root/buy-half-wave, candle balance (전쟁), and
paper-account views. The `view` and `tf` query parameters preserve the stock,
list filter and back route. Changing these controls replaces the current history
entry and preserves reading position; it never selects another account or lot.
Closed-account details link explicitly to *current* analysis, not to an assumed
historical diagnosis.

`stock-analysis-v1` is optional for older snapshots. Each analysis must share the
watchlist timestamp and observed price. Daily diagnostic levels use the original
80-day calculation including the current observed candle. Completed-candle
analysis excludes the current day, ISO week and month. Weekly/monthly candles
aggregate the same collected daily source and are not claimed to match a
separate timeframe feed.

Roots require a confirmation candle. A completed close at/below the fixed root
reference invalidates a root. Buy half-wave selection requires three completed
bars after its peak, and a completed low at/below its midpoint invalidates it.
This is the received high/low half-wave model; the missing root-linked VWAP
shrink/residual generator is not approximated. Sell-wave guidance is withheld.
The war ratio is surviving candle-character volume, not actual investor flow,
a whale cost basis or a win rate. One-sided data has no invented midpoint.

Only windows used by each timeframe are checked. Zero O/H/L, positive carried
close and zero volume records are omitted from completed-chart aggregation;
prices and the paper engine are never repaired. Invalid frame bounds show that
frame as unavailable while a verified current diagnosis remains usable.
Invalid payload refreshes leave the last verified account/watchlist pair intact.

Validation: `node --test tests/*.test.js`. The tests include all actual stock/view/
timeframe combinations, numeric boundaries, bad refresh rejection, zero/one-sided
war states, history/reading-position restoration and unchanged source values.
This is a static Site with no compatible managed browser preview; this change was
checked through executed UI rendering and navigation tests, not browser screenshots.
