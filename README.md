# Trading Master Beta

## Installed app foundation

The existing product can run as an installable web app. Android Chromium uses the
browser install prompt; iPhone users receive Safari home-screen instructions.
The manifest includes 192/512px PNG icons and a 180px Apple touch icon rendered
from the existing SVG. Standalone mode hides the installation control.

Only static HTML, styling, scripts and icons are stored by the service worker.
Portfolio snapshots, quotes, third-party feeds and account APIs are never cached.
An offline session keeps the already displayed records with their original basis
timestamp; a new offline launch asks for connectivity instead of restoring market
data. Online/foreground events resume loading, concurrent refreshes share one
request, and a failed refresh preserves the verified account/watchlist pair.
A new app version waits for the user to choose Update, then reloads at the same route.

`node scripts/build-static.js` creates a clean `build/site` with the complete app
assets and the unmodified bundled snapshot. Run `node --test tests/*.test.js`.
Optional browser QA uses Python Playwright and local Chromium:
`python tests/browser_app_check.py` after building. Feed responses are intercepted
fixtures and no vendor data API or SMS is called. Browser QA includes nested-path
hosting, installation diagnostics, 320–1280px layouts, offline launch, connection
recovery and user-controlled version updates. This does not install an OS app or
verify Safari on a physical iPhone. Native Android/iOS packages and store release
remain separate work. PNGs are committed; regenerating them uses the optional
`python scripts/render-icons.py` development tool.

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


## Phone membership development

`dist/member-runtime.js` adds the member entrance, phone/password signup and login,
remembered sessions, password recovery, phone changes and the member profile.
Large labels, 54px inputs and password visibility controls simplify mobile entry.
Signup grants membership only; a paid subscription is not automatically created.

The public static configuration keeps `membersEnabled: false`. To preview actual
authentication, build the UI and run the private engine repository's
`services/trading-master-members` loopback runner against `build/site` with explicit
`--mock-sms --members-enabled`. This separate test enables membership in the runtime response and supplies same-origin
HTTP APIs with server-verified HttpOnly session cookies. No real SMS is sent.
`node --test tests/*.test.js` and `python tests/browser_members_check.py` validate
loading gates, replay prevention, UI flows, offline behavior and remembered login.

In member mode the loader waits for authentication, clears in-memory account data
on logout and discards data completing after logout. A background data refresh
preserves the code/password currently being entered. Auth/session/member APIs are
never cached by the service worker; no password or session token is placed in
browser localStorage. Browser startup requires a server session check.

This is an integration preview, not a deployed paid-data gate. Public raw GitHub
and bundled beta snapshots remain public. Real SMS, HTTPS hosting, private paid
feeds/entitlement checks and billing are later work. The development SMS worker
now uses verified member entitlements as its read-only recipient authority.
The member service README records the API, constraints and local launch command.

## Administrator development

`dist/admin.html`, `admin.css` and `admin.js` are the separate member/subscription
administrator interface. The private membership service supplies admin-only
search/list/detail, Korean-day period assignment/extension, pause/stop/resume,
optimistic revision checks and before/after audit. There is no default admin
password or web-accessible role grant; trusted CLI setup is documented privately.

The customer beta remains open: static `membersEnabled:false` is unchanged, and
the local runner now defaults to open beta too. Only explicit `--members-enabled`
enters the separate customer-login test. No admin link or member access restriction
has been added to the beta UI. Production deployment remains pending.

Admin pages/assets/private APIs are not in the app service worker cache. Cookie/CSRF
authentication checks the server admin role; hiding a button is not the permission
check. Late list/detail responses cannot repopulate private UI after logout.
`python tests/browser_admin_check.py` exercises the real local API, ordinary-user
denial, period setup/extension, state changes, competing edits, safe audit rendering,
mobile widths and continuing beta access without login. All members are fictional;
actual SMS/payment and production rollout are not connected.

## Member access display and mock signal delivery

The member profile shows actual product, Korean-calendar period and subscription
status from the member API. Explicit refresh, foreground checks and server-boundary
refreshes reflect admin period/state edits. Subscription updates preserve code/
password input on authentication forms. A late session check cannot restore private
member state after logout. This remains an opt-in membership preview; beta access
is unchanged and the static config stays `membersEnabled:false`.

