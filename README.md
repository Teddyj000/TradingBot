# EDGE / Strategy Studio

A mobile-first, single-page SPY strategy research app built with plain HTML, CSS, and JavaScript. No build step or trading API required.

## Features

- Six editable entry signal types: opening-range breakout, previous-day breakout, previous-day failed break/reclaim, premarket breakout, premarket failed break/reclaim, and VWAP reclaim/loss.
- Five ready-to-edit strategy presets, each with editable direction, confirmation candles, breakout buffer, volume/VWAP filters, trading time window, stop and target rules.
- Independent per-strategy backtests with an equity curve, R-multiple metrics, maximum drawdown, comparisons, and trade CSV export.
- SPY 5-minute OHLCV CSV import and **clearly labeled synthetic** example candles to verify the app's behavior.
- Simple option position-budget sliders (contracts, contract premium cap, OTM strike distance, intended premium stop percentage), with planned exposure versus worst-case premium loss.
- Device-local strategy storage and JSON import/export backup. Responsive phone and desktop interface, plus installable web-app metadata.

## Run and deploy

The app loads from `index.html`. Publish this repository to Cloudflare Pages through the GitHub integration, using the `main` branch. Select no framework, no build command and use the repository root `/` as your output directory.

Once the Cloudflare deployment finishes, open the `pages.dev` URL in iPhone Safari, then **Share → Add to Home Screen**. GitHub commits to `main` should automatically trigger a new deployment if Cloudflare Git integration is enabled.

## Market-data format

Import a CSV with a header and these columns:

```csv
date,time,open,high,low,close,volume
2026-11-02,09:30,684.20,684.80,683.95,684.50,120000
2026-11-02,09:35,684.50,684.67,683.80,684.10,96000
```

- `date` + `time` or `datetime`/`timestamp`, `open`, `high`, `low`, `close` are required; `volume` is strongly recommended.
- Bars are **5-minute candles timestamped by start time** and must cover the **entire regular session from 09:30 through 15:55 America/New_York** to be considered complete. No lookahead or gap-filling of missing regular candles.
- Premarket strategies additionally require coverage from approximately **04:00 through 09:25 ET**. Previous-day strategies need the previous complete regular session. VWAP and relative-volume filters need volume data.
- A datetime timestamp with an explicit `Z` or UTC offset is converted into New York time. Otherwise, date/time values are treated as Eastern time.
- The entire file is parsed in the browser; there is no server-side data storage.

## Research assumptions and limitations

**Not a live trading or options execution bot.** It does not connect to a brokerage, fetch live SPY prices, source real option chains or route orders. The historical simulator models SPY underlying price moves as **R-multiples**, not SPY option premium P/L. It omits option Greeks, spreads, fees, liquidity constraints, actual fills, and realistic execution latency. Premium stops and OTM sliders are illustrative position-budget controls, not inputs to historical SPY returns.

The simulator evaluates signals using **completed 5-minute closes**, then simulates entries at the *next bar's open*. A 5-minute-close stop likewise exits at the following bar's open. An intrabar touch stop assumes a stop price or a worse gap price; simultaneous stop/target touches are resolved conservatively in favor of the stop. Profit targets are idealized. Only one trade per day is simulated **per strategy**; combining multiple strategies does **not** enforce one portfolio-wide daily loss lockout. This is intentionally a research prototype, not evidence of live profitability.

Synthetic demo performance must never be interpreted as a profitable trading signal. Use real historical market data, realistic options quotes and out-of-sample testing before considering live trading.

## Privacy and persistence

The repository and deployed Cloudflare Pages front end are publicly viewable. **Never put API keys, broker credentials, account numbers, or non-public trading data in this repository or browser code.** Strategy edits are saved in the browser's `localStorage` for the website's origin. They are **not automatically synchronized to GitHub**, another device, or another domain. Export a JSON backup before clearing browser data or changing domains.