#!/usr/bin/env node
/**
 * panta-mcp — a prediction-market terminal for AI agents.
 * Tools wrap the Panta Public API (Solana USDC prediction markets).
 * SAFETY: build_* tools return UNSIGNED transactions only.
 * This server never holds private keys, never signs, never broadcasts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { panta } from "./panta.js";

const server = new McpServer({ name: "panta-mcp", version: "0.1.0" });
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

server.tool(
  "search_markets",
  "Search Panta's USDC prediction-market catalog. Filter by category/status; optional keyword matches title/description client-side.",
  {
    query: z.string().optional().describe("keyword matched against title/description"),
    category: z.string().optional().describe("e.g. crypto, politics, sports"),
    status: z.enum(["primary", "secondary", "resolved", "cancelled"]).optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, status, limit }) => {
    const r = await panta.listMarkets({ category, status, limit });
    const items = query
      ? r.items.filter(m => `${m.title} ${m.description}`.toLowerCase().includes(query.toLowerCase()))
      : r.items;
    return text({ count: items.length, nextCursor: r.nextCursor, items });
  }
);

server.tool(
  "get_market",
  "Full detail for one market, incl. live spot yesPrice/noPrice when RPC is available.",
  { marketId: z.string().describe("event/market address (base58)") },
  async ({ marketId }) => text(await panta.getMarket(marketId))
);

server.tool(
  "get_positions",
  "Holdings for a wallet: shares per side, phase, claim eligibility, outcome after resolution.",
  { wallet: z.string().describe("base58 Solana public key") },
  async ({ wallet }) => text(await panta.listPositions(wallet))
);

server.tool(
  "track_resolutions",
  "Recently resolved markets (phase/status=resolved), newest first via catalog order. Pass marketId to check one market's resolution state instead.",
  {
    marketId: z.string().optional().describe("check a single market"),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ marketId, limit }) => {
    if (marketId) {
      const m = await panta.getMarket(marketId);
      return text({ marketId: m.marketId, title: m.title, phase: m.phase, resolved: m.resolved, resolutionTime: m.resolutionTime });
    }
    const r = await panta.listMarkets({ status: "resolved", limit });
    return text({
      count: r.items.length,
      items: r.items.map(m => ({ marketId: m.marketId, title: m.title, phase: m.phase, resolutionTime: m.resolutionTime, volumeUsdc: m.volumeUsdc })),
      nextCursor: r.nextCursor,
    });
  }
);

server.tool(
  "build_trade_tx",
  "Quote a YES/NO primary buy and build the UNSIGNED Solana transaction (instructions + recentBlockhash). Quote lives ~90s. Returns unsigned tx only — sign in YOUR wallet and broadcast on YOUR RPC; this server never signs or broadcasts.",
  {
    wallet: z.string().describe("buyer wallet (base58) — will be the signer"),
    marketId: z.string().describe("event/market address (base58)"),
    side: z.enum(["yes", "no"]),
    amountUsdc: z.string().describe('human-readable USDC, e.g. "20.00"'),
    maxSlippageBps: z.number().min(1).max(5000).default(100),
  },
  async ({ wallet, marketId, side, amountUsdc, maxSlippageBps }) => {
    const q = await panta.quotePrimaryBuy({ wallet, marketId, side, amountUsdc });
    const built = await panta.buildPrimaryBuy({ quoteId: q.quoteId, wallet, maxSlippageBps });
    return text({
      warning: "UNSIGNED TRANSACTION — sign with the wallet above and broadcast on your own RPC. Nothing was submitted on-chain by this server.",
      quote: { shares: q.shares, avgPrice: q.avgPrice, feeUsdc: q.feeUsdc, expiresAt: q.expiresAt },
      unsignedTx: built,
    });
  }
);

server.tool(
  "build_claim_tx",
  "Build UNSIGNED claim instructions for a wallet. kind=win: redeem winning shares of a resolved market (check get_positions claimable first). kind=creator-fees: creator fee vault of a graduated market. Unsigned only — never signs or broadcasts.",
  {
    wallet: z.string().describe("claimant wallet (base58) — will be the signer"),
    marketId: z.string().describe("event/market address (base58)"),
    kind: z.enum(["win", "creator-fees"]).default("win"),
  },
  async ({ wallet, marketId, kind }) => {
    const built = kind === "win"
      ? await panta.buildWinClaim(wallet, marketId)
      : await panta.buildCreatorFeeClaim(wallet, marketId);
    return text({
      warning: "UNSIGNED TRANSACTION — sign with the wallet above and broadcast on your own RPC. Nothing was submitted on-chain by this server.",
      kind,
      unsignedTx: built,
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
