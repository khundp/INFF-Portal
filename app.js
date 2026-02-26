function setText_(id,value){const el=document.getElementById(id); if(!el){console.warn('Missing element:',id); return;} el.textContent=value;}
// -------- ScrollSpy tabs --------
const spyLinks = [...document.querySelectorAll("[data-spy]")];
const sections = spyLinks.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);

function setActive(id){
  spyLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible?.target?.id) setActive(visible.target.id);
}, { threshold: [0.2, 0.4, 0.6] });

sections.forEach(sec => observer.observe(sec));

const $ = (id) => document.getElementById(id);
function qs(params){ return new URLSearchParams(params).toString(); }

function requireApiUrl(){
  if (!window.API_URL) throw new Error("API_URL not set (check frontend/config.js)");
}
async function apiGet(params){
  // If API_URL is set, use backend. Otherwise use local static JSON mode.
  if (window.API_URL && String(window.API_URL).trim() !== ""){
    const url = `${window.API_URL}?${qs(params)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return await res.json();
  }
  const action = params?.action;
  if (action === "filters"){
    // Build filter options from local data
    const years = uniq_(__DATA.financing.map(r=>r.Year)).sort((a,b)=>Number(a)-Number(b));
    const states = uniq_(__DATA.financing.map(r=>r.State)).sort();
    const sectors = uniq_(__DATA.financing.map(r=>r.Sector)).sort();
    const sources = uniq_(__DATA.financing.map(r=>r.Financing_Source)).sort();
    return { years, states, sectors, sources };
  }
  // Map old actions to static computations
  if (action === "overview") return getStaticOverview_(params);
  if (action === "charts") return getStaticCharts_(params);
  if (action === "subsectors"){
    const f = { year: params.year||"ALL", state_name: params.state_name||"ALL", sector_name: params.sector_name||"ALL", source_name: params.source_name||"ALL" };
    const rows = filterFin_(__DATA.financing, f);
    // make subsectors by taking top sectors as subsectors for demo
    return shareLocal_(rows, "Sector", "Actual_Amount_USD").slice(0,8);
  }
  if (action === "alerts") return [
    { icon:"!", text:"3 Reforms at risk" },
    { icon:"!", text:"5 MDAs with delayed data submission" },
    { icon:"!", text:"INFF review milestone workshop in 45 days" },
  ];
  if (action === "featured") return [
    { title:"Beaming the Light on a Hidden Sector: Artisanal and Small-scale Mining (ASM)", blurb:"Flagship practice improving evidence and governance for ASM in Nigeria.", cta:"LEARN MORE" },
    { title:"Promoting Private Sector Investments at Sub-National Level (Gombe Pilot)", blurb:"Principle-based approach to engage businesses and align investments with national priorities.", cta:"LEARN MORE" },
  ];
  if (action === "partners") return { count: 18, items: [
    { name:"UNDP", type:"UN" }, { name:"EU", type:"Multilateral" }, { name:"World Bank", type:"IFI" }, { name:"AfDB", type:"IFI" }, { name:"Private Sector", type:"Private" }
  ]};
  if (action === "posts") return [];
  if (action === "downloads") return [];
  return {};
}


function fmtBigUsd(n){
  const v = Number(n);
  if (!Number.isFinite(v)) return "US$—";
  if (v >= 1e9) return `US$${(v/1e9).toFixed(1)} B`;
  if (v >= 1e6) return `US$${(v/1e6).toFixed(1)} M`;
  return `US$${v.toFixed(0)}`;
}

function fillSelect(id, options, includeAll=true){
  const el = $(id);
  if (!el) return;
  const opts = includeAll ? ["ALL", ...options] : options;
  el.innerHTML = opts.map(v => `<option value="${v}">${v}</option>`).join("");
}
function setStatus(id, msg){ const el=$(id); if(el) el.textContent = msg || ""; }
function debounce_(fn, ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

// ===== Static JSON data mode (fast) =====
// This mode loads local JSON files from /frontend/data/ and computes all charts client-side.
// To switch back to Apps Script, set window.API_URL to your deployed script URL in config.js.
const __STATIC_JSON_MODE__ = true;

let __DATA = {
  financing: [], revenue: [], revenue_dashboard: null,
  borrowing: [], domestic_borrowing: null,
  soe: [], earmarked: [], earmarked_sector: [], pension: [],
  international_public_financing: null,
  gap_trends: null, planned_required: null
};

let __INFF_V4 = null; // Clean v4 (single JSON) payload: FINANCING_DATA, REFORMS_DATA, PARTNERS_DATA, SUBMISSION_INFO

async function loadInffV4_(){
  if (__INFF_V4) return __INFF_V4;
  try{
    __INFF_V4 = await loadLocalJson_("data/inff_data_v4_2.json");
  }catch(e){
    console.warn("INFF v4 data not loaded:", e?.message || e);
    __INFF_V4 = null;
  }
  return __INFF_V4;
}

function parseNum_(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }
function escapeHtml_(s){
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function groupSumMap_(rows, keyFn, valFn){
  const m = new Map();
  (rows||[]).forEach(r=>{
    const k = keyFn(r);
    if (k==null || String(k).trim()==="") return;
    const v = valFn(r);
    m.set(k, (m.get(k)||0) + v);
  });
  return m;
}
function topNFromMap_(m, n){
  return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n);
}



async function loadLocalJson_(path){
  const res = await fetch(path, { cache: "no-cache" });
  if(!res.ok) throw new Error("Failed to load " + path);
  return await res.json();
}

async function loadAllData_(){
  const base = "data/";
  const [fin, rev, revDash, bor, domBor, soe, earm, earmSector, pens, gap, pr, intl] = await Promise.all([
    loadLocalJson_(base+"financing.json"),
    loadLocalJson_(base+"revenue.json"),
    loadLocalJson_(base+"revenue_dashboard.json").catch(()=>null),
    loadLocalJson_(base+"borrowing.json"),
    loadLocalJson_(base+"domestic_borrowing.json").catch(()=>null),
    loadLocalJson_(base+"soe.json"),
    loadLocalJson_(base+"earmarked.json"),
    loadLocalJson_(base+"earmarked_sector.json").catch(()=>null),
    loadLocalJson_(base+"pension.json"),
    loadLocalJson_(base+"gap_trends.json"),
    loadLocalJson_(base+"planned_required.json"),
    loadLocalJson_(base+"international_public_financing.json").catch(()=>null),
  ]);
  __DATA = { financing: fin, revenue: rev, revenue_dashboard: revDash, borrowing: bor, domestic_borrowing: domBor, soe, earmarked: earm, earmarked_sector: earmSector, pension: pens, international_public_financing: intl, gap_trends: gap, planned_required: pr };
}

function uniq_(arr){ return Array.from(new Set(arr.filter(v=>v!=null && String(v).trim()!=="").map(String))); }

function currentFiltersFrom(prefix){
  const year = $(prefix+"Year")?.value || "ALL";
  const state_name = $(prefix+"State")?.value || "ALL";
  const sector_name = $(prefix+"Sector")?.value || "ALL";
  const source_name = $(prefix+"Source")?.value || "ALL";
  return { year, state_name, sector_name, source_name };
}

function filterFin_(rows, f, ignoreYear=false){
  return rows.filter(r=>{
    if (!ignoreYear && f.year !== "ALL" && String(r.Year) !== String(f.year)) return false;
    if (f.state_name !== "ALL" && String(r.State) !== String(f.state_name)) return false;
    if (f.sector_name !== "ALL" && String(r.Sector) !== String(f.sector_name)) return false;
    if (f.source_name !== "ALL" && String(r.Financing_Source) !== String(f.source_name)) return false;
    return true;
  });
}

function groupSumLocal_(rows, key, valKey){
  const m = new Map();
  rows.forEach(r=>{
    const k = String(r[key]);
    const v = Number(r[valKey]||0);
    m.set(k, (m.get(k)||0) + (isFinite(v)?v:0));
  });
  const labels = Array.from(m.keys()).sort((a,b)=>Number(a)-Number(b));
  const values = labels.map(l=>m.get(l));
  return { labels, values };
}

function shareLocal_(rows, key, valKey){
  const m = new Map();
  rows.forEach(r=>{
    const k = String(r[key]||"Unknown");
    const v = Number(r[valKey]||0);
    m.set(k, (m.get(k)||0) + (isFinite(v)?v:0));
  });
  const total = Array.from(m.values()).reduce((a,b)=>a+b,0) || 1;
  const out = Array.from(m.entries()).map(([label,value])=>({label,value,pct:(value/total*100)}));
  out.sort((a,b)=>b.value-a.value);
  return out;
}

function getStaticOverview_(f){
  const fin = filterFin_(__DATA.financing, f);
  const total = fin.reduce((a,r)=>a+Number(r.Actual_Amount_USD||0),0);
  const required = fin.reduce((a,r)=>a+Number(r.Required_Amount_USD||0),0);
  const gap = fin.reduce((a,r)=>a+Number(r.Gap_USD||0),0);
  const pct = required>0 ? (total/required*100) : null;
  return {
    total_financing_mobilised_usd: total,
    estimated_financing_gap_usd: gap,
    target_achieved_pct: pct,
    active_reforms: 4,
    last_updated: "Static JSON (demo)"
  };
}

function getStaticCharts_(f){
  const finAll = __DATA.financing;
  const finIgnoreYear = filterFin_(finAll, f, true); // for trend
  const by_year = groupSumLocal_(finIgnoreYear, "Year", "Actual_Amount_USD");
  const gap_trend_usd = groupSumLocal_(finIgnoreYear, "Year", "Gap_USD");
  const by_sector_share = shareLocal_(filterFin_(finAll, f), "Sector", "Actual_Amount_USD");
  const by_source_share = shareLocal_(filterFin_(finAll, f), "Financing_Source", "Actual_Amount_USD");
  const gap_by_sector = shareLocal_(filterFin_(finAll, f), "Sector", "Gap_USD");

  // simple gap closed trend (%)
  const labels = by_year.labels;
  const values = labels.map((lab,i)=>{
    const y = Number(lab);
    const yrRows = finIgnoreYear.filter(r=>Number(r.Year)===y);
    const a = yrRows.reduce((s,r)=>s+Number(r.Actual_Amount_USD||0),0);
    const req = yrRows.reduce((s,r)=>s+Number(r.Required_Amount_USD||0),0);
    return req>0 ? (a/req*100) : 0;
  });

  return {
    by_year,
    gap_trend_usd,
    gap_closed_trend: { labels, values },
    by_sector_share,
    by_source_share,
    gap_by_sector
  };
}


// -------- Charts (Chart.js) --------
let miniFinancing, donutGap, miniGapClosed, ts1, ts2;
// Pillars 2–4 charts (from Clean v4 dataset)
let p2ReformStatusChart=null, p2ReformSectorChart=null, p3PlannedVsActualChart=null, p3GapClosedTrendChart=null, p4PartnerTypeChart=null, p4TopPartnersChart=null;
let revMini, revArea, borrowStack, debtMini, debtMain, donutGap2;
let subsectorChart;

function destroyIf(x){ try{ x?.destroy(); }catch(e){} }

function fmtUsd(v){
  const n = Number(v||0);
  if (!isFinite(n)) return "0";
  return "US$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtCompactUsd(v){
  const n = Number(v||0);
  if (!isFinite(n)) return "US$0";
  const abs = Math.abs(n);
  const fmt = (x, suf) => {
    const s = (x).toFixed(1).replace(/\.0$/, "");
    return "US$" + s + suf;
  };
  if (abs >= 1e9) return fmt(n/1e9, "B");
  if (abs >= 1e6) return fmt(n/1e6, "M");
  if (abs >= 1e3) return fmt(n/1e3, "K");
  return "US$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}


const valueLabelPlugin = {
  id: "valueLabelPlugin",
  afterDatasetsDraw(chart, args, pluginOptions){
    const { ctx } = chart;
    const dataset = chart.data.datasets?.[0];
    if (!dataset) return;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#2b2447";
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      const v = dataset.data[i];
      const label = (pluginOptions?.formatter ? pluginOptions.formatter(v) : String(v));
      const x = bar.x + 8;
      const y = bar.y;
      ctx.fillText(label, x, y);
    });
    ctx.restore();
  }
};
try { Chart.register(valueLabelPlugin); } catch(e) {}

// Draw node labels on Sankey charts (chartjs-chart-sankey)

const sankeyNodeLabelPlugin = {
  id: "sankeyNodeLabelPlugin",
  afterDraw(chart){
    try{
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data?.datasets?.[0];
      const links = Array.isArray(dataset?.data) ? dataset.data : [];

      // Compute node throughput = max(inflow, outflow)
      const inflow = {};
      const outflow = {};
      links.forEach(l=>{
        const f = String(l.from);
        const t = String(l.to);
        const v = Number(l.flow||0);
        outflow[f] = (outflow[f]||0) + v;
        inflow[t]  = (inflow[t]||0) + v;
      });
      const totalOf = (name)=> Math.max(inflow[name]||0, outflow[name]||0);

      const fmt = (v)=>{
        try{ if (typeof fmtCompactUsd === "function") return fmtCompactUsd(v); }catch(e){}
        const n = Number(v||0);
        if (n>=1e12) return (n/1e12).toFixed(1)+"T";
        if (n>=1e9)  return (n/1e9).toFixed(1)+"B";
        if (n>=1e6)  return (n/1e6).toFixed(1)+"M";
        if (n>=1e3)  return (n/1e3).toFixed(1)+"K";
        return String(Math.round(n));
      };

      // Detect whether the sankey controller is already drawing node names via a formatter.
      // If yes, we only draw the VALUE (to avoid double name rendering).
      const hasBuiltInLabels = !!(chart?.options?.sankey?.node?.label?.formatter);

      // Get nodes from the controller (most reliable), else fall back to meta.data.
      const ctrl = meta?.controller;
      let nodes = ctrl?._nodes || ctrl?._cachedNodes || ctrl?.nodes || null;
      if (!nodes || !Array.isArray(nodes) || nodes.length===0){
        nodes = meta?.data || null;
      }
      if (!nodes || !Array.isArray(nodes) || nodes.length===0) return;

      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.fillStyle = "#2F2A4A";
      ctx.textBaseline = "middle";

      nodes.forEach(n=>{
        const name = String(n?.name ?? n?.key ?? n?.id ?? n?.$context?.raw?.name ?? n?.$context?.raw ?? "");
        if (!name) return;

        // Geometry across versions
        let left = Number.isFinite(n.x0) ? n.x0 : (Number.isFinite(n.x) && Number.isFinite(n.width) ? n.x - n.width/2 : null);
        let right = Number.isFinite(n.x1) ? n.x1 : (Number.isFinite(n.x) && Number.isFinite(n.width) ? n.x + n.width/2 : null);
        let top = Number.isFinite(n.y0) ? n.y0 : (Number.isFinite(n.y) && Number.isFinite(n.height) ? n.y - n.height/2 : null);
        let bottom = Number.isFinite(n.y1) ? n.y1 : (Number.isFinite(n.y) && Number.isFinite(n.height) ? n.y + n.height/2 : null);

        // Fallback for chart element form
        try{
          if ((left===null || right===null || top===null || bottom===null) && typeof n.getProps === "function"){
            const p = n.getProps(["x","y","width","height"], true);
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)){
              const w = Number(p.width||0), h = Number(p.height||0);
              left = p.x - w/2; right = p.x + w/2;
              top = p.y - h/2; bottom = p.y + h/2;
            }
          }
        }catch(e){}

        if (left===null || right===null || top===null || bottom===null) return;

        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;

        // keep text inside plot
        const safeX = Math.min(Math.max(cx, chartArea.left + 6), chartArea.right - 6);
        const safeY = Math.min(Math.max(cy, chartArea.top + 10), chartArea.bottom - 10);

        // alignment based on column
        let align = "center";
        let ax = safeX;
        if (left <= chartArea.left + 14){
          align = "left";
          ax = Math.min(left + 8, chartArea.right - 6);
        }else if (right >= chartArea.right - 14){
          align = "right";
          ax = Math.max(right - 8, chartArea.left + 6);
        }

        const val = fmt(totalOf(name));

        ctx.textAlign = align;

        if (hasBuiltInLabels){
          // Add value beneath the built-in name label
          ctx.font = "700 10px system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
          ctx.fillText(String(val), ax, safeY + 10);
        } else {
          // Draw combined label if no built-in labels exist
          ctx.font = "700 11px system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
          const label = `${name} — ${val}`;
          ctx.fillText(label, ax, safeY);
        }
      });

      ctx.restore();
    }catch(e){ /* no-op */ }
  }
};
try { Chart.register(sankeyNodeLabelPlugin); } catch(e) {}

// Prefer using the built-in sankey node label formatter (when available) so the
// label is guaranteed to render inside the nodes across plugin versions.
function sankeyNodeLabelWithValue(ctx){
  try{
    // chartjs-chart-sankey formatter signature varies by version.
    // It may pass a scriptable context, a node object, or just the node name string.
    const chart = ctx?.chart; // present when ctx is a scriptable context
    const links = (() => {
      const ds = chart?.data?.datasets?.[0];
      return Array.isArray(ds?.data) ? ds.data : [];
    })();

    const name = (() => {
      if (typeof ctx === 'string' || typeof ctx === 'number') return String(ctx);
      if (ctx?.name) return String(ctx.name);
      if (ctx?.raw?.name) return String(ctx.raw.name);
      if (ctx?.raw != null) return String(ctx.raw);
      if (ctx?.formattedValue != null) return String(ctx.formattedValue);
      return '';
    })();
    if (!name) return "";

    let inflow = 0, outflow = 0;
    // If links are not available via chart (older versions), try to read from a captured dataset reference
    const linkArr = links.length ? links : (Array.isArray(window.__lastSankeyLinks) ? window.__lastSankeyLinks : []);

    for (const l of linkArr){
      const f = String(l.from);
      const t = String(l.to);
      const v = Number(l.flow||0);
      if (f === name) outflow += v;
      if (t === name) inflow  += v;
    }
    const total = Math.max(inflow, outflow);

    const fmt = (v)=>{
      try{ if (typeof fmtCompactUsd === "function") return fmtCompactUsd(v); }catch(e){}
      const n = Number(v||0);
      if (n>=1e9) return (n/1e9).toFixed(1)+"B";
      if (n>=1e6) return (n/1e6).toFixed(1)+"M";
      if (n>=1e3) return (n/1e3).toFixed(1)+"K";
      return String(Math.round(n));
    };

    return `${name} — ${fmt(total)}`;
  }catch(e){
    return String(ctx?.raw?.name ?? ctx?.raw ?? "");
  }
}
function makeHBar(id, labels, data, title){
  const _el = $(id); if(!_el) return null;
  const ctx = $(id);
  return new Chart(ctx,{
    type:"bar",
    data:{ labels, datasets:[{ data, borderWidth:0 }] },
    options:{
      indexAxis:"y",
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        title:{display:!!title, text:title},
        tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } }
      },
      scales:{
        x:{ ticks:{ callback:(v)=> fmtUsd(v).replace("US$","") }, grid:{display:false} },
        y:{ grid:{display:false} }
      }
    }
  });
}
function makeYearBar(id, labels, data, selectedYearLabel, title){
  const _el = $(id); if(!_el) return null;
  const ctx = $(id);
  const sel = (selectedYearLabel && selectedYearLabel !== "ALL") ? String(selectedYearLabel) : null;
  const bg = (labels||[]).map(l => (sel && String(l)===sel) ? "rgba(96, 66, 220, 0.95)" : "rgba(96, 66, 220, 0.28)");
  const br = (labels||[]).map(l => (sel && String(l)===sel) ? "rgba(96, 66, 220, 1)" : "rgba(96, 66, 220, 0.4)");
  return new Chart(ctx,{
    type:"bar",
    data:{ labels, datasets:[{ data, backgroundColor:bg, borderColor:br, borderWidth:1, borderRadius:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        title:{display:!!title, text:title},
        tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } }
      },
      scales:{
        x:{ grid:{display:false} },
        y:{ grid:{display:false}, ticks:{ callback:(v)=> fmtUsd(v).replace("US$","") } }
      }
    }
  });
}

function makeDonut(id, labels, data, title){
  const _el = $(id); if(!_el) return null;
  const ctx = $(id);
  return new Chart(ctx,{
    type:"doughnut",
    data:{ labels, datasets:[{ data, borderWidth:0 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      cutout:"72%",
      plugins:{
        legend:{ position:"bottom" },
        title:{ display:!!title, text:title },
        tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${fmtUsd(c.raw)}` } }
      }
    }
  });
}


