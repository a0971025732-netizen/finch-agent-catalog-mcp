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
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification
  try {
    if (method === "initialize") {
      return { jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "finch-agent-catalog", title: "Finch Agent Catalog", version: "1.0.0" }, instructions: "Read-only catalog of agents on the Finch marketplace. Search by the user's task, then send the user the run_url or help them connect the full Finch MCP." } };
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

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "Mcp-Session-Id" };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname !== "/mcp") {
      return new Response(`Finch Agent Catalog MCP (read-only, no auth). Endpoint: ${url.origin}/mcp\nFull Finch MCP: ${MCP_URL}\n`, { headers: { "content-type": "text/plain", ...CORS } });
    }
    if (request.method === "GET") return new Response("Use POST for MCP JSON-RPC.", { status: 405, headers: { Allow: "POST", ...CORS } });
    let body;
    try { body = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS }); }
    const batch = Array.isArray(body);
    const out = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(batch ? out : out[0], { headers: CORS });
  },
};
