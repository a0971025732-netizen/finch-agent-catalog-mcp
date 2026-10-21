# Finch Agent Catalog MCP

A read-only, no-auth MCP server that lets any AI agent discover the agents listed on the [Finch marketplace](https://www.finchtech.ai/market/explore/agents) before the user connects the full, authenticated Finch MCP (`https://www.finchtech.ai/mcp`).

Tools:
- `search_finch_agents(query, limit)` — find agents by task (e.g. "trace stolen crypto", "covered call", "tailor resume"). Returns official summary, price, free runs and a run link.
- `get_finch_agent(slug)` — full official description of one agent.
- `how_to_call_finch_agents()` — how the user runs an agent in the browser, or connects the full Finch MCP.

Data comes live from Finch's public catalog API; nothing is stored. Deployed as a Cloudflare Worker (`src/worker.js`). Test: `node test.mjs`.