function makeBar(id, labels, data) {
  const _id = arguments[0];
  const _el = $(_id);
  if (!_el) { console.warn("Missing canvas:", _id); return null; }
  const ctx = $(id);
  if (!ctx) return null;
  return new Chart(ctx, {
    type:"bar",
    data:{ labels, datasets:[{ data, borderWidth:0 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{ grid:{display:false} }, y:{ grid:{display:false}, ticks:{display:false} } }
    }
  });
}
function makeLine(id, labels, data, title) {
  const _id = arguments[0];
  const _el = $(_id);
  if (!_el) { console.warn("Missing canvas:", _id); return null; }
  const ctx = $(id);
  if (!ctx) return null;
  return new Chart(ctx, {
    type:"line",
    data:{ labels, datasets:[{ data, fill:false, tension:.35, pointRadius:0, borderWidth:2 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        title:{display:!!title, text:title},
        tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } }
      },
      scales:{ x:{ grid:{display:false} }, y:{ grid:{display:false}, ticks:{ callback:(v)=> fmtUsd(v).replace("US$","") } } }
    }
  });
}


function openModal(id){ const el=$(id); if(!el) return; el.classList.add("show"); el.setAttribute("aria-hidden","false"); }
function closeModal(id){ const el=$(id); if(!el) return; el.classList.remove("show"); el.setAttribute("aria-hidden","true"); }