The private SMS worker's optional `--members-db` connection selects eligible
verified members and checks their access again before claiming/retrying sends.
Pause/resume, expired renewal and changed contacts cannot release old queued
messages. An active extension keeps a valid pending message. Member DB outages
hold sends, without falling back to copied entitlements. Only confirmed trades
enter the mock signal outbox. No real provider, payment or trading-rule changes.

`python tests/browser_entitlements_check.py` verifies admin edits, customer status,
mock recipients, changed numbers, preserved verification forms, expiry, late
session responses, responsive layout and absence of cached private data.

## Large-volume administrator message history

The separate `admin.html#messaging` tab uses the authenticated member runner with
explicit `--sms-db` to read signal groups and individual recipient records. A
signal can have thousands of recipients while occupying one row. Clicking its
problem count/action opens matching failed/unknown records. Date/stock/phone or
member/status/action filters, last-four-digit search, 50/100/200-item pages,
first/previous/next/last controls and detail/attempt modals make records searchable.
Phone lists are masked; authorized single details show the original recipient.

Paging uses server-side signed cursors and anchors new rows until refresh; it
never downloads the entire outbox or runs deep OFFSET in the browser. Summary
counts use date/stock/recipient/signal filters; status narrows the list. Accepted
and delivered remain separate. Modal closure preserves filters; cancelled/older
queries and late responses after logout cannot replace current/private views.
A failed query explicitly marks the previous result. Desktop has a compact table;
mobile shows cards with visible count/status labels. Admin assets/APIs stay out
of PWA caching. The beta remains open and has no administrator link/login gate.

`python tests/browser_messaging_check.py` seeds 500,000 fictional deliveries in
200 groups and checks actual HTTP/UI search, paging, source failure, safe detail
rendering, private data removal, new-record anchors and six responsive widths.
Server tests measure roughly 0.1–0.6 seconds per large query on this development
executor; this is not a production performance promise. No real SMS, retry,
payment, data contract, strategy change or Sites deployment is triggered.

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
Stock-analysis calculations and all route/frame combinations are checked by the
executed rendering and navigation tests. Local Chromium app-lifecycle checks are
described above; physical-device stock-chart interactions remain unverified.

## Customer signal history (development)

With the matching v0.7 member runner and membership explicitly enabled,
`#/member` opens `#/signals`: date/name/code and buy/sell filters, 20-item cursor
pages and a message detail dialog. The member server derives scope from the
live session; there is no phone/member selector. Assigned old messages remain
readable after subscription expiry; newly allocated messages still require the
existing member authority. SMS acceptance/delivery/failure are displayed
separately, without a customer reply, resend or trading action.

History exists only in memory. Logout/identity change clear it; canceled/late
responses cannot restore it. Network failure keeps an explicitly labeled prior
result. Private APIs stay outside the service-worker cache. The shell version
includes `member-signals.js`. Static `membersEnabled:false` remains unchanged:
this development work does not activate a login wall on the public beta.
Product tiers/credit billing are intentionally still pending partner review.

Build with `node scripts/build-static.js`, then verify the matched checkouts:
`TRADING_MASTER_ENGINE_ROOT=/path/to/trading-master-engine python tests/browser_member_signals_check.py`.
The script runs headless Chromium locally and never opens a user-facing preview
or sends real SMS. Operational HTTPS/auth, production hosting, real providers,
physical-device QA and packaging remain separate work.

## Service SMS preferences (development)

`#/member` links to `#/notification-settings`. SMS is off until the customer
explicitly consents for their verified phone. Turning it off preserves app
information allocations and the existing subscription. Re-enabling starts with
new signals, and verified number changes require fresh consent. Already-claimed
SMS processing may finish. The control is separate from subscription cancellation
or any marketing-message signup; real delivery/terms/provider approval remain
pending. No real SMS or payments are triggered by the browser tests.

The server persists audited consent with an expected revision. Stale devices and
uncertain POST results require a current GET before another change; the client
does not retry writes automatically. New `member-notifications.js` joins the
12-asset static shell, and preference/history APIs stay outside persistent
storage/SW caching. Signal-history reentry always requests fresh assigned records,
retaining prior results while loading. Default public-beta access stays open.

