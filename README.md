# EDGE — SPY Bot Lab

Mobile-first, browser-based SPY options trading research prototype. Version 0.2.

## What works
- Four risk controls: maximum contracts, maximum total cost per contract, dollar distance out of the money, and option-premium stop-loss percentage.
- Trading bankroll input and dollar risk estimates (planned loss vs maximum possible loss).
- Five-minute SPY candle CSV import, a synthetic demo dataset and an opening-range backtest.
- Manual option-trade journal with browser-local persistence and CSV export.

## What it does NOT do
- No live quotes or brokerage API integration.
- No automatic orders or actual option fills.
- The historical backtest models SPY underlying price movements, **not option premiums or options P/L**.
- A stop-loss percentage is a plan, not a guaranteed fill or guaranteed loss limit.

## Run
Open `index.html` in a modern browser, or publish the repo as a static website.

## Publish to iPhone (GitHub Pages)
1. In Safari, open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then Save.
3. GitHub Pages' default project URL will be `https://teddyj000.github.io/TradingBot/` **after Pages successfully deploys**.
4. On iPhone Safari, open the site and choose Share → Add to Home Screen.

**Important:** GitHub Free requires a **public** repository for GitHub Pages. GitHub Pro or certain organization plans may publish from private repositories; Pages sites themselves are still publicly accessible. If you keep the repo private on GitHub Free, a deployment service that connects to private GitHub repositories may be a better choice.

**Security:** Never put brokerage API tokens, account numbers or other secrets in `index.html` or any browser-side JavaScript. For live trading, use an authenticated backend and carefully scoped credentials. Browser-local journal data will not automatically sync between different browsers, devices or website origins.

## Next milestones
1. Test historical setups with real quote data and spread/slippage assumptions.
2. Build realistic option selection and paper-order simulations.
3. Add a paper-first execution service with a hard daily lockout and independently validated risk limits.
4. Evaluate performance out of sample before considering real orders.