function makeBarBig(id, labels, data){
  const ctx = $(id);
  if (!ctx) return null;
  return new Chart(ctx, {
    type:"bar",
    data:{ labels, datasets:[{ data, borderWidth:0 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{ grid:{display:false} }, y:{ grid:{display:false} } }
    }
  });
}

async function openSubsectorDrilldown(mainSectorLabel){
  const f = currentOverviewFilters();
  // force sector to the clicked main sector
  const data = await apiGet({ action:"subsectors", year:f.year, state_name:f.state_name, sector_name:mainSectorLabel, source_name:f.source_name });
  const labels = (data||[]).map(x=>x.label);
  const values = (data||[]).map(x=>x.value);

  const _st = $("subsectorTitle"); if(_st) _st.textContent = `FINANCING BY SUB-SECTOR — ${mainSectorLabel}`;
  const _ss = $("subsectorSubtitle"); if(_ss) _ss.textContent = `Filtered by Year=${f.year}, State=${f.state_name}, Source=${f.source_name}`;

  destroyIf(subsectorChart);
  subsectorChart = makeBarBig("subsectorChart", labels, values);
  openModal("subsectorModal");
}


function makeDoughnut(id, pct) {
  const _id = arguments[0];
  const _el = $(_id);
  if (!_el) { console.warn("Missing canvas:", _id); return null; }
  const ctx = $(id);
  if (!ctx) return null;
  const p = Math.max(0, Math.min(100, Number(pct)||0));
  return new Chart(ctx, {
    type:"doughnut",
    data:{ labels:["Closed","Remaining"], datasets:[{ data:[p, 100-p], borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"78%", plugins:{ legend:{display:false} } }
  });
}

// -------- Filters --------
function currentOverviewFilters(){
  return {
    year: $("yearOv")?.value || "ALL",
    state_name: $("stateOv")?.value || "ALL",
    sector_name: $("sectorOv")?.value || "ALL",
    source_name: $("sourceOv")?.value || "ALL"
  };
}
function currentLandscapeFilters(){
  return {
    year: $("pYear")?.value || "ALL",
    state_name: $("pState")?.value || "ALL",
    sector_name: $("pSector")?.value || "ALL",
    source_name: $("pSource")?.value || "ALL"
  };
}
function currentGapFilters(){
  return {
    year: $("gYear")?.value || "ALL",
    state_name: $("gState")?.value || "ALL",
    sector_name: $("gSector")?.value || "ALL",
    source_name: "ALL"
  };
}

// -------- UI builders --------
function renderBySourceBars(bySourcePeriod){
  const box = $("bySourceBars");
  if (!box) return;
  box.innerHTML = "";
  let rows = bySourcePeriod?.rows || [];
  rows = rows.slice(0,6);
  const max = Math.max(1, ...rows.map(r => (Number(r.p1)||0)+(Number(r.p2)||0)));
  rows.forEach(r => {
    const a = (Number(r.p1)||0) / max * 100;
    const b = (Number(r.p2)||0) / max * 100;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">${r.label}</div>
      <div class="bar-track">
        <div class="bar-a" style="width:${a}%"></div>
        <div class="bar-b" style="width:${b}%"></div>
      </div>`;
    box.appendChild(row);
  });
  if (!rows.length) box.innerHTML = `<div class="muted-text">No source data</div>`;
}

function renderTreemap(items){
  const el = $("sectorTreemap");
  if (!el) return;
  const rows = (items || []).slice(0, 6);
  if (!rows.length){ el.innerHTML = "<div class='muted-text'>No sector data</div>"; return; }
  const colors = ["#8d7ddd","#45c6b9","#b695ff","#f0b35d","#63d7b8","#9f86ff"];
  el.innerHTML = "";
  rows.forEach((r,i)=>{
    const div=document.createElement("div");
    div.className="tcell";
    div.style.background = colors[i%colors.length];
    const pct = (r.pct==null) ? "" : `${Number(r.pct).toFixed(0)}%`;
    div.innerHTML = `<small>${r.label}</small><div>${pct}</div>`;
    div.setAttribute("data-sector-label", r.label);
    div.style.cursor = "pointer";
    div.addEventListener("click", ()=>openSubsectorDrilldown(r.label));
    el.appendChild(div);
  });
}


// ===== Animated Overview Map (Leaflet) =====
let __OV_MAP = null;
let __OV_MAP_TIMER = null;
async function initOverviewMap(){
  const el = document.getElementById("overviewMap");
  if (!el) return;
  if (typeof L === "undefined") return;
  if (__OV_MAP) return; // already initialized

  const mapData = await loadLocalJson_("data/overview_map.json");

  __OV_MAP = L.map("overviewMap", { zoomControl:true, attributionControl:true })
    .setView(mapData.center || [0,0], mapData.zoom || 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(__OV_MAP);

  const pts = Array.isArray(mapData.points) ? mapData.points : [];
  pts.forEach(p => {
    const cls = p.status === "high" ? "pulse-marker high" : "pulse-marker";
    const icon = L.divIcon({
      className: "",
      html: `<div class="${cls}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    const marker = L.marker([p.lat, p.lng], { icon }).addTo(__OV_MAP);
    marker.bindPopup(`
      <div style="min-width:180px">
        <div style="font-weight:700; margin-bottom:6px">${escapeHtml_(p.name)}</div>
        <div>Financing gap: <b>US$ ${(Number(p.gap_usd_m)||0).toFixed(1)}M</b></div>
        <div>Active projects: <b>${Number(p.projects)||0}</b></div>
      </div>
    `);
    marker.bindTooltip(`${escapeHtml_(p.name)}`, { permanent:true, direction:"top", className:"map-tooltip", offset:[0,-10] });
  });

  // gentle animation: cycle through points
  // if (pts.length > 1){
  //   let i = 0;
  //   __OV_MAP_TIMER = setInterval(() => {
  //     const p = pts[i % pts.length];
  //     __OV_MAP.flyTo([p.lat, p.lng], Math.max(mapData.zoom||6, 7), { duration: 1.2 });
  //     i++;
  //   }, 4500);
  // }
}

function partnerChips(rows){
  const el = $("partnersChips");
  if (!el) return;
  const items = (rows || []);
  el.innerHTML = items.map(r => {
    const label = (r && (r.partner_name || r.partner_id || r.name)) ? (r.partner_name || r.partner_id || r.name) : "Partner";
    return `<span class="chip">${label}</span>`;
  }).join("");
}

/**
 * Alerts (+ expandable).
 * If your sheet has few alerts, we show placeholders matching the PDF rows you circled.
 */
function ensureAlertPlaceholders(items){
  const titles = items.map(x => (x.title||x.message||"").toLowerCase());
  const need1 = !titles.some(t => t.includes("delayed data"));
  const need2 = !titles.some(t => t.includes("milestone") || t.includes("workshop"));
  const out = [...items];
  if (need1) out.push({ severity:"yellow", title:"5 MDAs with delayed data submission", details:"Add details in Content_Alerts sheet." });
  if (need2) out.push({ severity:"blue", title:"3 INFF review milestone workshop in 45 days", details:"Add details in Content_Alerts sheet." });
  return out;
}

function renderAlerts(rows){
  const el = $("alertsList");
  if (!el) return;
  let items = (rows || []).slice(0, 10);
  items = ensureAlertPlaceholders(items).slice(0, 10);

  const iconFor = (sev) => {
    const s = String(sev||"").toLowerCase();
    if (s.includes("high") || s.includes("red")) return ["red","!"];
    if (s.includes("med") || s.includes("yellow")) return ["yellow","⚠"];
    return ["blue","↺"];
  };

  el.innerHTML = items.map((r, idx)=>{
    const [cls,icon]=iconFor(r.severity || r.level || "info");
    const title = r.title || r.message || "Alert";
    const box = (t, p) => `
      <div class="alert-box">
        <h5>${t || ""}</h5>
        <p>${p || ""}</p>
      </div>`;
    const hasBoxes = (r.box1_title||r.box1_text||r.box2_title||r.box2_text||r.box3_title||r.box3_text||r.box4_title||r.box4_text);
    const fallback = r.details || r.description || r.content || "";
    const expanded = hasBoxes ? `
      <div class="alert-grid">
        ${box(r.box1_title, r.box1_text)}
        ${box(r.box2_title, r.box2_text)}
        ${box(r.box3_title, r.box3_text)}
        ${box(r.box4_title, r.box4_text)}
      </div>
    ` : `<div class="alert-grid">${box("Details", fallback)}${box("", "")}${box("", "")}${box("", "")}</div>`;

    return `
      <div class="alert" data-alert="${idx}">
        <div class="alert-top">
          <div class="alert-left">
            <div class="badge ${cls}">${icon}</div>
            <div class="alert-text">${title}</div>
          </div>
          <div class="plus" role="button" aria-label="Expand">+</div>
        </div>
        <div class="alert-expand">${expanded}</div>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".alert").forEach(card => {
    const btn = card.querySelector(".plus");
    btn?.addEventListener("click", () => card.classList.toggle("expanded"));
  });
}

function renderFeatured(rows){
  const el = $("featuredList");
  if (!el) return;
  const items = (rows || []).slice(0, 6);
  el.innerHTML = items.map(r=>{
    const img = r.image_url || r.img_url || "";
    const style = img ? `style="background-image:url('${img}');background-size:cover;background-position:center;"` : "";
    const text = r.summary || r.description || r.details || r.body || r.text || r.content || "";
    return `<div class="feature">
      <div class="feature-img" ${style}></div>
      <div class="feature-body">
        <div class="feature-title">${r.title || "Featured item"}</div>
        <p class="feature-text">${text}</p>
        ${r.cta_url ? `<a class="feature-link" href="${r.cta_url}" target="_blank" rel="noreferrer">LEARN MORE <span>→</span></a>` : ""}
      </div>
    </div>`;
  }).join("") || "<div class='muted-text'>No featured items</div>";
}

function renderPosts(rows){
  const el = $("postsList");
  if (!el) return;
  const items = (rows || []).slice(0, 10);
  el.innerHTML = items.map(r=>`
    <div class="post">
      <h4>${r.title || "Update"}</h4>
      <small>${r.publish_date || ""} • ${r.post_type || ""}</small>
      <div class="muted-text" style="margin-top:8px">${r.content || r.summary || r.description || ""}</div>
    </div>`).join("") || "<div class='muted-text'>No posts</div>";
}

function renderDownloads(rows){
  const el = $("downloadsList");
  if (!el) return;
  const items = (rows || []).slice(0, 20);
  el.innerHTML = items.map(r=>`
    <li><strong>${r.title || "File"}</strong> ${r.format ? `(${r.format})` : ""}
      ${r.file_url ? `— <a href="${r.file_url}" target="_blank" rel="noreferrer">download</a>` : ""}
    </li>`).join("") || "<li>No downloads</li>";
}

// -------- Pillar detail interactions --------
const pillarDetail = $("pillarDetail");
document.querySelectorAll("[data-open-pillar]").forEach(btn => {
  btn.addEventListener("click", async () => {
    pillarDetail.hidden = false;
    pillarDetail.scrollIntoView({ behavior:"smooth", block:"start" });

    const p = btn.getAttribute("data-open-pillar");
    const acc = document.getElementById("pillarAccordion");
    const soon = document.getElementById("pillarComingSoon");

    // Reset views
    if (soon) soon.hidden = true;
    hideAllPillarExtras_();

    // Headings per pillar (keep the same hero/design structure)
    const meta = {
      "1": {
        heading: "PILLAR 1: ASSESSMENTS AND DIAGNOSTICS",
        desc: "Diagnostics of financing landscape, gaps, and bottlenecks.",
        crumb: "Overview / Pillar 1 / Financing Landscape"
      },
      "2": {
        heading: "PILLAR 2: INTEGRATED FINANCING STRATEGY",
        desc: "Reform tracker and expected financing impact.",
        crumb: "Overview / Pillar 2 / Reform Tracker"
      },
      "3": {
        heading: "PILLAR 3: MONITORING, REVIEW & ACCOUNTABILITY",
        desc: "Progress against plans and financing gaps.",
        crumb: "Overview / Pillar 3 / Monitoring"
      },
      "4": {
        heading: "PILLAR 4: GOVERNANCE & COORDINATION",
        desc: "Partners and coordination signals.",
        crumb: "Overview / Pillar 4 / Partners"
      }
    }[p] || { heading:`PILLAR ${p}`, desc:"", crumb:`Overview / Pillar ${p}` };

    setText_("pillarBreadcrumb", meta.crumb);
    setText_("pillarHeading", meta.heading);
    setText_("pillarDesc", meta.desc);

    if (p === "1") {
      if (acc) acc.style.display = "";
    } else if (p === "2" || p === "3" || p === "4") {
      if (acc) acc.style.display = "none";
      try{
        await showPillarExtra_(p);
      }catch(e){
        console.error(e);
        if (soon) { soon.hidden = false; soon.textContent = e?.message || "Unable to load pillar visuals."; }
      }
    } else {
      if (acc) acc.style.display = "none";
      if (soon) { soon.hidden = false; soon.textContent = `Content for Pillar ${p} is not available.`; }
    }
  });
});


async function renderPillar2Extra_(){
  const v4 = await loadInffV4_();
  const reforms = v4?.REFORMS_DATA || [];

  // By status (counts)
  const byStatus = groupSumMap_(reforms, r => String(r.Status||"Unknown"), _ => 1);
  const statusPairs = Array.from(byStatus.entries()).sort((a,b)=>b[1]-a[1]);
  destroyIf(p2ReformStatusChart);
  p2ReformStatusChart = new Chart($("p2ReformStatus"), {
    type:"bar",
    data:{ labels: statusPairs.map(x=>x[0]), datasets:[{ data: statusPairs.map(x=>x[1]), borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ grid:{display:false} }, y:{ ticks:{ precision:0 } } } }
  });

  // By sector (top 10 counts)
  const bySector = groupSumMap_(reforms, r => String(r.Reform_Sector||"Unknown"), _ => 1);
  const topSector = topNFromMap_(bySector, 10);
  destroyIf(p2ReformSectorChart);
  p2ReformSectorChart = new Chart($("p2ReformSector"), {
    type:"bar",
    data:{ labels: topSector.map(x=>x[0]), datasets:[{ data: topSector.map(x=>x[1]), borderWidth:0 }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{ precision:0 } }, y:{ grid:{display:false} } } }
  });

  // Table
  const tbody = $("p2ReformTable")?.querySelector("tbody");
  if (tbody){
    tbody.innerHTML = reforms.slice(0,12).map(r=>{
      const risk = String(r.At_Risk_Flag||"").toLowerCase()==="yes" || String(r.At_Risk_Flag||"").toLowerCase()==="true" ? "Yes" : "No";
      return `<tr>
        <td>${escapeHtml_(r.Reform_Name||"—")}</td>
        <td>${escapeHtml_(r.Status||"—")}</td>
        <td>${risk}</td>
        <td>${escapeHtml_(r.Owner_MDA||"—")}</td>
        <td>${escapeHtml_((r.Start_Date||"").toString().slice(0,10) || "—")}</td>
        <td>${escapeHtml_((r.End_Date||"").toString().slice(0,10) || "—")}</td>
      </tr>`;
    }).join("");
  }
}

function currentV4FiltersFromOverview_(){
  return {
    fYear: $("yearOv")?.value || "ALL",
    fSector: $("sectorOv")?.value || "ALL",
    fSource: $("sourceOv")?.value || "ALL",
    fState: $("stateOv")?.value || "ALL",
  };
}
function applyV4FinFilters_(rows, {fYear,fSector,fSource,fState}, ignoreYear=false){
  return (rows||[]).filter(r=>{
    if (!ignoreYear && fYear !== "ALL" && String(r.Year) !== String(fYear)) return false;
    if (fSector !== "ALL" && String(r.Sector) !== String(fSector)) return false;
    if (fSource !== "ALL" && String(r.Financing_Source) !== String(fSource)) return false;
    if (fState !== "ALL" && String(r.State) !== String(fState)) return false;
    return true;
  });
}

async function renderPillar3Extra_(){
  const v4 = await loadInffV4_();
  const finAll = v4?.FINANCING_DATA || [];
  const filters = currentV4FiltersFromOverview_();
  const finForTrend = applyV4FinFilters_(finAll, { ...filters, fYear:"ALL" }, true);

  const years = uniq_(finForTrend.map(r=>String(r.Year))).sort((a,b)=>Number(a)-Number(b));
  const byYearActual = groupSumMap_(finForTrend, r=>String(r.Year), r=>parseNum_(r.Actual_Amount_USD));
  const byYearPlanned = groupSumMap_(finForTrend, r=>String(r.Year), r=>parseNum_(r.Planned_Amount_USD));

  destroyIf(p3PlannedVsActualChart);
  p3PlannedVsActualChart = new Chart($("p3PlannedVsActual"), {
    type:"line",
    data:{ labels: years, datasets:[
      { label:"Planned (USD)", data: years.map(y=>byYearPlanned.get(y)||0), borderWidth:3, tension:0.3, fill:false },
      { label:"Actual (USD)", data: years.map(y=>byYearActual.get(y)||0), borderWidth:3, tension:0.3, fill:false },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" }, tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${fmtUsd(c.raw)}` } } }, scales:{ x:{ grid:{display:false} }, y:{ ticks:{ callback:(v)=> fmtUsd(v).replace("US$","") } } } }
  });

  const requiredByYear = groupSumMap_(finForTrend, r=>String(r.Year), r=>parseNum_(r.Required_Amount_USD));
  const pct = years.map(y=>{
    const req = requiredByYear.get(y)||0;
    const act = byYearActual.get(y)||0;
    return req>0 ? (act/req*100) : 0;
  });

  destroyIf(p3GapClosedTrendChart);
  p3GapClosedTrendChart = new Chart($("p3GapClosedTrend"), {
    type:"line",
    data:{ labels: years, datasets:[{ label:"% gap closed", data: pct, borderWidth:3, tension:0.3, fill:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(c)=> `${Number(c.raw||0).toFixed(1)}%` } } }, scales:{ x:{ grid:{display:false} }, y:{ beginAtZero:true, ticks:{ callback:(v)=> v + "%" } } } }
  });
}

