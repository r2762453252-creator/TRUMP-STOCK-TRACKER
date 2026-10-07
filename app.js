const cfg = window.TRUMP_RADAR_CONFIG;
const baseData = window.TRUMP_RADAR_DATA;

let filter = "all";
let days = 30;
let selected = null;
let activeRange = "1D";
let stockChart = null;

const bubbleField = document.getElementById("bubbleField");
const signalList = document.getElementById("signalList");
const count = document.getElementById("signalCount");

const stockDrawer = document.getElementById("stockDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");

function daysAgo(dateStr){
  const today = new Date("2026-10-06T12:00:00");
  const d = new Date(dateStr + "T12:00:00");
  return (today - d) / 86400000;
}

function activeData(){
  return baseData.filter(x =>
    daysAgo(x.eventDate) <= days &&
    (filter === "all" || x.type === filter)
  );
}

function fmtShares(n){
  return n
    ? new Intl.NumberFormat("en-US", {
        notation:"compact",
        maximumFractionDigits:2
      }).format(n)
    : "—";
}

function formatMarketCap(n){
  if (n == null) return "--";
  if (n >= 1e12) return (n/1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n/1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n/1e6).toFixed(2) + "M";
  return String(n);
}

function fmt(v, digits=2){
  if (v == null || Number.isNaN(Number(v))) return "--";
  return Number(v).toFixed(digits);
}

function scaleDiameter(weight, maxWeight){
  const minD = 88;
  const maxD = 250;
  const ratio = Math.sqrt(Math.max(weight,5) / Math.max(maxWeight,5));
  return Math.round(minD + (maxD-minD) * ratio);
}

function seeded(i, axis){
  const x = Math.sin((i+1) * (axis===0 ? 12.9898 : 78.233)) * 43758.5453;
  return x - Math.floor(x);
}

function layout(items){
  bubbleField.innerHTML = "";

  const rect = bubbleField.getBoundingClientRect();
  const maxWeight = Math.max(...items.map(x => x.weight), 1);
  const placed = [];

  items
    .slice()
    .sort((a,b) => b.weight-a.weight)
    .forEach((item, i) => {
      const d = scaleDiameter(item.weight, maxWeight);

      let x = 0;
      let y = 0;
      let tries = 0;

      while (tries < 160){
        x = 12 + seeded(i + tries*7, 0) * Math.max(1, rect.width - d - 24);
        y = 12 + seeded(i + tries*11, 1) * Math.max(1, rect.height - d - 24);

        const overlaps = placed.some(p => {
          const dx = (x+d/2) - (p.x+p.d/2);
          const dy = (y+d/2) - (p.y+p.d/2);
          return Math.hypot(dx,dy) < (d+p.d)*0.44;
        });

        if (!overlaps) break;
        tries++;
      }

      placed.push({x,y,d});

      const b = document.createElement("div");
      b.className = `bubble ${item.type}`;
      b.dataset.ticker = item.ticker;

      b.style.width = b.style.height = d + "px";
      b.style.left = x + "px";
      b.style.top = y + "px";

      b.innerHTML = `
        <div class="ticker">${item.ticker}</div>
        <div class="price">$${Number(item.price).toFixed(2)}</div>
        <div class="change ${item.changePct>=0 ? "up":"down"}">
          ${item.changePct>=0 ? "+":""}${item.changePct.toFixed(2)}%
        </div>
        <div class="tag">
          ${item.type==="holding" ? "DISCLOSED HOLDING" : "POSITIVE MENTION"}
        </div>
      `;

      b.onclick = () => {
        document.querySelectorAll(".bubble").forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
        openStockDrawer(item);
      };

      bubbleField.appendChild(b);
    });
}

function renderList(items){
  count.textContent = `${items.length} signals`;

  signalList.innerHTML = items
    .slice()
    .sort((a,b) => b.eventDate.localeCompare(a.eventDate))
    .map(x => `
      <div class="signal-item">
        <div class="date">${x.eventDate}</div>
        <div class="symbol">${x.ticker}</div>
        <div class="desc">${x.note}</div>
        <a class="source" href="${x.source}" target="_blank" rel="noreferrer">
          来源 ↗
        </a>
      </div>
    `)
    .join("") || `
      <div class="signal-item">
        <div class="desc">当前筛选窗口没有数据。</div>
      </div>
    `;
}

function render(){
  const items = activeData();
  layout(items);
  renderList(items);
}

function openStockDrawer(item){
  selected = item;

  stockDrawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  stockDrawer.setAttribute("aria-hidden", "false");

  document.getElementById("drawerTicker").textContent = item.ticker;
  document.getElementById("drawerCompany").textContent = item.company;

  renderTrumpMeta(item);
  loadStockData(item.ticker, activeRange);
}

function closeDrawer(){
  stockDrawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
  stockDrawer.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".bubble").forEach(x => x.classList.remove("selected"));
}

