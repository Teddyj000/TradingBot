# EDGE — Strategy Studio

A mobile-first strategy editor, SPY research backtester, and **optional read-only Live Watch**. Deploy from this GitHub repository to Cloudflare Pages.

## What EDGE does

- Create, duplicate and edit multiple SPY trading strategies: opening-range breakout, previous-day high/low breakout, failed-break/reclaim, premarket levels and VWAP crossing.
- Import historical five-minute SPY candle CSV files, or load clearly labeled synthetic demo data, to compare hypothetical *underlying SPY R-multiple* results. These are **not options profit-and-loss backtests**.
- Edit risk limits: contract count, maximum cost per contract, OTM distance, bankroll and planned option premium stop.
- Connect an optional, read-only SPY data feed and evaluate research signals **after a five-minute candle closes**. The Live Watch page refreshes about every 30 seconds while your browser is visible, and stops when it is paused or the browser is suspended.
- Export/import your strategies as JSON; browser-local settings do not automatically sync between devices.

**EDGE does not submit any real or paper broker orders.** Live Watch does not yet price option contracts and cannot monitor independently while the iPhone browser is closed.

## Free Cloudflare Pages deployment

Connect the repository to **Cloudflare Pages** using Git integration. Suggested settings: production branch **main**, framework **None**, build command **exit 0**, output directory **/**, repository root default.

The optional endpoint is provided by **functions/api/spy.js**. It runs server-side so your broker market-data credentials never need to appear in publicly visible HTML or JavaScript.

### Configure live data

1. Choose a provider:
   - **Alpaca Basic**: free market-data access with an Alpaca paper/trading account. Create API key ID and secret. The app explicitly uses the **IEX-only** feed, not the full consolidated US market. This can be sparse and materially misstate highs, lows, volume and VWAP compared with exchange-wide data. Alpaca's free options prices are indicative, not live consolidated OPRA quotes.
   - **Tradier Lite**: its $0/month brokerage plan includes API access and live stock/options market data for eligible active account holders. Obtain a **production** brokerage API token, not the delayed sandbox token. EDGE currently uses Tradier for SPY five-minute equity bars, **not** for options chains.
2. In the Cloudflare dashboard open **Workers & Pages → your project → Settings → Variables and Secrets → Add**. Add the following as **encrypted Secrets** to the production environment:
   - **EDGE_VIEW_KEY**: a personal random access key, preferably at least 32 characters. This protects the feed endpoint. It is *not* a broker credential.
   - **Either** ALPACA_KEY_ID and ALPACA_SECRET_KEY, **or** TRADIER_API_TOKEN.
3. Save and redeploy if Cloudflare requests a new deployment for updated secrets.
4. On iPhone Safari, open the Cloudflare Pages site → **Live watch** → enter your EDGE_VIEW_KEY value → **Connect feed**. The browser stores this gateway access key only in session storage; the actual broker data keys remain in Cloudflare. Add the website to the Home Screen if desired.

If both providers are configured, Tradier takes priority.

**Never paste brokerage keys or the personal EDGE_VIEW_KEY into ChatGPT or GitHub.** Use Cloudflare encrypted Secrets and your own password manager. Do not distribute your private data-feed access to other people; providers may restrict market-data redistribution.

## Accuracy and safety

- An IEX-only feed does *not* represent all SPY market activity. It is suitable as a development prototype, **not an execution-grade 0DTE options feed**.
- Entries, options prices and fills are not modeled from real-time option chains. The risk sliders give budgeting illustrations, not guaranteed exit prices or guaranteed loss limits.
- Missing or stale five-minute bars suppress live triggers. A live-looking quote does not guarantee up-to-date or complete market coverage.
- Live Watch is an active browser poll, **not** an always-on server bot, and never places orders.
- Cloudflare Pages Functions count toward the Workers Free shared daily request quota. The free plan is suitable for an individual prototype, subject to the provider's terms and Cloudflare limits.
- Historical and paper research alone cannot establish a profitable trading edge. We still need properly licensed quote history, out-of-sample evaluation, slippage modeling and extensive paper testing.

## Project files

- **index.html** — mobile strategy studio, research backtester and Live Watch interface.
- **functions/api/spy.js** — protected read-only Cloudflare Pages Function. No order routes.
- **icon.svg** and **manifest.webmanifest** — web app icons and manifest.
- **README.md** — configuration guide.

## Next development stages

Evaluate data quality, add option-chain viewing with appropriate permissions, simulate realistic paper option orders and account-level risk, then evaluate whether any tested strategy offers an edge. Only consider real orders after independent safeguards and validation.

## New: SPY Monster Day Watch (research only)

Open **Monster day watch** from EDGE's left navigation, or visit `/monster.html`. The dashboard evaluates completed SPY five-minute candles for unusually large opening shocks and later expansions, using QQQ, IWM, VWAP and **20 complete reference sessions** of SPY price/volume. The new authenticated endpoint is `/api/monster`. It uses the same `EDGE_VIEW_KEY` and encrypted Tradier/Alpaca provider secrets as Live Watch and **never places orders**.

**Important:** The broad trend-expansion rule **lost −4.20R in the July–November test period**, and the rare opening-shock pattern appeared only four times. Both are research observations, *not profitable or validated trading recommendations*. Stop-distance readings are SPY price points, **not option premium limits**. See [the backtest report](research/BACKTEST_2026-11-12.md) for exact methodology and limitations.

Tradier's regular-session five-minute `session_filter=open` feed supports approximately 40 calendar days of history, enough in ordinary trading calendars for 20 complete sessions; the scanner refuses to produce a signal when history is insufficient. Free Alpaca Basic is IEX-only, a single-exchange feed that can miss actual consolidated volume and levels, so Monster Watch **suppresses research alerts** on IEX rather than imply the backtest applies. Live monitoring requires the page open and visible; **no background iPhone notifications** or always-on automation are provided. A sound alert can be enabled by explicit user action, and is limited to rare opening shock observations. Existing `/api/spy` and the older Live Watch remain unchanged.

Run unit tests via `npm test` (Node 22+) before deployment. Cloudflare Pages' existing no-build configuration continues to apply.