async function renderPillar4Extra_(){
  const v4 = await loadInffV4_();
  const partners = v4?.PARTNERS_DATA || [];

  const byType = groupSumMap_(partners, r=>String(r.Partner_Type||"Unknown"), r=>parseNum_(r.Contribution_USD));
  const typePairs = Array.from(byType.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);

  destroyIf(p4PartnerTypeChart);
  p4PartnerTypeChart = new Chart($("p4PartnerType"), {
    type:"doughnut",
    data:{ labels: typePairs.map(x=>x[0]), datasets:[{ data: typePairs.map(x=>x[1]), borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10 } }, tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${fmtUsd(c.raw)}` } } } }
  });

  const topPartners = (partners||[]).map(p=>[p.Partner_Name||"Unknown", parseNum_(p.Contribution_USD)]).sort((a,b)=>b[1]-a[1]).slice(0,10);

  destroyIf(p4TopPartnersChart);
  p4TopPartnersChart = new Chart($("p4TopPartners"), {
    type:"bar",
    data:{ labels: topPartners.map(x=>x[0]), datasets:[{ data: topPartners.map(x=>x[1]), borderWidth:0 }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } }, valueLabelPlugin:{ formatter:(v)=> fmtCompactUsd(v).replace("US$","") } }, scales:{ x:{ ticks:{ callback:(v)=> fmtUsd(v).replace("US$","") } }, y:{ grid:{display:false} } } }
  });
}

function hideAllPillarExtras_(){
  const wrap = $("pillarExtras"); if (wrap) wrap.hidden = true;
  ["pillar2Extra","pillar3Extra","pillar4Extra"].forEach(id=>{ const el=$(id); if(el) el.hidden=true; });
}

async function showPillarExtra_(p){
  const wrap = $("pillarExtras"); if (wrap) wrap.hidden = false;
  hideAllPillarExtras_();
  if (wrap) wrap.hidden = false;

  if (p==="2"){ $("pillar2Extra").hidden=false; await renderPillar2Extra_(); }
  if (p==="3"){ $("pillar3Extra").hidden=false; await renderPillar3Extra_(); }
  if (p==="4"){ $("pillar4Extra").hidden=false; await renderPillar4Extra_(); }
}


function initLandscapeChartsFrom(charts){
  // Use existing charts payload so canvases are never empty.
  // Domestic borrowing is rendered separately from its own JSON (see initExtraLandscapeCharts_).
  destroyIf(borrowStack);
}

function initGapChartsFrom(charts, pct){
  destroyIf(debtMini); destroyIf(debtMain); destroyIf(donutGap2);
  const trend = charts?.gap_closed_trend || {labels:["2021","2022","2023"], values:[40,55,60]};
  const gapUsd = charts?.gap_trend_usd || {labels:trend.labels, values:trend.values.map(v=>v)};
  debtMini = makeLine("debtMini", trend.labels, trend.values, "Gap closed (%) trend");
  const gsec = (charts?.gap_by_sector||[]).slice(0,10);
  if (gsec.length) debtMain = makeHBar("debtMain", gsec.map(r=>r.label), gsec.map(r=>r.value), "Gap by sector (Top 10)");
  else debtMain = makeLine("debtMain", gapUsd.labels, gapUsd.values, "Financing gap (USD) trend");
  donutGap2 = makeDoughnut("donutGap2", pct || 72);
  const gap2 = $("gap2pct"); if (gap2) gap2.textContent = `${Number(pct||72).toFixed(0)}%`;
}

async function refreshLandscape(){
  const f = currentLandscapeFilters();
  setStatus("statusLandscape","Loading…");
  const [overview, charts] = await Promise.all([
    apiGet({ action:"overview", ...f }),
    apiGet({ action:"charts", ...f })
  ]);
  initLandscapeChartsFrom(charts);
  if (!window.API_URL) initExtraLandscapeCharts_();
  setStatus("statusLandscape","");
}

async function refreshGap(){
  const f = currentGapFilters();
  setStatus("statusGap","Loading…");
  const [overview, charts] = await Promise.all([
    apiGet({ action:"overview", ...f }),
    apiGet({ action:"charts", ...f })
  ]);
  initGapChartsFrom(charts, overview?.target_achieved_pct);
  if (!window.API_URL) initExtraGapCharts_();
  setStatus("statusGap","");
}

document.querySelectorAll(".acc-head").forEach(head => {
  head.addEventListener("click", async () => {
    const key = head.getAttribute("data-acc");
    const map = { landscape:"accLandscape", gap:"accGap" };
    const bodyId = map[key];
    if (!bodyId) return;
    const body = $(bodyId);
    const open = !body.hidden;
    body.hidden = open;
    head.querySelector(".acc-icon").textContent = open ? "+" : "−";

    // When opening, initialize charts so Chart.js measures visible canvases
    if (!open) {
      try{
        if (key === "landscape") await refreshLandscape();
        if (key === "gap") await refreshGap();
      }catch(e){
        if (key === "landscape") setStatus("statusLandscape", e.message);
        if (key === "gap") setStatus("statusGap", e.message);
      }
    }
  });
});

document.querySelectorAll("[data-pillar-tab]").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll("[data-pillar-tab]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
  });
});

$("applyLandscape")?.addEventListener("click", () => refreshLandscape().catch(err => setStatus("statusLandscape", err.message)));
$("applyGap")?.addEventListener("click", () => refreshGap().catch(err => setStatus("statusGap", err.message)));

// -------- Overview refresh --------
async function refreshOverview(){
  const f = currentOverviewFilters();
  setStatus("statusOverview","Loading…");

  const [overview, charts, alerts, featured, partners] = await Promise.all([
    apiGet({ action:"overview", ...f }),
    apiGet({ action:"charts", ...f }),
    apiGet({ action:"alerts", ...f }),
    apiGet({ action:"featured", ...f }),
    apiGet({ action:"partners", ...f }),
  ]);

  setText_("kpiTotal", fmtBigUsd(overview.total_financing_mobilised_usd));
  setText_("kpiGap", fmtBigUsd(overview.estimated_financing_gap_usd));
  const pct = overview.target_achieved_pct;
  const _kpiClosed = $("kpiClosed") || $("kpiGapClosedPct");
  if (_kpiClosed) _kpiClosed.textContent = (pct==null) ? "—%" : `${Number(pct).toFixed(0)}%`;
  setText_("kpiGapClosedPct", (pct==null) ? "—%" : `${Number(pct).toFixed(0)}%`);
  setText_("kpiReforms", (overview.active_reforms ?? "—"));
  setText_("kpiPartners", (partners?.count ?? "—"));
  partnerChips(partners?.items || partners?.top || []);
  if (overview.last_updated) setText_("lastUpdated", `Last updated: ${overview.last_updated}`);

  destroyIf(miniFinancing); destroyIf(donutGap);
  miniFinancing = makeYearBar("miniFinancing", charts?.by_year?.labels || [], charts?.by_year?.values || [], f.year, "");
  donutGap = makeDoughnut("donutGap", pct || 0);

  renderBySourceBars(charts?.by_source_period || {rows:[]});
  renderTreemap(charts?.by_sector_share || []);
  renderAlerts(alerts);
  renderFeatured(featured);

  try{
    destroyIf(ts1); destroyIf(ts2);
    ts1 = makeYearBar("ts1", charts?.by_year?.labels || [], charts?.by_year?.values || [], f.year, "Total financing mobilised (USD)");
    const sec = (charts?.by_sector_share||[]).slice(0,10);
    ts2 = makeHBar("ts2", sec.map(r=>r.label), sec.map(r=>r.value), "Financing by sector (Top 10)");
  }catch(e){}

  setStatus("statusOverview","");
}

$("applyOverview")?.addEventListener("click", () => refreshOverview().catch(err => setStatus("statusOverview", err.message)));

// -------- Init --------
(async function init(){
  try{ await loadAllData_(); }catch(e){ console.error(e); }
try{
    const filters = await apiGet({ action:"filters" });

    // Overview filter bar
    fillSelect("yearOv", (filters.years||[]).map(String));
    fillSelect("stateOv", (filters.states||[]).map(String));
    fillSelect("sectorOv", (filters.sectors||[]).map(String));
    fillSelect("sourceOv", (filters.sources||[]).map(String));
    $("yearOv").value = (filters.years||[]).slice(-1)?.[0] ?? "ALL";
    $("stateOv").value = "ALL"; $("sectorOv").value = "ALL"; $("sourceOv").value = "ALL";

    // Pillar accordion filters (landscape)
    fillSelect("pYear", (filters.years||[]).map(String));
    fillSelect("pState", (filters.states||[]).map(String));
    fillSelect("pSector", (filters.sectors||[]).map(String));
    fillSelect("pSource", (filters.sources||[]).map(String));
    $("pYear").value = (filters.years||[]).slice(-1)?.[0] ?? "ALL";
    $("pState").value = "ALL"; $("pSector").value = "ALL"; $("pSource").value = "ALL";

    // Gap filters
    fillSelect("gYear", (filters.years||[]).map(String));
    fillSelect("gState", (filters.states||[]).map(String));
    fillSelect("gSector", (filters.sectors||[]).map(String));
    $("gYear").value = (filters.years||[]).slice(-1)?.[0] ?? "ALL";
    $("gState").value = "ALL"; $("gSector").value = "ALL";

    const [posts, downloads] = await Promise.all([
      apiGet({ action:"posts" }),
      apiGet({ action:"downloads" })
    ]);
    renderPosts(posts);
    renderDownloads(downloads);

  // Auto-apply filters (no Apply button)
const autoOverview = debounce_(refreshOverview, 120);
["yearOv","stateOv","sectorOv","sourceOv"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("change", autoOverview); });

const autoLandscape = debounce_(refreshLandscape, 120);
["pYear","pState","pSector","pSource"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("change", autoLandscape); });

const autoGap = debounce_(refreshGap, 120);
["gYear","gState","gSector"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("change", autoGap); });

// Reset buttons

const resetOverview = $("resetOverview");
if (resetOverview) resetOverview.addEventListener("click", ()=>{
  setSelect_("yearOv", "ALL");
  setSelect_("stateOv", "ALL");
  setSelect_("sectorOv", "ALL");
  setSelect_("sourceOv", "ALL");
  refreshOverview();
});

const resetLandscape = $("resetLandscape");
if (resetLandscape) resetLandscape.addEventListener("click", ()=>{
  setSelect_("pYear", "ALL");
  setSelect_("pState", "ALL");
  setSelect_("pSector", "ALL");
  setSelect_("pSource", "ALL");
  refreshLandscape();
});

const resetGap = $("resetGap");
if (resetGap) resetGap.addEventListener("click", ()=>{
  setSelect_("gYear", "ALL");
  setSelect_("gState", "ALL");
  setSelect_("gSector", "ALL");
  refreshGap();
});

  await refreshOverview();
  try{ await initOverviewMap(); }catch(e){ console.warn('overview map init failed', e); }
  }catch(err){
    setStatus("statusOverview", err.message);
  }
})();


/* -------- Export chart as PNG -------- */
function exportCanvasPng(canvasId){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `${canvasId}_${ts}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".chart-download");
  if (!btn) return;
  const id = btn.getAttribute("data-export-target");
  exportCanvasPng(id);
});

// Modal close wiring
document.addEventListener("click", (e)=>{
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute("data-close")==="1") closeModal("subsectorModal");
});
$("closeSubsector")?.addEventListener("click", ()=>closeModal("subsectorModal"));



