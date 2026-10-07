# Trump Stock Radar V3 — Real Market Data

V3 removes simulated stock charts and connects the site to **Twelve Data** through a secure Node/Express backend.

## What is real now

- Bubble prices: `/quote`
- Daily change: `/quote`
- Open / High / Low: `/quote`
- 52-week high / low: `/quote`
- 1D chart: real 1-minute candles
- 5D chart: real 5-minute candles
- 1M chart: real 30-minute candles
- 6M / YTD / 1Y: real daily candles
- 5Y: real weekly candles
- MAX: real monthly candles

The frontend never receives your Twelve Data API key.

## 1. Get a Twelve Data API key

Create an account at Twelve Data and copy your API key.

## 2. Configure

Copy:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
TWELVE_DATA_API_KEY=YOUR_REAL_KEY
PORT=8080
ENABLE_TD_STATISTICS=false
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 3. Install

Requires Node.js 18+.

```bash
npm install
```

## 4. Start

```bash
npm start
```

Open:

```text
http://localhost:8080
```

## Fundamental metrics

Twelve Data's `/statistics` endpoint is a higher-tier endpoint.

If your plan supports it:

```env
ENABLE_TD_STATISTICS=true
```

Then the detail drawer will also populate:
- Market cap
- P/E
- Dividend yield

Without Statistics enabled, those fields display `--`.

52-week high/low does NOT require Statistics because `/quote` already provides it.

## API routes included

### Current quotes for bubbles

```text
GET /api/quotes?symbols=DJT,BDX,MU
```

### Stock detail and chart

```text
GET /api/stock-detail?ticker=DJT&range=1D
```

Supported ranges:

```text
1D 5D 1M 6M YTD 1Y 5Y MAX
```

### Health check

```text
GET /api/health
```

## Important latency note

This is genuine provider data, not generated demo data.

Twelve Data says REST candle availability can be roughly 0.3–2 minutes after a candle closes. For near-tick real-time streaming, use their WebSocket service on a plan that supports full WebSocket access.

## Security

Never put your Twelve Data API key in:
- `config.js`
- `app.js`
- `index.html`

Keep it only in `.env` on your server.
