# ARCHITECTURE — panta-mcp

## Idea

AI agents can't trade prediction markets because every integration assumes a
human with a wallet UI. `panta-mcp` flips it: the Panta API already returns
**unsigned** Solana transactions — an agent just needs them as MCP tools.
One server, six tools, any MCP-capable agent becomes a prediction-market
participant (read everything; write only up to the signature line).

## Layout

```
src/
  index.ts   MCP server: 6 tools, zod schemas, stdio transport
  panta.ts   thin typed client: fetch wrapper + endpoint map, no business logic
```

No framework, no DB, no state. The Panta API is the backend; this repo is a
typed, agent-friendly façade.

## Data flow

```
agent ──MCP/stdio──▶ panta-mcp ──HTTPS (X-Api-Key)──▶ live-api.panta.market
                                                │
quotes/builds return unsigned instructions ◀────┘
agent signs in its own wallet, broadcasts on its own RPC (out of scope here)
```

## Tool → endpoint map

| Tool | Panta endpoint(s) |
|---|---|
| `search_markets` | `GET /markets/` (+ client-side keyword filter) |
| `get_market` | `GET /markets/{marketId}/` |
| `get_positions` | `GET /positions/?wallet=` |
| `track_resolutions` | `GET /markets/?status=resolved` or `GET /markets/{marketId}/` |
| `build_trade_tx` | `POST /primaryorderquote/` → `POST /primaryorderbuild/` |
| `build_claim_tx` | `POST /claim/build/` or `POST /claim/creator-fees/build/` |

Full endpoint reference: https://docs.panta.market/llms.txt

## Trust boundaries

- **Secrets:** `PANTA_API_KEY` lives in the process environment only.
  Never in the repo, never in logs, never in tool output.
- **Custody:** the server cannot move funds — it has no keys and emits no
  signatures. Write-path tools are quote/build (off-chain, free).
- **Amounts:** market creation uses USDC base-unit integer strings;
  primary buys use human-readable decimal strings (per Panta docs).
- **Freshness:** quotes expire (~90s); builds reject stale quotes
  (`QUOTE_STALE`) — callers must re-quote.

## Zero-cost design

Everything in the demo path is read-only or off-chain: catalog reads,
position reads, quote + build (unsigned). No market creation ($50/$20 fee),
no broadcast, no signature — the full loop is demonstrable for $0.