// Draw the year label once per group of bars (e.g., 5 categories per year)
function yearGroupLabelPlugin_(yearsArr, groupSize){
  return {
    id: "yearGroupLabelPlugin",
    afterDraw(chart){
      const {ctx, chartArea, scales} = chart;
      const xScale = scales.x;
      if (!xScale) return;
      ctx.save();
      ctx.fillStyle = "#6F6885";
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      yearsArr.forEach((year, yIndex)=>{
        const startIndex = yIndex * groupSize;
        const endIndex = startIndex + groupSize - 1;
        const x1 = xScale.getPixelForValue(startIndex);
        const x2 = xScale.getPixelForValue(endIndex);
        const xCenter = (x1 + x2) / 2;
        const yPos = chartArea.bottom + 22;
        ctx.fillText(String(year), xCenter, yPos);
      });
      ctx.restore();
    }
  };
}

function initExtraLandscapeCharts_(){
  // ===== REVENUE (layout like provided screenshot) =====
  try{
    destroyIf(window.__revDonut);
    destroyIf(window.__revMiniBars);
    destroyIf(window.__revSankey);

    const rev = (__DATA.revenue||[]).slice();
    const dash = __DATA.revenue_dashboard || {};

    // Determine which fields represent Tax vs Non‑Tax
    const taxKeys = dash?.totalRevenue?.taxKeys || ["VAT","CIT","PIT + Other Taxes"];
    const nonTaxKeys = dash?.totalRevenue?.nonTaxKeys || ["Non-Tax Revenues","Oil & Gas"];
    const highlightYear = Number(dash?.totalRevenue?.highlightYear || (rev[rev.length-1]?.Year) || 2025);

    const rowY = rev.find(r=>Number(r.Year)===highlightYear) || rev[rev.length-1] || {Year:highlightYear};
    const tax = taxKeys.reduce((a,k)=>a+Number(rowY?.[k]||0),0);
    const nonTax = nonTaxKeys.reduce((a,k)=>a+Number(rowY?.[k]||0),0);
    const total = tax + nonTax;

    setText_("revTotalBig", fmtBigUsd(total));
    setText_("revTotalYear", String(rowY?.Year || highlightYear));

    // Donut: Tax vs Non‑Tax
    const donutCtx = $("revDonut");
    if (donutCtx){
      window.__revDonut = new Chart(donutCtx,{
        type:"doughnut",
        data:{
          labels:["Tax Revenue","Non‑Tax Revenue"],
          datasets:[{
            data:[tax, nonTax],
            backgroundColor:["#5B3FFF","#F2D24B"],
            borderWidth:0,
            spacing:2,
            hoverOffset:4,
            borderRadius:10
          }]
        },
        options:{ responsive:true, maintainAspectRatio:false, cutout:"70%", rotation:-90,
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${fmtUsd(c.raw)}` } } }
        }
      });
    }

    // Mini bars: Tax vs Non‑Tax trend (last 4 years)
    const yearsAll = rev.map(r=>Number(r.Year)).filter(n=>Number.isFinite(n));
    const lastYears = yearsAll.slice(-4);
    const series = lastYears.map(y=>{
      const rr = rev.find(r=>Number(r.Year)===y) || {};
      return {
        y,
        tax: taxKeys.reduce((a,k)=>a+Number(rr?.[k]||0),0),
        nonTax: nonTaxKeys.reduce((a,k)=>a+Number(rr?.[k]||0),0),
      };
    });

    const miniCtx = $("revMiniBars");
    if (miniCtx){
      window.__revMiniBars = new Chart(miniCtx,{
        type:"bar",
        data:{
          labels: series.map(s=>String(s.y)),
          datasets:[
            { label:"Tax Revenue", data: series.map(s=>s.tax), backgroundColor:"#5B3FFF", borderWidth:0, borderRadius:10, borderSkipped:false, barThickness:14 },
            { label:"Non‑Tax Revenue", data: series.map(s=>s.nonTax), backgroundColor:"#F6D58A", borderWidth:0, borderRadius:10, borderSkipped:false, barThickness:14 }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false,
          layout:{ padding:{ bottom: 24 } },
          plugins:{ legend:{ display:false }, title:{ display:false } },
          scales:{
            x:{ grid:{display:false}, ticks:{ color:"#9A93AF", font:{ weight:"600" } } },
            y:{ beginAtZero:true, grid:{ color:"rgba(120,110,160,0.12)" }, ticks:{ display:false }, border:{ display:false } }
          }
        }
      });
    }

    // Oil/Gas/Natural resources capsule bars (like screenshot)
    const pills = dash?.oilGasBreakdown || [];
    const pillWrap = $("revOilPills");
    if (pillWrap){
      const items = (pills.length ? pills : [
        { label:"Dividends", value_usd: 34_200_000_000, color:"#8B7AF6" },
        { label:"Dividends", value_usd: 34_200_000_000, color:"#57C7B8" },
        { label:"Dividends", value_usd: 34_200_000_000, color:"#B79BFF" },
        { label:"Dividends", value_usd: 34_200_000_000, color:"#F4B34F" },
        { label:"Dividends", value_usd: 34_200_000_000, color:"#7BE1B2" }
      ]);

      const maxV = Math.max(1, ...items.map(it=>Number(it.value_usd||0)));
      const hMin = 74, hMax = 150;

      pillWrap.innerHTML = items.map((it, idx)=>{
        const v = Number(it.value_usd||0);
        const h = Math.round(hMin + (hMax-hMin) * (v/maxV));
        const col = it.color || ["#8B7AF6","#57C7B8","#B79BFF","#F4B34F","#7BE1B2"][idx % 5];
        return `<div class="rev-cap-wrap">
          <div class="rev-cap-side">${escapeHtml_(it.label||"")}</div>
          <div class="rev-cap" style="height:${h}px;background:${col};">
            <div class="rev-cap-value">${fmtBigUsd(v)}</div>
          </div>
        </div>`;
      }).join("");
    }

    // Sankey: Revenue flows (toggle between bySector / bySource)
    const flows = dash?.revenueFlows || {};
    const bySector = flows?.bySector?.links || [];
    const bySource = flows?.bySource?.links || [];

    const sankeyCtx = $("revSankey");
    const toggle = $("revFlowToggle");
    const getLinks = ()=> (toggle?.checked ? bySector : bySource);

    
    const buildSankeyData = (links)=>{
      // chartjs-chart-sankey expects [{from,to,flow}, ...]
      const cleaned = (links||[]).map(l=>({ from:String(l.from), to:String(l.to), flow:Number(l.flow||0) }))
        .filter(x=>x.from && x.to && Number.isFinite(x.flow) && x.flow>0);

      // Add a single TOTAL node on the far-left (like Financing By Instrument & Sector)
      // Determine first-layer nodes (nodes that only appear as "from", not as "to")
      const toSet = new Set(cleaned.map(x=>x.to));
      const firstLayer = [...new Set(cleaned.map(x=>x.from))].filter(n=>!toSet.has(n) && n!=="TOTAL");

      const sums = {};
      cleaned.forEach(x=>{ sums[x.from] = (sums[x.from]||0) + x.flow; });

      const totalLinks = firstLayer.map(n=>({ from:"TOTAL", to:n, flow:Number(sums[n]||0) })).filter(x=>x.flow>0);

      return totalLinks.concat(cleaned);
    };


    const sankeyReady = !!(Chart?.registry?.getController?.("sankey") || Chart?.controllers?.sankey);
    if (sankeyCtx && sankeyReady){
      // Fallback for plugin versions where the node label formatter does not receive chart context
      window.__lastSankeyLinks = buildSankeyData(getLinks());
      window.__revSankey = new Chart(sankeyCtx,{
        type:"sankey",
        data:{ datasets:[{ data: buildSankeyData(getLinks()), colorFrom:"rgba(106,76,255,.55)", colorTo:"rgba(244,200,75,.55)", colorMode:"gradient" }] },
        options:{ responsive:true, maintainAspectRatio:false,
          layout:{ padding:{ bottom: 24 } },
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=>{
            const d = ctx.raw || {}; return `${d.from} → ${d.to}: ${fmtCompactUsd(Number(d.flow||0))}`;
          } } } },
          sankey:{ node:{ width: 14, padding: 12,
            label:{ display:true, font:{ size: 10 }, formatter: sankeyNodeLabelWithValue }
          } }
        }
      });
      if (toggle){
        toggle.addEventListener("change", ()=>{
          const ds = window.__revSankey?.data?.datasets?.[0];
          if (!ds) return;
          ds.data = buildSankeyData(getLinks());
          window.__lastSankeyLinks = ds.data;
          window.__revSankey.update();
        }, { passive:true });
      }
    }else{
      // If the sankey controller isn't available (e.g., CDN blocked), show a graceful message.
      const parent = sankeyCtx?.parentElement;
      if (parent) parent.innerHTML = `<div class="muted-text">Revenue flows chart requires the sankey plugin (chartjs-chart-sankey). If you are offline, please host the plugin locally.</div>`;
    }

  }catch(e){ console.warn("Revenue render error", e); }

  
  // ===== DOMESTIC BORROWING (grouped bars + tiles, toggle by sector) =====
  try{
    destroyIf(window.__domBorrowBars);
    const payload = __DATA.domestic_borrowing;
    const toggle = $("borrowToggle");
    const barCtx = $("domBorrowBars");
    const tilesEl = $("domBorrowTiles");
    if (!payload || !barCtx || !tilesEl) throw new Error("Domestic borrowing elements/data missing");

    const catColors = {
      "Treasury Bills": "#7E6AE6",
      "Commercial Loan": "#4DB6AC",
      "Sukuk": "#B79BFF",
      "Bond": "#F2B24C",
      "Other": "#6FD1A8"
    };
    const sectorPalette = ["#7E6AE6","#4DB6AC","#B79BFF","#F2B24C","#6FD1A8","#5B3FFF","#86C6FF","#FF8FB1","#7DCBFF","#FFB26B"];

    const getMode = ()=> (toggle?.checked ? "by_sector" : "national");

    const buildDatasets = (modeKey)=>{
      const rows = payload?.[modeKey]?.bars || [];
      const years = (payload?.meta?.years || []).map(String);
      const list = (modeKey === "national")
        ? (payload?.meta?.categories || ["Treasury Bills","Commercial Loan","Sukuk","Bond","Other"])
        : (payload?.meta?.sectors || []);

      const datasets = list.map((name, idx)=>{
        const data = years.map(y=>{
          if (modeKey === "national"){
            return Number(rows.find(r=>String(r.year)===String(y) && String(r.category)===String(name))?.value_usd || 0);
          }
          return Number(rows.find(r=>String(r.year)===String(y) && String(r.sector)===String(name))?.value_usd || 0);
        });

        const color = (modeKey === "national")
          ? (catColors[name] || "#6A4CFF")
          : sectorPalette[idx % sectorPalette.length];

        return {
          label: String(name),
          data,
          backgroundColor: color,
          borderWidth: 0,
          borderRadius: 12,
          borderSkipped: false,
	          // Avoid fixed barThickness (it prevents group spacing controls from working).
	          // Use maxBarThickness so we can increase bar width while still keeping gaps.
	          maxBarThickness: (list.length > 10 ? 14 : 22)
        };
      });

      return { years, datasets, listLen: list.length };
    };

    const renderTiles = (modeKey)=>{
      const limit = (modeKey === "national") ? 5 : 12;
      const tiles = (payload?.[modeKey]?.tiles || []).slice(0, limit);
      tilesEl.innerHTML = tiles.map((t, idx)=>{
        const v = Number(t.value_usd||0);
        const label = String(t.label||"").trim();
        const bg = t.color || (modeKey === "national" ? (catColors[label] || "#7E6AE6") : sectorPalette[idx % sectorPalette.length]);
        const cls = `db-tile i${idx}`;
        return `<div class="${cls}" style="background:${bg}">
          <div class="tval">${v>0 ? fmtBigUsd(v) : ""}</div>
          <div class="tlabel">${escapeHtml_(label)}</div>
        </div>`;
      }).join("");
    };

    const renderMode = ()=>{
      const mode = getMode();
      const { years, datasets, listLen } = buildDatasets(mode);

      const localPlugins = [];

      window.__domBorrowBars = new Chart(barCtx,{
        plugins: localPlugins,
        type:"bar",
        data:{ labels: years, datasets },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          layout:{ padding:{ bottom: 8 } },
          plugins:{
            legend:{
              display:true,
              position:"bottom",
              align:"start",
              labels:{
                boxWidth:12,
                boxHeight:12,
                usePointStyle:true,
                pointStyle:"rectRounded",
                padding:16,
                color:"#2F2A4A",
                font:{ size:11, weight:"600" }
              }
            },
            tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${fmtUsd(c.raw)}` } }
          },
          datasets:{
            bar:{
              // spacing similar to "Earmarked funds" (grouped bars with gaps)
	              // Wider bars + clearer gaps within each year group
	              categoryPercentage: 0.85,
	              barPercentage: 0.60
            }
          },
          scales:{
            x:{
              grid:{ display:false },
              ticks:{ color:"#6F6885", font:{ weight:"600" } }
            },
            y:{
              beginAtZero:true,
              grid:{ color:"rgba(120,110,160,0.12)" },
              ticks:{ display:false },
              border:{ display:false }
            }
          }
        }
      });

      renderTiles(mode);
    };

    renderMode();
    if (toggle){
      toggle.addEventListener("change", ()=>{
        destroyIf(window.__domBorrowBars);
        renderMode();
      }, { passive:true });
    }
  }catch(e){ console.warn("Domestic borrowing render error", e); }
