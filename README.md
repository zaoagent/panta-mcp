# panta-mcp

A prediction-market terminal for AI agents — an MCP server wrapping the
[Panta Public API](https://docs.panta.market) (USDC prediction markets on Solana).

Any MCP-capable agent gets instant, typed access to: market discovery, live
prices, wallet positions, resolution tracking, and **unsigned** trade/claim
transaction building.

> **Safety model:** Panta cooks the transaction, your wallet signs, you
> broadcast on your own RPC. This server never holds private keys, never
> signs, and never broadcasts anything on-chain. `build_trade_tx` and
> `build_claim_tx` stop at the unsigned transaction.

## Quickstart

```bash
npm install
npm run build

# put your Panta API key in the environment (get one free at docs.panta.market)
export PANTA_API_KEY=pk_test_…
export PANTA_BASE_URL=https://live-api.panta.market/api/v1  # default

# run the server (stdio)
npm start
```

### Use with Claude Desktop / any MCP client

```json
{
  "mcpServers": {
    "panta": {
      "command": "node",
      "args": ["/path/to/panta-mcp/dist/index.js"],
      "env": { "PANTA_API_KEY": "pk_test_…" }
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `search_markets` | Search the USDC market catalog (category/status filters + keyword) |
| `get_market` | Market detail with live spot yes/no prices |
| `get_positions` | Wallet holdings: shares, phase, claim eligibility, outcome |
| `track_resolutions` | Recently resolved markets, or one market's resolution state |
| `build_trade_tx` | Quote a YES/NO primary buy → **unsigned** Solana tx |
| `build_claim_tx` | **Unsigned** win-claim or creator-fee-claim instructions |

Typical agent flow:

1. `search_markets` → find an interesting market
2. `get_market` → check live price
3. `build_trade_tx` → get unsigned instructions → sign in your wallet → broadcast on your RPC

## Config

| Env var | Required | Default |
|---|---|---|
| `PANTA_API_KEY` | yes | — |
| `PANTA_BASE_URL` | no | `https://live-api.panta.market/api/v1` |
| `PANTA_USER_ID` | no | — (trade attribution) |

## License

MIT
