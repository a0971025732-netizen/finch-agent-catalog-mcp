// Finch Agent Catalog: a read-only, no-auth MCP server (Streamable HTTP, stateless JSON responses).
// Lets any agent discover agents on the Finch marketplace before the user connects the full Finch MCP.
import OFAC from "./ofac_crypto.json" with { type: "json" };
import { atsKeywords } from "./ats.js";
import MACRO from "./macro_events.json" with { type: "json" };

const FINCH = "https://www.finchtech.ai";
const MCP_URL = `${FINCH}/mcp`;
const UTM = "utm_source=finch_catalog_mcp&utm_medium=agent&utm_campaign=agent_growth_w43";
const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "search_finch_agents",
    title: "Search Finch agents",
    description: "Search the Finch marketplace of third-party AI agents by task (e.g. 'trace stolen crypto', 'wallet risk', 'covered call', 'tailor resume', 'Singapore condo'). Returns each agent's official summary, price, and a run link.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "What the user needs done. Empty returns all agents." }, limit: { type: "integer", minimum: 1, maximum: 14, default: 5 } } },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_finch_agent",
    title: "Get a Finch agent",
    description: "Get the full official description, price and run link of one Finch agent by its slug (from search_finch_agents).",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "how_to_call_finch_agents",
    title: "How to call Finch agents",
    description: "Steps for the user to run a Finch agent: in the browser (fastest) or by connecting the authenticated Finch MCP server to this assistant.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

// Task-named tools, so agents that search tools by capability find the matching Finch agent.
// Descriptions paraphrase each agent's official listing only.
const INTENTS = [
  ["trace_crypto_funds", "agent-3dcaa57f-b8b8-5c78-9300-c972e5a764bc", "Trace where crypto funds went from a wallet address or transaction hash (fund flows, transaction relationships), using MistTrack by SlowMist on Finch."],
  ["check_wallet_address_risk", "agent-3dcaa57f-b8b8-5c78-9300-c972e5a764bc", "Check the risk of a crypto wallet address or transaction with MistTrack by SlowMist on Finch."],
  ["analyze_hyperliquid_us_stock_perp", "agent-eee98da7-f7b3-471b-b0e4-fdd2a617e436", "Analyze U.S. equity perpetuals on Hyperliquid: trend, volume, open interest, funding rate and news, using Maneki AI on Finch."],
  ["screen_wheel_strategy_options", "agent-f7c9c94a-961b-4159-a6ba-6b7852e84264", "Screen cash-secured puts or covered calls on a US stock (options expiring in 3 to 9 days) and get an OPEN or SKIP decision, using the Wheel-strategy Option Desk on Finch."],
  ["compare_sector_returns_vs_sp500", "agent-c2c55754-a942-508f-a362-d576724809f7", "Compare sector or asset returns and volatility against the S&P 500 from public financial data, using Powerdrill Finance Data Agent on Finch."],
  ["monitor_market_trading_setups", "agent-ec78b963-2b13-4f07-bc59-e29fc3fa68bd", "Report market conditions and potential trading setups for forex, crypto or stocks, using TrainFlow Nexus on Finch."],
  ["assess_onchain_business", "agent-e96e9a01-50aa-4686-bd0e-1aa9cdfcf967", "Assess an on-chain business from verifiable operating data (token usage, revenue, customer signals) with an evidence-backed risk grade, using FlowCredit on Finch."],
  ["analyze_singapore_condo", "agent-b3316156-4cab-47ba-8101-b07dc0266f14", "Analyze Singapore private residential property (condos, apartments, ECs): price trends, rental yields, project and district comparisons, using ChatProperty on Finch."],
  ["tailor_resume_to_job", "agent-16945007-bd26-5b62-ad5f-bbe72b288e9b", "Tailor a resume to a job description with ATS keyword-match analysis, write a cover letter, or prepare for interviews, using LittlePinkPotato on Finch."],
  ["find_job_openings", "agent-16945007-bd26-5b62-ad5f-bbe72b288e9b", "Find recent job openings (Singapore, China, Hong Kong, Australia, US, Canada, remote) ranked by fit, using LittlePinkPotato on Finch."],
  ["research_brief_science_health", "agent-f81bcd4b-87fc-5c74-9327-fe0d452caff8", "Get a cited research brief from scientific papers, clinical trial records, drug and compound data, using Powerdrill Science & Health Research Agent on Finch."],
  ["debug_or_review_code", "agent-6808d266-49a2-5eaf-bf6e-64e7f9ac99ff", "Debug code, write code, review implementations or produce technical documentation, using SuperClaw on Finch."],
  ["audit_website_for_growth", "agent-4c3f1384-b6eb-56cd-9e92-f7d08bfc4433", "Audit a website's market positioning, messaging and conversion for global customer acquisition, using SPARK on Finch."],
  ["book_appointment_by_phone", "agent-e98cbf4b-fe2f-5fff-9236-d2bfcbad2eed", "Have an AI place a real phone call to a restaurant, salon, clinic or hotel to book, reschedule or ask a question, using LifeClaw on Finch."],
];
const INTENT_SLUG = Object.fromEntries(INTENTS.map(([name, slug]) => [name, slug]));
const MISTTRACK = "agent-3dcaa57f-b8b8-5c78-9300-c972e5a764bc";