// STATE OWNED ENTERPRISES AND PUBLIC ENTITIES (grouped bars by year)
  try{
    destroyIf(window.__soeBars);
    const ctx = $("bubble"); // keep existing canvas id
    const payload = __DATA.soe;
    if (!ctx || !payload) throw new Error("SOE elements/data missing");

    // Expected payload shape:
    // { meta:{ years:[...], categories:[...] }, bars:[{year, category, value_usd}] }
    const years = (payload?.meta?.years || []).map(String);
    const cats = (payload?.meta?.categories || ["Retained Earnings","Transfers to CRF","Operating Surplus","Dividends"]).map(String);
    const rows = payload?.bars || [];

    const catColors = {
      "Retained Earnings": "#7E6AE6",
      "Transfers to CRF": "#4DB6AC",
      "Operating Surplus": "#B79BFF",
      "Dividends": "#F2B24C"
    };
    const palette = ["#7E6AE6","#4DB6AC","#B79BFF","#F2B24C","#6FD1A8","#5B3FFF","#86C6FF","#FF8FB1"];

    const datasets = cats.map((name, idx)=>{
      const data = years.map(y => Number(rows.find(r=>String(r.year)===String(y) && String(r.category)===String(name))?.value_usd || 0));
      return {
        label: name,
        data,
        backgroundColor: catColors[name] || palette[idx % palette.length],
        borderWidth: 0,
        borderRadius: 12,
        borderSkipped: false,
        maxBarThickness: (cats.length > 8 ? 14 : 22)
      };
    });

    window.__soeBars = new Chart(ctx,{
      type:"bar",
      data:{ labels: years, datasets },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        layout:{ padding:{ bottom: 8 } },
        plugins:{
          legend:{
            display:true,
            position:"bottom",
            align:"start",
            labels:{
              boxWidth:12,
              boxHeight:12,
              usePointStyle:true,
              pointStyle:"rectRounded",
              padding:16,
              color:"#2F2A4A",
              font:{ size:11, weight:"600" }
            }
          },
          tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${fmtUsd(c.raw)}` } }
        },
        datasets:{
          bar:{
            categoryPercentage: 0.85,
            barPercentage: 0.60
          }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ color:"#6F6885", font:{ weight:"600" } } },
          y:{ beginAtZero:true, grid:{ color:"rgba(120,110,160,0.12)" }, ticks:{ display:false }, border:{ display:false } }
        }
      }
    });
  }catch(e){ console.warn("SOE render error", e); }


  // EARMARKED FUNDS AND SPECIAL ACCOUNTS (toggle: national vs by sector)
  try{
    const ctx = $("earmarked");
    if (!ctx) throw new Error("Earmarked canvas missing");

    const palette = ["#7E6AE6","#4DB6AC","#B79BFF","#F2B24C","#6FD1A8","#5B3FFF","#86C6FF","#FF8FB1","#7DCBFF","#FFB26B","#A0E7E5","#FFAEBC"];

    function rowsToGroupedBar_(rows){
      const years = (rows||[]).map(r=>String(r.Year));
      const keys = Object.keys((rows||[])[0]||{}).filter(k=>k!=="Year");
      const datasets = keys.map((k, idx)=>({
        label: k,
        data: (rows||[]).map(r=>Number(r[k]||0)),
        backgroundColor: palette[idx % palette.length],
        borderWidth: 0,
        borderRadius: 12,
        borderSkipped: false,
        maxBarThickness: (keys.length > 10 ? 12 : 18)
      }));
      return { years, datasets };
    }

    function renderEarmarked_(mode){
      destroyIf(window.__earmarked);
      const rows = (mode === "sector" ? (__DATA.earmarked_sector || __DATA.earmarked) : __DATA.earmarked);
      if (!(rows && rows.length)) throw new Error("Earmarked data missing");
      const { years, datasets } = rowsToGroupedBar_(rows);

      window.__earmarked = new Chart(ctx,{
        type:"bar",
        data:{ labels: years, datasets },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          layout:{ padding:{ bottom: 8 } },
          plugins:{
            legend:{
              display:true,
              position:"bottom",
              align:"start",
              labels:{
                boxWidth:12,
                boxHeight:12,
                usePointStyle:true,
                pointStyle:"rectRounded",
                padding:16,
                color:"#2F2A4A",
                font:{ size:11, weight:"600" }
              }
            },
            tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${fmtUsd(c.raw)}` } }
          },
          datasets:{
            bar:{
              categoryPercentage: 0.85,
              barPercentage: 0.60
            }
          },
          scales:{
            x:{ grid:{ display:false }, ticks:{ color:"#6F6885", font:{ weight:"600" } } },
            y:{ beginAtZero:true, grid:{ color:"rgba(120,110,160,0.12)" }, ticks:{ display:false }, border:{ display:false } }
          }
        }
      });
    }

    // Initial render (toggle off = national)
    const t = $("earmarkedToggle");
    const mode = (t && t.checked) ? "sector" : "national";
    renderEarmarked_(mode);

    if (t && !window.__earmarkedToggleBound){
      window.__earmarkedToggleBound = true;
      t.addEventListener("change", ()=>{
        try{ renderEarmarked_(t.checked ? "sector" : "national"); }catch(e){ console.warn("Earmarked toggle render error", e); }
      });
    }
  }catch(e){ console.warn("Earmarked render error", e); }


  // PUBLIC PENSION AND SOCIAL SECURITY FUNDS (grouped bars by year + donut composition)
  try{
    destroyIf(window.__pensionBars);
    destroyIf(window.__pensionDonut);

    const payload = __DATA.pension;
    const barCtx = $("pensionBars");
    const donutCtx = $("pensionDonut");

    if (!payload) throw new Error("Pension data missing");

    const years = (payload?.meta?.years || ["2022","2023","2024","2025"]).map(String);
    const cats  = (payload?.meta?.categories || ["Pension Contributions","Social Security Funds","Mandatory Savings","Other"]).map(String);
    const rows  = payload?.bars || [];

    const catColors = {
      "Pension Contributions": "#7E6AE6",
      "Social Security Funds": "#4DB6AC",
      "Mandatory Savings": "#B79BFF",
      "Other": "#F2B24C"
    };
    const palette = ["#7E6AE6","#4DB6AC","#B79BFF","#F2B24C","#6FD1A8","#5B3FFF","#86C6FF","#FF8FB1"];

    if (barCtx){
      const datasets = cats.map((name, idx)=>{
        const data = years.map(y => Number(rows.find(r=>String(r.year)===String(y) && String(r.category)===String(name))?.value_usd || 0));
        return {
          label: name,
          data,
          backgroundColor: catColors[name] || palette[idx % palette.length],
          borderWidth: 0,
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: (cats.length > 8 ? 14 : 22)
        };
      });

      window.__pensionBars = new Chart(barCtx,{
        type:"bar",
        data:{ labels: years, datasets },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          layout:{ padding:{ bottom: 8 } },
          plugins:{
            legend:{
              display:true,
              position:"bottom",
              align:"start",
              labels:{
                boxWidth:12,
                boxHeight:12,
                usePointStyle:true,
                pointStyle:"rectRounded",
                padding:16,
                color:"#2F2A4A",
                font:{ size:11, weight:"600" }
              }
            },
            tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${fmtUsd(c.raw)}` } }
          },
          datasets:{
            bar:{
              categoryPercentage: 0.78,
              barPercentage: 0.55
            }
          },
          scales:{
            x:{ grid:{ display:false }, ticks:{ color:"#6F6885", font:{ weight:"600" } } },
            y:{ beginAtZero:true, grid:{ color:"rgba(120,110,160,0.12)" }, ticks:{ display:false }, border:{ display:false } }
          }
        }
      });
    }

    // Donut composition (same style as TOTAL REVENUE donut)
    if (donutCtx){
      const donutYear = String(payload?.donut?.year || years[years.length-1] || "2025");
      const donutRows = payload?.donut?.values || cats.map((c)=>({ category:c, value_usd: Number(rows.find(r=>String(r.year)===donutYear && String(r.category)===c)?.value_usd || 0) }));

      const labels = donutRows.map(r=>String(r.category));
      const values = donutRows.map(r=>Number(r.value_usd||0));
      const bg = labels.map((l, idx)=> catColors[l] || palette[idx % palette.length]);
      const total = values.reduce((a,b)=>a+b,0) || 1;

      window.__pensionDonut = new Chart(donutCtx,{
        type:"doughnut",
        data:{
          labels,
          datasets:[{
            data: values,
            backgroundColor: bg,
            borderWidth:0,
            spacing:2,
            hoverOffset:4,
            borderRadius:10
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          cutout:"70%",
          rotation:-90,
          plugins:{
            legend:{ display:false },
            tooltip:{ callbacks:{
              label:(c)=>{
                const pct = Math.round((Number(c.raw||0)/total)*100);
                return `${c.label}: ${pct}% (${fmtUsd(c.raw)})`;
              }
            }}
          }
        },
        plugins:[{
          id:"pensionCenterTotal",
          beforeDraw(chart){
            try{
              const { ctx, chartArea } = chart;
              if (!chartArea) return;
              const cx = (chartArea.left + chartArea.right) / 2;
              const cy = (chartArea.top + chartArea.bottom) / 2;

              ctx.save();
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#2B1E5C";
              // scale font to donut size
              const fs = Math.max(14, Math.min(20, (chartArea.right-chartArea.left)/12));
              ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`;
              ctx.fillText(fmtCompactUsd(total), cx, cy);
              ctx.restore();
            }catch(e){ /* no-op */ }
          }
        }]
      });

      // Render legend blocks (same swatch colors as bars)
      const legendEl = document.getElementById("pensionLegend");
      if (legendEl){
        legendEl.innerHTML = labels.map((l, i)=>
          `<div class="rev-legend-item"><span class="swatch" style="background:${bg[i]}"></span><span>${l}</span></div>`
        ).join("");
      }
    }
  }catch(e){ console.warn("Pension render error", e); }


  // ===== INTERNATIONAL PUBLIC FINANCE (dummy JSON / same styling as Domestic block) =====
  try{
    destroyIf(window.__intPctTotal);
    destroyIf(window.__intByYear);
    destroyIf(window.__intByInstrument);
    destroyIf(window.__intTopPartners);
    destroyIf(window.__intBySector);
    destroyIf(window.__intSankey);

    const p = __DATA.international_public_financing || null;

    // Fallback dummy payload (matches board.pdf labels)
    const fallback = {
      summary:{
        total_usd: 345_200_000_000,
        as_of_year: 2025,
        real_change_pct_since_prev: -6.8,
        pct_total_financing: 18.4
      },
      by_year:[
        { year: 2022, usd: 310_000_000_000 },
        { year: 2023, usd: 332_000_000_000 },
        { year: 2024, usd: 370_000_000_000 },
        { year: 2025, usd: 345_200_000_000 }
      ],
      by_instrument:[
        { instrument:"Loans", usd: 240_000_000_000 },
        { instrument:"Grants", usd: 88_000_000_000 },
        { instrument:"Other", usd: 17_200_000_000 }
      ],
      partners:[
        { partner:"World Bank", usd: 34_200_000_000 },
        { partner:"IMF", usd: 18_000_000_000 },
        { partner:"GIZ", usd: 6_100_000_000 },
        { partner:"European Union", usd: 12_000_000_000 },
        { partner:"Green Climate Fund", usd: 5_600_000_000 },
        { partner:"African Development Bank", usd: 20_500_000_000 },
        { partner:"USAID", usd: 4_300_000_000 },
        { partner:"UK FCDO", usd: 3_700_000_000 }
      ],
      by_sector:[
        { sector:"Climate & Environment", usd: 28_000_000_000 },
        { sector:"Social Protection", usd: 19_000_000_000 },
        { sector:"Health", usd: 22_000_000_000 },
        { sector:"Infrastructure", usd: 80_000_000_000 },
        { sector:"Energy", usd: 70_000_000_000 },
        { sector:"Agriculture", usd: 36_000_000_000 },
        { sector:"Education", usd: 18_000_000_000 },
        { sector:"Governance", usd: 14_000_000_000 }
      ],
      instrument_sector_flows:{
        links:[
          { from:"Grant", to:"Project Finance", flow: 18 },
          { from:"Concessional Loan", to:"Project Finance", flow: 42 },
          { from:"Grant", to:"General Public Services", flow: 10 },
          { from:"Concessional Loan", to:"Economic Affairs", flow: 24 },
          { from:"Grant", to:"Environmental Protection", flow: 12 },
          { from:"Concessional Loan", to:"Housing and Community Amenities", flow: 9 },
          { from:"Grant", to:"Health", flow: 8 },
          { from:"Concessional Loan", to:"Education", flow: 7 },
          { from:"Grant", to:"Social Protection", flow: 6 }
        ]
      },
      active_projects_total: 47,
      active_projects: [
        { project_name:"Rural Electrification Scale-Up", partner:"World Bank", sector:"Energy", instrument:"Loan", budget_planned_usd:420000000, actual_disbursed_usd:312000000, status:"On Track" },
        { project_name:"Nigeria INFF Implementation", partner:"EU / UNDP", sector:"Governance", instrument:"Grant", budget_planned_usd:28000000, actual_disbursed_usd:18000000, status:"On Track" },
        { project_name:"Health Systems Strengthening", partner:"World Bank", sector:"Health", instrument:"Loan", budget_planned_usd:750000000, actual_disbursed_usd:290000000, status:"Delayed" },
        { project_name:"Digital ID for Finance Inclusion", partner:"AfDB", sector:"Digital", instrument:"Grant", budget_planned_usd:85000000, actual_disbursed_usd:72000000, status:"On Track" },
        { project_name:"Agric Value Chain Dev.", partner:"IFAD", sector:"Agriculture", instrument:"Loan", budget_planned_usd:180000000, actual_disbursed_usd:55000000, status:"At Risk" },
        { project_name:"Climate Resilience NE Nigeria", partner:"EU", sector:"Climate", instrument:"Grant", budget_planned_usd:62000000, actual_disbursed_usd:48000000, status:"On Track" },
        { project_name:"Education for All Initiative", partner:"USAID", sector:"Education", instrument:"Grant", budget_planned_usd:320000000, actual_disbursed_usd:280000000, status:"On Track" },
        { project_name:"Infrastructure Bond Facility", partner:"AfDB", sector:"Infrastructure", instrument:"Blended", budget_planned_usd:500000000, actual_disbursed_usd:120000000, status:"Delayed" }
      ],
      table:[
        { partner:"World Bank", sector:"Infrastructure", financing_instrument:"Concessional Loan", financing_modality:"Project Finance", cofog_code:"4", cofog_name:"Economic Affairs", year:"2025", value_usd: 8_700_000_000 },
        { partner:"African Development Bank", sector:"Energy", financing_instrument:"Concessional Loan", financing_modality:"Project Finance", cofog_code:"4", cofog_name:"Economic Affairs", year:"2025", value_usd: 5_200_000_000 },
        { partner:"European Union", sector:"Governance", financing_instrument:"Grant", financing_modality:"Project Finance", cofog_code:"1", cofog_name:"General Public Services", year:"2025", value_usd: 1_900_000_000 },
        { partner:"Green Climate Fund", sector:"Climate & Environment", financing_instrument:"Grant", financing_modality:"Project Finance", cofog_code:"5", cofog_name:"Environmental Protection", year:"2025", value_usd: 1_200_000_000 }
      ]
    };

    const data = p || fallback;
    const s = data.summary || fallback.summary;

    // Total card
    setText_("intTotalBig", fmtBigUsd(Number(s.total_usd||0)));
    setText_("intTotalYear", String(s.as_of_year||"—"));
    setText_("intTotalChangeYear", String((Number(s.as_of_year||2025)-1) || 2024));
    const chEl = $("intTotalChange");
    if (chEl){
      const v = Number(s.real_change_pct_since_prev||0);
      chEl.textContent = `${v>=0?"+":""}${v.toFixed(1)}%`;
      chEl.classList.toggle("positive", v>0);
      chEl.classList.toggle("negative", v<0);
    }

    // % Total financing donut
    const pct = Math.max(0, Math.min(100, Number(s.pct_total_financing||0)));
    const pctCtx = $("intPctTotal");
    if (pctCtx){
      window.__intPctTotal = new Chart(pctCtx,{
        type:"doughnut",
        data:{ labels:["International","Other"], datasets:[{ data:[pct, 100-pct], borderWidth:0, backgroundColor:["#5B3FFF","#E9E6F5"], borderRadius:10 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:"72%", plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${Number(c.raw||0).toFixed(1)}%` } } } }
      });
    }


    // Center label for % total donut
    const pctCenter = $("intPctTotalCenter");
    if (pctCenter) pctCenter.textContent = `${pct.toFixed(1)}%`;

    // Financing by year
    const byYear = (data.by_year || fallback.by_year).slice().sort((a,b)=>Number(a.year)-Number(b.year));
    const yearCtx = $("intByYear");
    if (yearCtx){
      window.__intByYear = new Chart(yearCtx,{
        type:"bar",
        data:{ labels: byYear.map(r=>String(r.year)), datasets:[{ label:"USD", data: byYear.map(r=>Number(r.usd||0)), backgroundColor:"#B79BFF", borderWidth:0, borderRadius:12, borderSkipped:false }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } }, valueLabelPlugin:{ formatter:(v)=> fmtCompactUsd(v).replace("US$","") } },
          scales:{ x:{ grid:{ display:false }, ticks:{ color:"#6F6885", font:{ weight:"600" } } },
                  y:{ beginAtZero:true, grid:{ color:"rgba(120,110,160,0.12)" }, ticks:{ display:false }, border:{ display:false } } }
        }
      });
    }

    // Financing by instrument (Loans/Grants/Other)
    const byInst = (data.by_instrument || fallback.by_instrument);
    const instCtx = $("intByInstrument");
    if (instCtx){
      window.__intByInstrument = new Chart(instCtx,{
        type:"doughnut",
        data:{ labels: byInst.map(r=>r.instrument), datasets:[{ data: byInst.map(r=>Number(r.usd||0)), borderWidth:0, backgroundColor:["#5B3FFF","#F2D24B","#4DB6AC"], borderRadius:10, spacing:2 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:"70%", plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${fmtUsd(c.raw)}` } } } }
      });
    }


    // Center label for instrument donut
    const instCenter = $("intInstrTotalCenter");
    if (instCenter){
      const totalInst = (byInst||[]).reduce((a,r)=>a+Number(r.usd||0),0);
      instCenter.textContent = fmtCompactUsd(totalInst);
    }

    // Top financing partners
    const partners = (data.partners || fallback.partners).slice();
    const desiredOrder = ["World Bank","IMF","GIZ","European Union","Green Climate Fund","African Development Bank","USAID","UK FCDO"];
    partners.sort((a,b)=> desiredOrder.indexOf(a.partner) - desiredOrder.indexOf(b.partner));
    const partnerCtx = $("intTopPartners");
    if (partnerCtx){
      window.__intTopPartners = new Chart(partnerCtx,{
        type:"bar",
        data:{ labels: partners.map(r=>r.partner), datasets:[{ data: partners.map(r=>Number(r.usd||0)), borderWidth:0, backgroundColor:"#7E6AE6", borderRadius:10, borderSkipped:false }] },
        options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } } },
          scales:{ x:{ grid:{ color:"rgba(120,110,160,0.10)" }, ticks:{ callback:(v)=> fmtCompactUsd(v).replace("US$","") } }, y:{ grid:{ display:false }, ticks:{ color:"#2F2A4A", font:{ weight:"600" } } } }
        }
      });
    }

    // Financing by sector
    const sectors = (data.by_sector || fallback.by_sector).slice();
    const sectorCtx = $("intBySector");
    if (sectorCtx){
      window.__intBySector = new Chart(sectorCtx,{
        type:"bar",
        data:{ labels: sectors.map(r=>r.sector), datasets:[{ data: sectors.map(r=>Number(r.usd||0)), borderWidth:0, backgroundColor:"#F2B24C", borderRadius:10, borderSkipped:false }] },
        options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> fmtUsd(c.raw) } } },
          scales:{ x:{ grid:{ color:"rgba(120,110,160,0.10)" }, ticks:{ callback:(v)=> fmtCompactUsd(v).replace("US$","") } }, y:{ grid:{ display:false }, ticks:{ color:"#2F2A4A", font:{ weight:"600" } } } }
        }
      });
    }

    // Sankey: Financing by instrument and sector (dummy)
    const sankeyCtx = $("intSankey");
    const sankeyReady = !!(Chart?.registry?.getController?.("sankey") || Chart?.controllers?.sankey);
    if (sankeyCtx && sankeyReady){
      const instruments = (data.by_instrument || fallback.by_instrument || []).map(d=>({ name:String(d.instrument), usd:Number(d.usd||0) }));
      const sectors = (data.by_sector || fallback.by_sector || []).map(d=>({ name:String(d.sector), usd:Number(d.usd||0) }));

      const totalInstr = instruments.reduce((a,b)=>a + (Number.isFinite(b.usd)?b.usd:0), 0);
      const totalSector = sectors.reduce((a,b)=>a + (Number.isFinite(b.usd)?b.usd:0), 0);
      const total = Math.max(totalInstr, totalSector);

      const toggle = $("intFlowToggle");
      const buildLinks = (bySectorView)=>{
        const links = [];
        if (!total) return links;

        if (!bySectorView){
          // TOTAL → Instrument → Sector
          instruments.forEach(i=>{
            links.push({ from:"TOTAL", to:i.name, flow:i.usd });
          });
          const denom = totalSector || 1;
          sectors.forEach(s=>{
            const share = s.usd / denom;
            instruments.forEach(i=>{
              links.push({ from:i.name, to:s.name, flow: i.usd * share });
            });
          });
        }else{
          // TOTAL → Sector → Instrument (sector totals come directly from "FINANCING BY SECTOR")
          sectors.forEach(s=>{
            links.push({ from:"TOTAL", to:s.name, flow:s.usd });
          });
          const denom = totalInstr || 1;
          instruments.forEach(i=>{
            const share = i.usd / denom;
            sectors.forEach(s=>{
              links.push({ from:s.name, to:i.name, flow: s.usd * share });
            });
          });
        }
        // sanitize
        return links.map(x=>({ from:String(x.from), to:String(x.to), flow:Number(x.flow||0) })).filter(x=>x.flow>0);
      };

      const getLinks = ()=> buildLinks(!!toggle?.checked);

      // Fallback for plugin versions where the node label formatter does not receive chart context
      window.__lastSankeyLinks = getLinks();
      window.__intSankey = new Chart(sankeyCtx,{
        type:"sankey",
        data:{ datasets:[{ data: getLinks(), colorFrom:"rgba(106,76,255,.55)", colorTo:"rgba(244,200,75,.55)", colorMode:"gradient" }] },
        options:{ responsive:true, maintainAspectRatio:false,
          layout:{ padding:{ bottom: 24 } },
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=> `${ctx.raw.from} → ${ctx.raw.to}: ${fmtCompactUsd(ctx.raw.flow)}` } } },
          sankey:{ node:{ width: 14, padding: 12,
            label:{ display:true, font:{ size: 10 }, formatter: sankeyNodeLabelWithValue }
          } }
        }
      });

      // redraw when toggled (BY SECTOR)
      if (toggle){
        toggle.onchange = ()=>{
          if (!window.__intSankey) return;
          window.__intSankey.data.datasets[0].data = getLinks();
          window.__lastSankeyLinks = window.__intSankey.data.datasets[0].data;
          window.__intSankey.update();
        };
      }
    }else{
      const parent = sankeyCtx?.parentElement;
      if (parent) parent.innerHTML = '<div class="muted" style="padding:12px 10px;">Financing flows chart requires the sankey plugin (chartjs-chart-sankey).</div>';
    }

    
    // Active Projects table (International)
    const projTbl = document.getElementById("intProjectsTable");
    const projTbody = projTbl?.querySelector("tbody");
    const subtitleEl = document.getElementById("intProjectsSubtitle");
    const infoEl = document.getElementById("intProjectsInfo");
    const pagerEl = document.getElementById("intProjectsPager");

    const projects = (data.active_projects || fallback.active_projects || []).slice();
    const totalProjects = Number(data.active_projects_total || fallback.active_projects_total || projects.length || 0);
    const pageSize = 8;
    let page = 1;

    const instrumentPillClass = (v) => {
      const s = String(v||"").toLowerCase();
      if (s.includes("loan")) return "loan";
      if (s.includes("grant")) return "grant";
      return "blended";
    };
    const statusClass = (v) => {
      const s = String(v||"").toLowerCase();
      if (s.includes("on")) return "ontrack";
      if (s.includes("delay")) return "delayed";
      return "atrisk";
    };

    const setText = (el, t) => { if (el) el.textContent = t; };

    const renderProjects = () => {
      if (!projTbody) return;

      const total = Math.max(totalProjects, projects.length);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(Math.max(1, page), totalPages);

      const startIdx = (page - 1) * pageSize;
      const endIdx = Math.min(startIdx + pageSize, total);
      const pageRows = projects.slice(startIdx, startIdx + pageSize);

      setText(subtitleEl, `Showing ${startIdx+1}–${endIdx} of ${total} active projects. Filter by partner, sector, or instrument above.`);
      setText(infoEl, `Showing ${startIdx+1}–${endIdx} of ${total} projects`);

      projTbody.innerHTML = pageRows.map(r => {
        const instr = r.instrument || "";
        const st = r.status || "";
        return `
          <tr>
            <td>${escapeHtml_(r.project_name || "")}</td>
            <td>${escapeHtml_(r.partner || "")}</td>
            <td>${escapeHtml_(r.sector || "")}</td>
            <td><span class="pill ${instrumentPillClass(instr)}">${escapeHtml_(instr)}</span></td>
            <td>${escapeHtml_(fmtCompactUsd(Number(r.budget_planned_usd || 0)))}</td>
            <td>${escapeHtml_(fmtCompactUsd(Number(r.actual_disbursed_usd || 0)))}</td>
            <td><span class="status ${statusClass(st)}">${escapeHtml_(st)}</span></td>
          </tr>
        `;
      }).join("") || `<tr><td colspan="7" class="muted-cell">No rows</td></tr>`;

      // Pager (window of 3 pages like screenshot)
      if (pagerEl){
        const mkBtn = (label, onClick, opts={}) => {
          const b = document.createElement("button");
          b.className = "page-btn " + (opts.kind||"");
          b.textContent = label;
          if (opts.disabled) b.disabled = true;
          if (opts.active) b.classList.add("active");
          b.addEventListener("click", onClick);
          return b;
        };

        pagerEl.innerHTML = "";
        pagerEl.appendChild(mkBtn("← Prev", ()=>{ page -= 1; renderProjects(); }, {disabled: page<=1}));

        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const win = 3;
        let start = Math.max(1, page - 1);
        let end = Math.min(totalPages, start + win - 1);
        start = Math.max(1, end - win + 1);

        for (let pnum = start; pnum <= end; pnum++){
          const b = mkBtn(String(pnum), ()=>{ page = pnum; renderProjects(); }, {kind:"page-num", active: pnum===page});
          b.classList.add("page-num");
          pagerEl.appendChild(b);
        }

        pagerEl.appendChild(mkBtn("Next →", ()=>{ page += 1; renderProjects(); }, {disabled: page>=totalPages}));
      }
    };

    renderProjects();
}catch(e){ console.warn("International public finance render error", e); }


}

