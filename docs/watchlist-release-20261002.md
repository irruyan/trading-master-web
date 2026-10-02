# Watchlist release, 2026-10-02

The primary route now shows KOSPI/KOSDAQ watchlists and observed changes. Stocks
have independent selection and paper-holding states. Details expose actual
selection evidence and paper entry/addition/exit plans, including cash limits and
strict raw-price exit comparisons. Overview, accounts and performance remain
available. Filter/sort/list state survives stock and account detail navigation.

The private engine publishes the watchlist and portfolio under one cycle ID.
The frontend rejects mismatches and older fallback data. The bundled fallback
is the validated complete product payload, not an independently calculated list.
History starts with observation on 2026-10-02; baseline selection dates are not
inferred. Weekly/monthly bars include the current incomplete bar. The existing
shared top-60 ranking, strategy, execution window and schedule are preserved.

## Verified release data

- Engine implementation: `bf443fe106762ebd2032d5e90c7997b7b7240a30`.
- Binary-float ceiling boundary validation: `e3f4d777cb2898a7f1ba35d64f9f90c9635c165d`.
- Successful Actions run: `36971390214`; generated 2026-10-02 14:59:47 KST.
- Selected: 14 KOSPI, 26 KOSDAQ. Held: 22 KOSPI, 30 KOSDAQ.
- Initial public observations: 52 records and 4 actual paper-fill events.
- Both markets completed evaluation without scan failures. KRX reference status
  `ok`. Account balances and watchlist identity/price/plan/event checks passed
  against the exact post-refresh private ledger.

## Checks and limits

Engine: 59 tests, including frozen pre-observer updater/scan comparisons.
Frontend: four suites, including 70 real account routes and 70 watchlist views,
closed-lot identity, filter/back links, cycle rejection, freshness and immutable
financial values. `git diff --check` passed.

Browser screenshot QA was unavailable: the local Playwright Chromium executable
was not installed, and this static Site has no managed browser preview server.
No browser screenshot pass is claimed. Layout uses existing desktop/mobile
styles and responsive watchlist/plan rules; device visual review remains open.