Verify matched services with
`TRADING_MASTER_ENGINE_ROOT=/path/to/trading-master-engine python tests/browser_notifications_check.py`.
It checks explicit consent, opt-out/reconsent, app-only records, stale revisions,
lost-response reconciliation, verified number change, late logout responses and
mobile widths through local headless Chromium without a user-facing preview.

## Administrator SMS consent reporting (development)

`admin.html` now combines period status, the customer's SMS on/off setting and
current app/SMS eligibility. Whole-member counts include SMS recipients and
app-only members; shortcuts and intersecting phone/status/SMS/channel filters
make it possible to find SMS-on but expired members separately from active
SMS-off members. Lists use masked phones and 20-item pages; mobile uses cards.
Counts/readiness describe eligibility at query time, not actual delivery.

Member detail has a read-only consent/withdrawal/number-change audit: exact
historical wording, version, time and current/previous-number marker. It omits
previous numbers/hashes. Signed 20-item pages keep an insertion anchor until
latest refresh; new records are announced. Audit refresh preserves period-form
drafts. Admins cannot turn customer consent on/off. Stored history is retained,
and the new member DB migration adds only an ordering index.

Tab switching preserves search/member/page state. Errors label prior successful
results; member switches, logout and role revocation discard late responses.
No private content enters localStorage, API caches or the static PWA cache.
The customer shell/cache version and public `membersEnabled:false` stay intact.
No production merge/deployment, actual SMS, payment, price/tier decision or
strategy/ledger change is performed by this development feature.

Build and check the matching member v0.7 / SMS v0.5 sources with
`TRADING_MASTER_ENGINE_ROOT=/path/to/engine python tests/browser_admin_consents_check.py`.
The integration check covers paging/anchors, exact escaped wording, filters,
network failures, late responses, role revocation and widths 320–1280 through
headless Chromium. It never opens a user-facing preview pane.


## External administrator walkthrough (fictional data only)

`admin-demo.html` uses the same admin member/consent/message UI as the v0.7
member runner, with an explicit browser-only fictional adapter. The public
Sites `admin.html` entrance redirects to this walkthrough. It does not publish
the Python member service or create real administrator/customer accounts.
The normal beta stays open, and product/payment terms remain pending.

The page labels its test mode throughout. A prefilled fictional phone and
`demo` password let a reviewer press **테스트 계정으로 입장** without entering
personal credentials. These published fixture values are not security controls.
There are 240 fictional members plus one fictional operator, 47 paged consent
changes on the first member, and 180 fictional signals / 43,200 virtual delivery
rows to exercise search, pagination, status counts and message drilldowns.
Periods can be set/extended/paused/resumed in the current tab. SMS consent is
read-only. Reload/reset starts the original fixture and logs out; separate tabs
are independent. No state is written to localStorage/sessionStorage or a server.

The adapter is selected only by the explicit `data-tm-admin-demo="true"` marker
on the standalone demo document. Clean URLs with/without `.html`, trailing
slashes and a mounted app directory use the same fixture, with assets based in
that app directory. Query-versioned scripts bypass older cached route guards. Missing
fixture scripts fail with a visible error instead of sending an auth/admin
request. The actual `admin.html` member-runner UI continues to require its live
server role/session; loading a fixture global on that path cannot override it.
No gateway, provider, payment or trading execution is invoked by the walkthrough.
Only the static demo assets are deployed to Sites; the member v0.7 server remains
on the separate private development branch until the production-hosting phase.

Check with `node tests/admin-demo.test.js`, `node --test tests/*.test.js`, then
serve the matched static Sites checkout and run
`python tests/browser_admin_demo_check.py http://127.0.0.1:18744/`.
The headless test covers the separate entrance, simulated login, subscriber and
consent paging, period edits, virtual delivery counts/pages/modals, reset/new-tab
isolation, missing fixtures, mobile widths and zero real auth/admin API calls.
The production page is shared via an external browser link; no side preview is
opened. Existing beta account/watchlist and payment assets are byte-preserved.
