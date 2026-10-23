// Finch Agent Catalog: a read-only, no-auth MCP server (Streamable HTTP, stateless JSON responses).
// Lets any agent discover agents on the Finch marketplace before the user connects the full Finch MCP.
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