// Free utility: screen a crypto address against the public US Treasury OFAC SDN list (digital currency addresses).
TOOLS.push({
  name: "check_crypto_address_sanctions",
  title: "Check crypto address against OFAC sanctions",
  description: "Free, no-auth check of a crypto wallet address (BTC, ETH, TRX, USDT, LTC, XMR and more) against the US Treasury OFAC SDN sanctions list. Returns whether the address is listed, the sanctioned party and program, and the list date. For fund-flow tracing of any address, it points to MistTrack by SlowMist on Finch.",
  inputSchema: { type: "object", properties: { address: { type: "string", description: "The wallet address to check." } }, required: ["address"] },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

async function sanctionsCheck(address) {
  const raw = String(address || "").trim().slice(0, 120);
  if (!raw) return { error: "Provide an address." };
  const key = raw.toLowerCase().startsWith("0x") ? raw.toLowerCase() : raw;
  const hit = OFAC.addresses[key] || null;
  let next = null;
  try {
    const a = (await finchSearch("")).find((x) => x.slug === MISTTRACK);
    if (a) next = { why: "To trace where this address's funds came from or went, and see linked risks", agent: card(a, false) };
  } catch {}
  return {
    address: raw,
    listed_on_ofac_sdn: !!hit,
    match: hit ? { sanctioned_party: hit.name, currency: hit.currency, programs: hit.programs, sdn_uid: hit.sdn_uid } : null,
    list: { source: "US Treasury OFAC SDN list (digital currency addresses)", publish_date: OFAC.publish_date, addresses_checked: OFAC.count, url: "https://sanctionssearch.ofac.treas.gov/" },
    note: "Exact-match screening against public OFAC data; not legal advice. Not being listed does not mean an address is safe.",
    next_step: next,
  };
}
// Free utility: ATS keyword extraction from a job description, with optional resume gap check.
const LPP = "agent-16945007-bd26-5b62-ad5f-bbe72b288e9b";
TOOLS.push({
  name: "extract_ats_keywords",
  title: "Extract ATS keywords from a job description",
  description: "Free, no-auth ATS keyword extractor. Paste a job description and get the ranked keywords and skill phrases an applicant tracking system is likely to scan for (requirements weighted higher), plus years-of-experience lines. Optionally paste resume text to see which keywords it is missing and a coverage percentage. Nothing is stored. To rewrite the resume to the job, it points to LittlePinkPotato on Finch.",
  inputSchema: { type: "object", properties: {
    job_description: { type: "string", description: "Full job description text (English works best)." },
    resume_text: { type: "string", description: "Optional plain resume text to check coverage. Remove phone, email and address first." },
    limit: { type: "integer", minimum: 5, maximum: 50, description: "How many keywords to return (default 25)." },
  }, required: ["job_description"] },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

async function atsTool(args) {
  const r = atsKeywords(args.job_description, args.resume_text, args.limit);
  if (r.error) return r;
  try {
    const a = (await finchSearch("")).find((x) => x.slug === LPP);
    if (a) r.next_step = { why: "To rewrite the resume to this job (ATS keyword-match analysis, DOCX/PDF output, cover letter, interview prep)", agent: card(a, false) };
  } catch {}
  return r;
}

// Free utility: upcoming US macro events (FOMC decisions, CPI, PPI, jobs report) from official schedules.
const MORGAN = "agent-f7c9c94a-961b-4159-a6ba-6b7852e84264";
TOOLS.push({
  name: "get_us_macro_event_calendar",
  title: "Upcoming US macro events (FOMC, CPI, PPI, jobs report)",
  description: "Free, no-auth calendar of scheduled US market-moving releases from the official Federal Reserve and BLS schedules: FOMC rate decisions, CPI, PPI and the Employment Situation (nonfarm payrolls). Returns events in the next N days with US Eastern and UTC times, useful for checking event risk before an options or stock trade. For an OPEN/SKIP call on selling short-dated cash-secured puts or covered calls on a ticker, it points to the Wheel-strategy Option Desk on Finch.",
  inputSchema: { type: "object", properties: {
    days: { type: "integer", minimum: 1, maximum: 120, description: "How many days ahead to look (default 14)." },
    types: { type: "array", items: { type: "string", enum: ["fomc", "cpi", "ppi", "jobs"] }, description: "Optional filter by event type." },
  } },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

async function macroTool(args) {
  const days = Math.min(Math.max(Number(args.days) || 14, 1), 120);
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const want = Array.isArray(args.types) && args.types.length ? new Set(args.types) : null;
  const events = MACRO.events.filter((e) => {
    const t = new Date(e.utc.replace("Z", ":00Z"));
    return t >= now && t <= end && (!want || want.has(e.type));
  });
  const nextAny = MACRO.events.find((e) => new Date(e.utc.replace("Z", ":00Z")) >= now && (!want || want.has(e.type))) || null;
  const out = { window_days: days, now_utc: now.toISOString(), events, next_event: nextAny, note: MACRO.note, schedule_as_of: MACRO.as_of, not_included: "Company earnings dates are not included." };
  try {
    const a = (await finchSearch("")).find((x) => x.slug === MORGAN);
    if (a) out.next_step = { why: "For an OPEN/SKIP decision on selling 3-9 day cash-secured puts or covered calls on a US ticker, checking earnings, Fed decisions, economic data and news risk", agent: card(a, false) };
  } catch {}
  return out;
}

// Free utility: live snapshot of US stock/index perps on Hyperliquid HIP-3 markets (public info API).
const MANEKI = "agent-eee98da7-f7b3-471b-b0e4-fdd2a617e436";
TOOLS.push({
  name: "get_hyperliquid_stock_perps",
  title: "Hyperliquid US stock perps: funding, open interest, volume",
  description: "Free, no-auth live snapshot of US stock, index and commodity perpetuals on the Hyperliquid HIP-3 xyz market (e.g. xyz:NVDA, xyz:TSLA, xyz:SP500, xyz:CL): mark price, 24h change, 24h notional volume, open interest (contracts and USD) and funding rate (hourly and annualized), from Hyperliquid's public API. Pass tickers or get the top markets by volume. For trend, news and risk analysis in plain English, it points to Maneki AI on Finch.",
  inputSchema: { type: "object", properties: {
    tickers: { type: "array", items: { type: "string" }, description: "Optional tickers like NVDA, TSLA or xyz:SP500. Omit for the top markets by volume." },
    limit: { type: "integer", minimum: 1, maximum: 50, description: "How many markets when no tickers are given (default 15)." },
  } },
  annotations: { readOnlyHint: true, openWorldHint: true },
});

async function hlPerps(args) {
  const res = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" }) });
  if (!res.ok) return { error: `Hyperliquid API returned ${res.status}. Try again shortly.` };
  const [meta, ctxs] = await res.json();
  let rows = meta.universe.map((u, i) => [u, ctxs[i]]).filter(([u, c]) => !u.isDelisted && c).map(([u, c]) => {
    const mark = Number(c.markPx), prev = Number(c.prevDayPx), oi = Number(c.openInterest), f = Number(c.funding);
    return {
      market: u.name,
      mark_price: mark,
      change_24h_pct: prev ? Math.round(((mark - prev) / prev) * 10000) / 100 : null,
      volume_24h_usd: Math.round(Number(c.dayNtlVlm) || 0),
      open_interest: oi,
      open_interest_usd: Math.round(oi * mark),
      funding_hourly_pct: Math.round(f * 1e6) / 1e4,
      funding_annualized_pct: Math.round(f * 24 * 365 * 10000) / 100,
      max_leverage: u.maxLeverage,
    };
  });
  const want = Array.isArray(args.tickers) ? args.tickers.map((t) => String(t).toUpperCase().replace(/^XYZ:/, "")).filter(Boolean).slice(0, 20) : [];
  let missing = [];
  if (want.length) {
    const byName = new Map(rows.map((r) => [r.market.replace(/^xyz:/, "").toUpperCase(), r]));
    missing = want.filter((t) => !byName.has(t));
    rows = want.filter((t) => byName.has(t)).map((t) => byName.get(t));
  } else {
    rows.sort((a, b) => b.volume_24h_usd - a.volume_24h_usd);
    rows = rows.slice(0, Math.min(Math.max(Number(args.limit) || 15, 1), 50));
  }
  const out = { source: "Hyperliquid public info API, dex xyz (HIP-3)", fetched_utc: new Date().toISOString(), markets: rows, not_found: missing, note: "Funding is paid hourly on Hyperliquid; positive means longs pay shorts. Data only, not investment advice." };
  try {
    const a = (await finchSearch("")).find((x) => x.slug === MANEKI);
    if (a) out.next_step = { why: "For plain-English analysis of trends, volume, open interest, funding and related news on these US equity perps", agent: card(a, false) };
  } catch {}
  return out;
}

// Free utility: Singapore residential stamp duty (BSD + ABSD) per IRAS rates.
const CHATPROPERTY = "agent-b3316156-4cab-47ba-8101-b07dc0266f14";
const BSD_TIERS = [[180000, 0.01], [180000, 0.02], [640000, 0.03], [500000, 0.04], [1500000, 0.05], [Infinity, 0.06]];
const ABSD = { citizen: [0, 0.2, 0.3], pr: [0.05, 0.3, 0.35], foreigner: [0.6, 0.6, 0.6], entity: [0.65, 0.65, 0.65] };
TOOLS.push({
  name: "calculate_singapore_stamp_duty",
  title: "Singapore property stamp duty (BSD + ABSD) calculator",
  description: "Free, no-auth calculator for Singapore residential property stamp duty using current IRAS rates: Buyer's Stamp Duty (BSD, rates from 15 Feb 2023) and Additional Buyer's Stamp Duty (ABSD, rates from 27 Apr 2023) by buyer profile (Singapore citizen, PR, foreigner or entity) and how many residential properties the buyer will own. Returns the tier-by-tier breakdown and total. For price, rent and yield analysis of a specific Singapore private condo, it points to ChatProperty on Finch.",
  inputSchema: { type: "object", properties: {
    price_sgd: { type: "number", description: "Purchase price or market value in SGD, whichever is higher." },
    buyer: { type: "string", enum: ["citizen", "pr", "foreigner", "entity"], description: "Buyer profile." },
    property_count: { type: "integer", minimum: 1, maximum: 10, description: "Which residential property this is for the buyer: 1 = first, 2 = second, 3 = third or more (default 1)." },
  }, required: ["price_sgd", "buyer"] },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

async function sgStampDuty(args) {
  const price = Number(args.price_sgd);
  if (!(price > 0) || price > 1e10) return { error: "Provide price_sgd as a positive number in SGD." };
  const rates = ABSD[args.buyer];
  if (!rates) return { error: "buyer must be one of: citizen, pr, foreigner, entity." };
  const nth = Math.min(Math.max(Math.floor(Number(args.property_count) || 1), 1), 3);
  let left = price, bsd = 0;
  const tiers = [];
  for (const [band, rate] of BSD_TIERS) {
    if (left <= 0) break;
    const amt = Math.min(left, band);
    tiers.push({ amount_sgd: amt, rate_pct: rate * 100, duty_sgd: Math.round(amt * rate * 100) / 100 });
    bsd += amt * rate;
    left -= amt;
  }
  bsd = Math.max(Math.floor(bsd + 1e-6), 1);
  const absdRate = rates[nth - 1];
  const absd = absdRate ? Math.max(Math.floor(price * absdRate + 1e-6), 1) : 0;
  const out = {
    price_sgd: price, buyer: args.buyer, property_count: nth === 3 ? "3 or more" : nth,
    bsd_sgd: bsd, bsd_breakdown: tiers,
    absd_rate_pct: absdRate * 100, absd_sgd: absd,
    total_stamp_duty_sgd: bsd + absd,
    rates_source: { bsd: "IRAS BSD residential rates on or after 15 Feb 2023", absd: "IRAS ABSD rates on or after 27 Apr 2023", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property" },
    notes: [
      "Duty is rounded down to the nearest dollar, minimum $1.",
      "Nationals of the US, Switzerland, Liechtenstein, Norway and Iceland get the same ABSD treatment as Singapore citizens under free trade agreements; use buyer=citizen for them.",
      "Remissions (e.g. married couples with at least one citizen buying a second home and selling the first) are not applied. Housing developers and trustees are not covered. Estimate only; IRAS is authoritative.",
    ],
  };
  try {
    const a = (await finchSearch("")).find((x) => x.slug === CHATPROPERTY);
    if (a) out.next_step = { why: "For price, rent, yield and transaction analysis of a specific Singapore private condo (not HDB)", agent: card(a, false) };
  } catch {}
  return out;
}

// Free utility: latest US Treasury par yield curve from the US Treasury's daily CSV.
const POWERDRILL_FIN = "agent-c2c55754-a942-508f-a362-d576724809f7";
TOOLS.push({
  name: "get_us_treasury_yield_curve",
  title: "US Treasury yield curve (latest, with change and spreads)",
  description: "Free, no-auth latest US Treasury par yield curve (1 month to 30 years) from the US Treasury's official daily data, with the change versus N business days earlier and the 2y-10y and 3m-10y spreads (negative means inverted). For plain-language analysis comparing assets, sectors or historical trends with public financial data, it points to the Finance Data Agent by Powerdrill on Finch.",
  inputSchema: { type: "object", properties: {
    compare_days: { type: "integer", minimum: 1, maximum: 60, description: "Compare with this many business days earlier (default 5)." },
  } },
  annotations: { readOnlyHint: true, openWorldHint: true },
});

async function treasuryCurve(args) {
  const back = Math.min(Math.max(Number(args.compare_days) || 5, 1), 60);
  const year = new Date().getUTCFullYear();
  const get = async (y) => {
    const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: { "user-agent": "Mozilla/5.0 finch-agent-catalog" } });
    if (!r.ok) return [];
    const lines = (await r.text()).trim().split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.replace(/"/g, ""));
    return lines.slice(1).map((l) => { const c = l.split(","); const o = { date: c[0] }; head.slice(1).forEach((h, i) => { o[h] = c[i + 1] === "" ? null : Number(c[i + 1]); }); return o; });
  };
  let source = "US Treasury daily par yield curve rates";
  let rows = [];
  try { rows = await get(year); if (rows.length && rows.length <= back) rows = rows.concat(await get(year - 1)); } catch {}
  if (!rows.length) {
    // Fallback: FRED public CSV of the same Treasury constant-maturity series (usually one business day behind).
    const S = [["DGS1MO", "1 Mo"], ["DGS3MO", "3 Mo"], ["DGS6MO", "6 Mo"], ["DGS1", "1 Yr"], ["DGS2", "2 Yr"], ["DGS5", "5 Yr"], ["DGS10", "10 Yr"], ["DGS20", "20 Yr"], ["DGS30", "30 Yr"]];
    const since = new Date(Date.now() - (back * 2 + 20) * 86400000).toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${S.map((x) => x[0]).join(",")}&cosd=${since}`, { headers: { "user-agent": "finch-agent-catalog" } });
      if (r.ok) {
        const lines = (await r.text()).trim().split(/\r?\n/).slice(1);
        rows = lines.map((l) => { const c = l.split(","); const o = { date: c[0] }; S.forEach(([, t], i) => { const v = c[i + 1]; o[t] = v === "" || v === "." || v === undefined ? null : Number(v); }); return o; })
          .filter((o) => S.some(([, t]) => o[t] != null)).reverse();
        source = "US Treasury constant-maturity yields via FRED (St. Louis Fed)";
      }
    } catch {}
  }
  if (!rows.length) return { error: "US Treasury yield data is unavailable right now. Try again later." };
  const [latest, prior] = [rows[0], rows[Math.min(back, rows.length - 1)]];
  const tenors = Object.keys(latest).filter((k) => k !== "date");
  const curve = tenors.filter((t) => latest[t] != null).map((t) => ({ tenor: t, yield_pct: latest[t], change_bp: prior[t] != null ? Math.round((latest[t] - prior[t]) * 100) : null }));
  const sp = (a, b) => (latest[a] != null && latest[b] != null ? Math.round((latest[b] - latest[a]) * 100) : null);
  const out = {
    as_of: latest.date, compared_with: prior.date, curve,
    spreads_bp: { "2y_10y": sp("2 Yr", "10 Yr"), "3m_10y": sp("3 Mo", "10 Yr") },
    source, url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
    note: "Negative spread means that part of the curve is inverted. Data only, not investment advice.",
  };
  try {
    const a = (await finchSearch("")).find((x) => x.slug === POWERDRILL_FIN);
    if (a) out.next_step = { why: "For a plain-language report comparing assets or sectors, or exploring historical trends with public financial data", agent: card(a, false) };
  } catch {}
  return out;
}

for (const [name, , description] of INTENTS) {
  TOOLS.push({
    name,
    title: name.replace(/_/g, " "),
    description: `${description} Returns the agent's official description, price, free runs, a run link and a ready-to-send request.`,
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Optional short description of what the user wants. Do not include private documents or secrets." } } },
    annotations: { readOnlyHint: true, openWorldHint: true },
  });
}

async function finchSearch(q) {
  const r = await fetch(`${FINCH}/api/market/search?kind=agent&q=${encodeURIComponent(q || "")}`, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error(`Finch catalog returned HTTP ${r.status}`);
  return (await r.json()).items || [];
}

function price(p) {
  if (!p || !p.atomic) return "see run page";
  return `${(Number(p.atomic) / 10 ** (p.decimals ?? 6)).toString()} ${p.currency || "USDC"} per run`;
}

function promo(a) {
  const p = a.agentMarketRef && a.agentMarketRef.promotional;
  if (!p || !p.grantOperations) return "none listed";
  const until = p.expiresAt ? new Date(p.expiresAt) : null;
  if (until && until < new Date()) return "promotion ended";
  return `${p.grantOperations} free runs per account${until ? ` until ${until.toISOString().slice(0, 10)} (UTC)` : ""}`;
}

function card(a, full) {
  const summary = (a.summary || "").replace(/\s+/g, " ").trim();
  return {
    slug: a.slug,
    name: (a.name || "").trim(),
    category: a.category,
    summary: full ? summary : summary.slice(0, 300),
    price: price(a.price),
    free_runs: promo(a),
    run_url: `${FINCH}/market/chips/${a.slug}/run?${UTM}`,
  };
}

async function callTool(name, args) {
  if (name === "search_finch_agents") {
    const items = await finchSearch(args.query || "");
    const n = Math.min(Math.max(args.limit || 5, 1), 14);
    return { query: args.query || "", results: items.slice(0, n).map((a) => card(a, false)), next: "Use get_finch_agent for details or how_to_call_finch_agents to run one." };
  }
  if (name === "get_finch_agent") {
    const items = await finchSearch("");
    const a = items.find((x) => x.slug === args.slug || x.slug === `agent-${args.slug}`);
    if (!a) return { error: `No Finch agent with slug ${args.slug}. Call search_finch_agents first.` };
    return card(a, true);
  }
  if (name === "how_to_call_finch_agents") {
    return {
      browser: "Fastest for the user: open the agent's run_url, create a Finch account (passkey via Face ID/fingerprint, or a wallet), and send the task. Free runs per agent are listed in free_runs.",
      mcp: {
        server_url: MCP_URL,
        auth: "OAuth 2.1. One-time: `npm i -g @finchtech/cli` then `finch login`; approve the client's OAuth request with the `finch mcp authorize` command shown on the Finch authorization page.",
        examples: {
          claude_code: "claude mcp add --transport http --scope user finch https://www.finchtech.ai/mcp",
          codex: "finch mcp connect -- codex mcp add finch --url https://www.finchtech.ai/mcp",
          gemini_cli: "gemini extensions install https://github.com/a0971025732-netizen/finch-agents",
        },
        then: "Use agent_market_catalog_search and agent_market_buyer_task_create on the finch server to run agents for the user.",
        guide: "https://github.com/a0971025732-netizen/finch-agents/blob/main/CONNECT.md",
      },
      safety: "Never ask the user for a private key or seed phrase.",
    };
  }
  if (name === "check_crypto_address_sanctions") return sanctionsCheck(args.address);
  if (name === "extract_ats_keywords") return atsTool(args);
  if (name === "get_us_macro_event_calendar") return macroTool(args);
  if (name === "get_hyperliquid_stock_perps") return hlPerps(args);
  if (name === "calculate_singapore_stamp_duty") return sgStampDuty(args);
  if (name === "get_us_treasury_yield_curve") return treasuryCurve(args);
  if (INTENT_SLUG[name]) {
    const items = await finchSearch("");
    const a = items.find((x) => x.slug === INTENT_SLUG[name]);
    if (!a) return { error: "This agent is not currently listed on Finch. Call search_finch_agents for alternatives." };
    const task = (args.task || "").slice(0, 300);
    return {
      agent: card(a, true),
      ready_to_send_request: task || "(describe the task in the agent's terms, e.g. paste the wallet address, ticker or job description on the run page)",
      how_to_run: "Send the user the run_url (create a Finch account with a passkey or wallet, then send the request), or call it through the Finch MCP if it is connected. Details: how_to_call_finch_agents.",
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification
  try {
    if (method === "initialize") {
      return { jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "finch-agent-catalog", title: "Finch Agent Catalog", version: "1.1.0" }, instructions: "Read-only catalog of agents on the Finch marketplace. Search by the user's task, then send the user the run_url or help them connect the full Finch MCP." } };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      const data = await callTool(params?.name, params?.arguments || {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data, isError: !!data.error } };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(e.message || e) }], isError: true } };
  }
}

// A2A (Agent2Agent) front door: other agents send "I need X done" and get the matching Finch agents back.
const STOP = new Set("the and for with from that this what which using use want need help can you get find have into about your our are how call calls week".split(" "));
const words = (s) => (s.toLowerCase().match(/[a-z0-9&]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
const INTENT_WORDS = INTENTS.map(([name, slug, d]) => ({ slug, w: new Set([...words(name.replace(/_/g, " ")), ...words(d)]) }));

async function recommend(text, limit = 3) {
  const q = new Set(words(text));
  const score = {};
  for (const { slug, w } of INTENT_WORDS) {
    let s = 0;
    for (const t of q) if (w.has(t)) s++;
    if (s) score[slug] = Math.max(score[slug] || 0, s);
  }
  const items = await finchSearch("");
  let picks = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([slug]) => items.find((x) => x.slug === slug)).filter(Boolean);
  if (!picks.length) picks = await finchSearch(text);
  return picks.slice(0, limit).map((a) => card(a, false));
}

function agentCard(origin) {
  return {
    protocolVersion: "0.3.0",
    name: "Finch Agent Catalog",
    description: "Tell it what you need done and it returns the matching specialist agents on the Finch marketplace (official description, price, free runs, run link): on-chain fund tracing and wallet risk (MistTrack by SlowMist), Hyperliquid US equity perps, wheel-strategy options, sector returns vs S&P 500, Singapore property, resume tailoring and job search, science and health research, code review, website growth audits, and AI phone booking. Read-only, no auth.",
    url: `${origin}/a2a`,
    preferredTransport: "JSONRPC",
    version: "1.2.0",
    provider: { organization: "Finch Agent Catalog (community)", url: "https://github.com/a0971025732-netizen/finch-agent-catalog-mcp" },
    documentationUrl: "https://github.com/a0971025732-netizen/finch-agents",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: INTENTS.map(([name, , d]) => ({ id: name, name: name.replace(/_/g, " "), description: d, tags: words(name.replace(/_/g, " ")), examples: [] })),
  };
}

async function a2aHandle(msg) {
  const { id, method, params } = msg || {};
  if (method !== "message/send") return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not supported: ${method}. Use message/send.` } };
  const parts = params?.message?.parts || [];
  const text = parts.filter((p) => (p.kind || p.type) === "text").map((p) => p.text).join(" ").slice(0, 1000);
  if (!text.trim()) return { jsonrpc: "2.0", id, error: { code: -32602, message: "Send a text part describing the task." } };
  const results = await recommend(text);
  const lines = results.map((r, i) => `${i + 1}. ${r.name}: ${r.price}; ${r.free_runs}. Run: ${r.run_url}`).join("\n");
  return {
    jsonrpc: "2.0", id,
    result: {
      kind: "message", role: "agent", messageId: crypto.randomUUID(), contextId: params?.message?.contextId || crypto.randomUUID(),
      parts: [
        { kind: "text", text: `Finch agents for "${text.slice(0, 120)}":\n${lines}\nThe user runs one at its link (passkey or wallet sign-in), or connects the Finch MCP at ${MCP_URL}. Never ask for a private key.` },
        { kind: "data", data: { results, finch_mcp: MCP_URL } },
      ],
    },
  };
}

// Anonymous daily usage counters: date|protocol|method|client. No request content is stored.
async function bump(env, request, proto, what) {
  if (!env || !env.USAGE) return;
  const client = ((request.headers.get("user-agent") || "unknown").split(/[\/\s(]/)[0] || "unknown").toLowerCase().slice(0, 40);
  // Skip directory crawlers, health probes and the ~400/day python-httpx A2A probe to stay within the free KV write quota.
  if (/probe|bot|crawl|collector|health|check|monitor|scan|observ|census|harvest|survey|beat|watch|audit|verify|inventory|registry|directory|index/.test(client)) return;
  if (proto === "a2a" && client === "python-httpx") return;
  const key = `${new Date().toISOString().slice(0, 10)}|${proto}|${what}|${client}`;
  const n = Number((await env.USAGE.get(key)) || 0) + 1;
  await env.USAGE.put(key, String(n), { expirationTtl: 60 * 60 * 24 * 120 });
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "Mcp-Session-Id" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const track = (proto, what) => { try { ctx?.waitUntil(bump(env, request, proto, what).catch(() => {})); } catch {} };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/.well-known/agent-card.json" || url.pathname === "/.well-known/agent.json") return Response.json(agentCard(url.origin), { headers: CORS });
    if (url.pathname === "/a2a") {
      if (request.method !== "POST") return Response.json(agentCard(url.origin), { headers: CORS });
      let m;
      try { m = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS }); }
      track("a2a", m?.method || "unknown");
      try { return Response.json(await a2aHandle(m), { headers: CORS }); } catch (e) { return Response.json({ jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32603, message: String(e.message || e) } }, { headers: CORS }); }
    }
    if (url.pathname !== "/mcp") {
      return new Response(`Finch Agent Catalog MCP (read-only, no auth). Endpoint: ${url.origin}/mcp\nFull Finch MCP: ${MCP_URL}\n`, { headers: { "content-type": "text/plain", ...CORS } });
    }
    if (request.method === "GET") return new Response("Use POST for MCP JSON-RPC.", { status: 405, headers: { Allow: "POST", ...CORS } });
    let body;
    try { body = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS }); }
    for (const m of Array.isArray(body) ? body : [body]) {
      if (m?.method === "initialize") track("mcp", "initialize");
      else if (m?.method === "tools/call") track("mcp", `tools/call:${String(m.params?.name || "").slice(0, 60)}`);
    }
    const batch = Array.isArray(body);
    const out = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(batch ? out : out[0], { headers: CORS });
  },
};
