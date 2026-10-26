# Finch Agent Catalog MCP

A read-only, no-auth MCP server that lets any AI agent discover the agents listed on the [Finch marketplace](https://www.finchtech.ai/market/explore/agents) before the user connects the full, authenticated Finch MCP (`https://www.finchtech.ai/mcp`).

Tools:
- `search_finch_agents(query, limit)` — find agents by task (e.g. "trace stolen crypto", "covered call", "tailor resume"). Returns official summary, price, free runs and a run link.
- `get_finch_agent(slug)` — full official description of one agent.
- `how_to_call_finch_agents()` — how the user runs an agent in the browser, or connects the full Finch MCP.
- 14 task-named tools (e.g. `trace_crypto_funds`, `tailor_resume_to_job`, `screen_wheel_strategy_options`) that return the matching Finch agent.

Free utilities (no account, no key; each result also suggests the Finch agent that goes further):
- `check_crypto_address_sanctions(address)` — exact-match check against the US Treasury OFAC SDN digital-currency addresses.
- `extract_ats_keywords(job_description, resume_text?)` — ranked ATS keywords from a job description, plus resume coverage and missing keywords.
- `get_us_macro_event_calendar(days, types?)` — upcoming FOMC decisions, CPI, PPI and jobs reports from official Fed and BLS schedules.
- `get_hyperliquid_stock_perps(tickers?, limit?)` — live funding, open interest and volume for US stock/index perps on Hyperliquid (HIP-3 xyz).
- `calculate_singapore_stamp_duty(price_sgd, buyer, property_count)` — BSD and ABSD at current IRAS rates.
- `get_us_treasury_yield_curve(compare_days?)` — latest US Treasury yield curve with change and 2y-10y / 3m-10y spreads.

The same catalog also speaks A2A: agent card at `/.well-known/agent-card.json`, `message/send` at `/a2a`.

Data comes live from Finch's public catalog API; nothing is stored. Live endpoint: `https://finch-agent-catalog.finch-catalog-mcp.workers.dev/mcp` (streamable HTTP, no auth). Deployed as a Cloudflare Worker (`src/worker.js`). Test: `node test.mjs`.
