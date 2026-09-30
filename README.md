# Trading Master Beta

Product UI for the Trading Master beta. Engine formulas remain unchanged; forward and historical performance are separated through the v2 portfolio contract.

## Data source

`dist/runtime-config.js` controls the read-only product data connection. Set `snapshotUrl` to an absolute batch JSON URL, or set `apiOrigin` to the HTTPS origin serving `/api/v2/snapshot`. The UI validates the two-account payload, refreshes live data every five minutes, and falls back to the bundled `dist/api/v2-portfolio.json` snapshot when the remote source is unavailable.

The KRX reference quote object is accepted separately from the engine portfolio and never overwrites engine prices or calculations.

Run `node tests/data-loader.test.js` to verify both the live response and snapshot fallback paths.

## Local and GitHub Pages

Run `python -m http.server 8780 --directory dist` and open `http://localhost:8780`.
The embedded fallback uses a relative path so the improved UI works both at a
domain root and below `/trading-master-web/`. Navigation uses URL hash routes.
`node scripts/build-static.js` prepares `build/site` with only the improved UI,
required assets, and v2 fallback data. Legacy UI/data and Sites metadata are not
part of the deployment artifact. The original files remain preserved in `dist`.

The configured public JSON belongs to `irruyan/trading-master-data`, branch `main`.
Its current timestamp is shown in the header. Refreshing that JSON is separate
from generating new engine data; KRX credentials and scheduled engine execution
still need configuration. No keys are stored in this frontend repository.
