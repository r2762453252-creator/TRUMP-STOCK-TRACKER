import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const ENABLE_STATS = String(process.env.ENABLE_TD_STATISTICS || "false").toLowerCase() === "true";
const TD_BASE = "https://api.twelvedata.com";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cache = new Map();

function getCache(key, ttlMs){
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs){
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value){
  cache.set(key, {at:Date.now(), value});
}

function n(v){
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function td(endpoint, params = {}){
  if (!API_KEY){
    throw new Error("TWELVE_DATA_API_KEY is not configured");
  }

  const u = new URL(TD_BASE + endpoint);
  for (const [k,v] of Object.entries(params)){
    if (v !== undefined && v !== null && v !== ""){
      u.searchParams.set(k, String(v));
    }
  }
  u.searchParams.set("apikey", API_KEY);

  const res = await fetch(u, {
    headers: {"User-Agent":"TrumpStockRadar/3.0"}
  });

  const data = await res.json().catch(()=>({}));

  if (!res.ok || data?.status === "error" || data?.code){
    const msg = data?.message || `Twelve Data error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

function rangeSpec(range){
  // Designed to keep chart density reasonable while using REAL Twelve Data candles.
  switch(range){
    case "1D":
      return {interval:"1min", outputsize:390};
    case "5D":
      return {interval:"5min", outputsize:390};
    case "1M":
      return {interval:"30min", outputsize:420};
    case "6M":
      return {interval:"1day", outputsize:190};
    case "YTD":{
      const now = new Date();
      const jan1 = new Date(now.getFullYear(),0,1);
      const days = Math.ceil((now - jan1)/86400000) + 10;
      return {interval:"1day", outputsize:Math.min(5000, Math.max(days,50))};
    }
    case "1Y":
      return {interval:"1day", outputsize:370};
    case "5Y":
      return {interval:"1week", outputsize:270};
    case "MAX":
      return {interval:"1month", outputsize:1200};
    default:
      return {interval:"1min", outputsize:390};
  }
}

async function getQuote(symbol){
  const key = `quote:${symbol}`;
  const cached = getCache(key, 10000);
  if (cached) return cached;

  const q = await td("/quote", {
    symbol,
    interval:"1day",
    timezone:"America/New_York"
  });

  setCache(key, q);
  return q;
}

async function getSeries(symbol, range){
  const spec = rangeSpec(range);
  const key = `series:${symbol}:${range}`;
  const cached = getCache(key, range === "1D" ? 15000 : 60000);
  if (cached) return cached;

  const s = await td("/time_series", {
    symbol,
    interval:spec.interval,
    outputsize:spec.outputsize,
    order:"asc",
    timezone:"America/New_York"
  });

  setCache(key, s);
  return s;
}

async function getStatistics(symbol){
  if (!ENABLE_STATS) return null;
  const key = `stats:${symbol}`;
  const cached = getCache(key, 15 * 60 * 1000);
  if (cached) return cached;

  try{
    const s = await td("/statistics", {symbol});
    setCache(key, s);
    return s;
  }catch(err){
    console.warn("statistics unavailable:", err.message);
    return null;
  }
}

app.get("/api/health", (req,res)=>{
  res.json({
    ok:true,
    marketProvider:"Twelve Data",
    apiKeyConfigured:Boolean(API_KEY),
    statisticsEnabled:ENABLE_STATS
  });
});

app.get("/api/quotes", async (req,res)=>{
  try{
    const raw = String(req.query.symbols || "");
    const symbols = [...new Set(raw.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean))].slice(0,20);

    if (!symbols.length){
      return res.status(400).json({error:"symbols required"});
    }

    // Intentionally individual calls so response handling is predictable across plans.
    // Cached for 10 seconds server-side.
    const rows = await Promise.all(symbols.map(async symbol=>{
      try{
        const q = await getQuote(symbol);
        return {
          ticker:symbol,
          company:q.name || symbol,
          price:n(q.close ?? q.price),
          change:n(q.change),
          changePct:n(q.percent_change),
          open:n(q.open),
          high:n(q.high),
          low:n(q.low),
          volume:n(q.volume),
          previousClose:n(q.previous_close),
          isMarketOpen:Boolean(q.is_market_open),
          week52High:n(q.fifty_two_week?.high),
          week52Low:n(q.fifty_two_week?.low),
          datetime:q.datetime || null,
          timestamp:q.timestamp || null
        };
      }catch(err){
        return {ticker:symbol, error:err.message};
      }
    }));

    res.json({quotes:rows, provider:"Twelve Data", fetchedAt:new Date().toISOString()});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.get("/api/stock-detail", async (req,res)=>{
  try{
    const ticker = String(req.query.ticker || "").trim().toUpperCase();
    const range = String(req.query.range || "1D").toUpperCase();

    if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)){
      return res.status(400).json({error:"invalid ticker"});
    }

    const [q, s, stats] = await Promise.all([
      getQuote(ticker),
      getSeries(ticker, range),
      getStatistics(ticker)
    ]);

    const values = Array.isArray(s.values) ? s.values : [];
    const series = values.map(row=>({
      time:row.datetime,
      price:n(row.close),
      open:n(row.open),
      high:n(row.high),
      low:n(row.low),
      volume:n(row.volume)
    })).filter(x=>x.price !== null);

    const sv = stats?.statistics?.valuations_metrics || {};
    const sp = stats?.statistics?.stock_price_summary || {};
    const ds = stats?.statistics?.dividends_and_splits || {};

    const price = n(q.close ?? q.price);
    const change = n(q.change);
    const changePct = n(q.percent_change);

    res.json({
      ticker,
      company:q.name || s.meta?.symbol || ticker,
      currency:q.currency || s.meta?.currency || "USD",
      exchange:q.exchange || s.meta?.exchange || null,

      price,
      change,
      changePct,

      open:n(q.open),
      high:n(q.high),
      low:n(q.low),
      volume:n(q.volume),
      previousClose:n(q.previous_close),

      marketCap:n(sv.market_capitalization),
      peRatio:n(sv.trailing_pe),
      dividendYield: ds.forward_annual_dividend_yield != null
        ? n(ds.forward_annual_dividend_yield) * 100
        : null,

      week52High:n(q.fifty_two_week?.high) ?? n(sp.fifty_two_week_high),
      week52Low:n(q.fifty_two_week?.low) ?? n(sp.fifty_two_week_low),

      isMarketOpen:Boolean(q.is_market_open),
      updatedAt:q.datetime || new Date().toISOString(),
      provider:"Twelve Data",
      range,
      interval:s.meta?.interval || rangeSpec(range).interval,
      series
    });
  }catch(err){
    console.error(err);
    res.status(err.status || 500).json({
      error:err.message,
      provider:"Twelve Data"
    });
  }
});

app.use(express.static(__dirname));

app.listen(PORT, ()=>{
  console.log(`Trump Stock Radar V3 running at http://localhost:${PORT}`);
  if (!API_KEY){
    console.log("WARNING: TWELVE_DATA_API_KEY is missing. Copy .env.example to .env and add your key.");
  }
});