document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeDrawer();
});

function renderTrumpMeta(item){
  const badge = document.getElementById("trumpTypeBadge");
  badge.textContent = item.type === "holding" ? "DISCLOSED HOLDING" : "POSITIVE MENTION";

  document.getElementById("trumpInfo").innerHTML = `
    <div class="meta-row">
      <span>分类</span>
      <b>${item.type === "holding" ? "公开持股" : "公开正面点名"}</b>
    </div>

    <div class="meta-row">
      <span>事件日期</span>
      <b>${item.eventDate}</b>
    </div>

    ${item.shares ? `
      <div class="meta-row">
        <span>披露股份</span>
        <b>${fmtShares(item.shares)}</b>
      </div>
    ` : ""}

    ${item.holdingPct ? `
      <div class="meta-row">
        <span>披露占比</span>
        <b>${item.holdingPct}%</b>
      </div>
    ` : ""}

    <div class="meta-row">
      <span>证据类型</span>
      <b>${item.confidence}</b>
    </div>

    <div class="trump-note">${item.note}</div>

    <a class="source-link"
       href="${item.source}"
       target="_blank"
       rel="noreferrer">
      打开原始来源 ↗
    </a>
  `;
}

async function loadStockData(ticker, range){
  showChartLoading(true);

  try{
    const url = `${cfg.stockDetailEndpoint}?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok){
      throw new Error(data.error || `API error ${res.status}`);
    }

    renderStockDrawer(data);
  } catch (err){
    console.error(err);
    document.getElementById("quoteUpdated").textContent = "行情加载失败";
    document.getElementById("quoteStatus").textContent = "API ERROR";
  } finally{
    showChartLoading(false);
  }
}

function showChartLoading(show){
  document.getElementById("chartLoading").classList.toggle("hidden", !show);
}

function renderStockDrawer(data){
  document.getElementById("drawerPrice").textContent = fmt(data.price, 2);

  const changeEl = document.getElementById("drawerChange");
  const changeText =
    `${data.change >= 0 ? "+" : ""}${fmt(data.change,2)} ` +
    `(${data.changePct >= 0 ? "+" : ""}${fmt(data.changePct,2)}%)`;

  changeEl.textContent = changeText;
  changeEl.className = `drawer-change ${data.changePct >= 0 ? "up":"down"}`;

  document.getElementById("quoteUpdated").textContent =
    `更新时间 ${data.updatedAt || "刚刚"}`;

  document.getElementById("quoteStatus").textContent =
    data.isMarketOpen ? "LIVE · MARKET OPEN" : "LIVE · MARKET CLOSED";

  document.getElementById("statOpen").textContent = fmt(data.open,2);
  document.getElementById("statHigh").textContent = fmt(data.high,2);
  document.getElementById("statLow").textContent = fmt(data.low,2);
  document.getElementById("statMarketCap").textContent = formatMarketCap(data.marketCap);
  document.getElementById("statPE").textContent =
    data.peRatio == null ? "--" : fmt(data.peRatio,2);
  document.getElementById("statDividendYield").textContent =
    data.dividendYield == null ? "--" : `${fmt(data.dividendYield,2)}%`;
  document.getElementById("stat52High").textContent = fmt(data.week52High,2);
  document.getElementById("stat52Low").textContent = fmt(data.week52Low,2);

  drawChart(data.series, data.changePct >= 0);
}

function formatChartTime(value){
  if (!value) return "";
  const s = String(value);

  // Intraday Twelve Data: YYYY-MM-DD HH:mm:ss
  if (s.includes(" ")){
    const [date,time] = s.split(" ");
    if (activeRange === "1D") return time.slice(0,5);
    if (activeRange === "5D" || activeRange === "1M"){
      return `${date.slice(5)} ${time.slice(0,5)}`;
    }
    return date;
  }

  // Daily/weekly/monthly
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    if (activeRange === "5Y" || activeRange === "MAX") return s.slice(0,7);
    return s.slice(5);
  }

  return s;
}

function drawChart(series, isUp){
  const ctx = document.getElementById("stockChart").getContext("2d");

  if (stockChart){
    stockChart.destroy();
  }

  stockChart = new Chart(ctx,{
    type:"line",
    data:{
      labels:series.map(p => formatChartTime(p.time)),
      datasets:[{
        data:series.map(p => p.price),
        borderColor:isUp ? "#53f6a4" : "#ff7f86",
        backgroundColor:isUp ? "rgba(83,246,164,.08)" : "rgba(255,127,134,.08)",
        fill:true,
        tension:.24,
        borderWidth:2,
        pointRadius:0,
        pointHitRadius:14
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{
        intersect:false,
        mode:"index"
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          displayColors:false,
          callbacks:{
            label:(ctx)=>`$${Number(ctx.parsed.y).toFixed(2)}`
          }
        }
      },
      scales:{
        x:{
          ticks:{
            color:"#72858f",
            maxTicksLimit:6
          },
          grid:{
            display:false
          }
        },
        y:{
          position:"right",
          ticks:{
            color:"#72858f",
            callback:v=>Number(v).toFixed(2)
          },
          grid:{
            color:"rgba(255,255,255,.055)"
          }
        }
      }
    }
  });
}

/* Demo stock data generator.
   Replace this entire function after your backend is ready. */
async function demoStockDetail(ticker, range){
  await new Promise(r => setTimeout(r, 250));

  const item = baseData.find(x => x.ticker === ticker);
  if (!item) throw new Error("Unknown ticker");

  const pointsByRange = {
    "1D": 42,
    "5D": 50,
    "1M": 60,
    "6M": 72,
    "YTD": 80,
    "1Y": 90,
    "5Y": 100,
    "MAX": 110
  };

  const count = pointsByRange[range] || 42;

  // deterministic pseudo-random series by ticker + range
  let seed = [...(ticker + range)].reduce((a,c)=>a+c.charCodeAt(0),0);

  function rnd(){
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  let p = item.price * (1 - item.changePct/100);
  const series = [];

  for (let i=0;i<count;i++){
    const drift = (item.changePct/100) / Math.max(count,1);
    const noise = (rnd()-.5) * 0.009;

    p = Math.max(0.01, p * (1 + drift + noise));

    series.push({
      time: demoLabel(range, i, count),
      price: Number(p.toFixed(2))
    });
  }

  // force ending around current price
  const factor = item.price / series[series.length-1].price;
  series.forEach(s => s.price = Number((s.price*factor).toFixed(2)));

  const prevClose = item.price / (1 + item.changePct/100);
  const change = item.price - prevClose;

  return {
    ticker:item.ticker,
    company:item.company,
    price:item.price,
    change:Number(change.toFixed(2)),
    changePct:item.changePct,
    open:item.open,
    high:item.high,
    low:item.low,
    marketCap:item.marketCap,
    peRatio:item.peRatio,
    dividendYield:item.dividendYield,
    week52High:item.week52High,
    week52Low:item.week52Low,
    updatedAt:new Date().toLocaleTimeString("zh-CN",{
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    }),
    series
  };
}

function demoLabel(range,i,count){
  const ratio = i/(count-1 || 1);

  if (range === "1D"){
    const start = 9*60 + 30;
    const mins = Math.round(start + ratio*(390));
    const h = Math.floor(mins/60);
    const m = mins%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }

  if (range === "5D"){
    return `D${Math.floor(ratio*5)+1}`;
  }

  if (range === "1M"){
    return `${Math.floor(ratio*30)+1}日`;
  }

  if (range === "6M"){
    return `M${Math.floor(ratio*6)+1}`;
  }

  if (range === "YTD"){
    return `M${Math.floor(ratio*12)+1}`;
  }

  if (range === "1Y"){
    return `M${Math.floor(ratio*12)+1}`;
  }

  if (range === "5Y"){
    return `${2022 + Math.floor(ratio*5)}`;
  }

  return `${2018 + Math.floor(ratio*9)}`;
}

document.querySelectorAll(".range-tab").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    document.querySelectorAll(".range-tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");

    activeRange = btn.dataset.range;

    if (selected){
      await loadStockData(selected.ticker, activeRange);
    }
  });
});

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    render();
  });
});

document.getElementById("daysSelect").addEventListener("change",e=>{
  days = Number(e.target.value);
  render();
});

window.addEventListener("resize",()=>{
  render();
});


async function refreshBubbleQuotes(){
  try{
    const symbols = [...new Set(baseData.map(x=>x.ticker))];
    const url = `${cfg.quotesEndpoint}?symbols=${encodeURIComponent(symbols.join(","))}`;
    const res = await fetch(url);
    const payload = await res.json();

    if (!res.ok) throw new Error(payload.error || "quote refresh failed");

    for (const q of payload.quotes || []){
      if (q.error) continue;
      const item = baseData.find(x=>x.ticker === q.ticker);
      if (!item) continue;
      if (q.price != null) item.price = q.price;
      if (q.changePct != null) item.changePct = q.changePct;
      if (q.open != null) item.open = q.open;
      if (q.high != null) item.high = q.high;
      if (q.low != null) item.low = q.low;
      if (q.week52High != null) item.week52High = q.week52High;
      if (q.week52Low != null) item.week52Low = q.week52Low;
    }

    document.getElementById("marketStatus").textContent =
      `Twelve Data · ${new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}`;

    render();
  }catch(err){
    console.error(err);
    document.getElementById("marketStatus").textContent = "Market API unavailable";
  }
}

document.getElementById("updatedAt").textContent =
  "V3 · Real market data via Twelve Data";

render();
refreshBubbleQuotes();
setInterval(refreshBubbleQuotes, cfg.refreshMs || 30000);