function initExtraGapCharts_(){
  // SECTOR LEVEL GAPS: three mini doughnuts (progress snapshots)
  try{
    ["d1","d2","d3"].forEach((id, idx)=>{
      const ctx = $(id);
      if (!ctx) return;
      const pct = [73, 73, 73][idx];
      // reuse doughnut builder from earlier
      const ch = new Chart(ctx,{
        type:"doughnut",
        data:{ labels:["Progress","Remaining"], datasets:[{ data:[pct, 100-pct], borderWidth:0 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:"78%", plugins:{ legend:{display:false}, title:{ display:true, text:["In progress","Ongoing","Completed"][idx] } } }
      });
      window["__mini_"+id] = ch;
    });
  }catch(e){}

  // GAP TRENDS OVER TIME: three mini line charts
  try{
    const w = (__DATA.gap_trends?.weeks)||[];
    const s = (__DATA.gap_trends?.series)||{};
    const map = { t1:"Caseload", t2:"Partner Reports", t3:"Budget Burn" };
    Object.entries(map).forEach(([cid, name])=>{
      destroyIf(window["__"+cid]);
      const ctx = $(cid);
      if (!ctx) return;
      window["__"+cid] = new Chart(ctx,{
        type:"line",
        data:{ labels:w, datasets:[{ data:(s[name]||[]), fill:false, tension:.35, pointRadius:0, borderWidth:2 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{ display:true, text:name } },
          scales:{ x:{ display:false }, y:{ display:false } }
        }
      });
    });
  }catch(e){}

  // PLANNED VERSUS REQUIRED FINANCIALS: gantt-like horizontal bars + stacked bars + radar
  try{
    destroyIf(window.__planGantt);
    const ctx = $("planGantt");
    if (ctx){
      const p = __DATA.planned_required?.bars;
      const labels = p?.Programs || [];
      const planned = p?.Planned_USD || [];
      const required = p?.Required_USD || [];
      window.__planGantt = new Chart(ctx,{
        type:"bar",
        data:{ labels, datasets:[
          { label:"Planned", data:planned, borderWidth:0 },
          { label:"Required", data:required, borderWidth:0 }
        ]},
        options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"bottom" }, title:{ display:true, text:"Planned vs required (USD)" } },
          scales:{ x:{ grid:{display:false}, ticks:{ callback:(v)=>fmtUsd(v).replace("US$","") } }, y:{ grid:{display:false} } }
        }
      });
    }
  }catch(e){}

  try{
    destroyIf(window.__planBars);
    const ctx = $("planBars");
    if (ctx){
      const labels = ["2022","2023","2024","2025"];
      const planned = labels.map((_,i)=> 220_000_000 + i*55_000_000);
      const actual  = labels.map((_,i)=> 180_000_000 + i*45_000_000);
      window.__planBars = new Chart(ctx,{
        type:"bar",
        data:{ labels, datasets:[
          { label:"Planned", data:planned, borderWidth:0 },
          { label:"Actual", data:actual, borderWidth:0 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" }, title:{ display:true, text:"Planned vs actual (USD)" } },
          scales:{ x:{ grid:{display:false} }, y:{ grid:{display:false}, ticks:{ callback:(v)=>fmtUsd(v).replace("US$","") } } }
        }
      });
    }
  }catch(e){}

  try{
    destroyIf(window.__planRadar);
    const ctx = $("planRadar");
    if (ctx){
      const r = __DATA.planned_required?.radar;
      window.__planRadar = new Chart(ctx,{
        type:"radar",
        data:{ labels:r?.axes||[], datasets:[{ label:"Readiness", data:r?.values||[], borderWidth:2, fill:true }]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{ display:true, text:"Cross-cutting lenses" } } }
      });
    }
  }catch(e){}
}
