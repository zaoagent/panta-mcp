/**
 * Thin typed client for the Panta Public API.
 * Base: https://live-api.panta.market/api/v1
 * Auth: X-Api-Key header (or Authorization: Bearer). Key comes from env only.
 * This client NEVER signs or broadcasts anything on-chain.
 */

const BASE = process.env.PANTA_BASE_URL ?? "https://live-api.panta.market/api/v1";
const KEY = process.env.PANTA_API_KEY ?? "";
const USER_ID = process.env.PANTA_USER_ID ?? "";
const UA = { "User-Agent": "panta-mcp/0.1 (+https://github.com/zao/panta-mcp)" };

export class PantaError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(`Panta API ${status} [${code}]: ${message}`);
    this.status = status;
    this.code = code;
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!KEY) throw new Error("PANTA_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": KEY,
      ...UA,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PantaError(res.status, body.code ?? "HTTP_ERROR", body.message ?? res.statusText);
  }
  return body as T;
}

const get = <T>(path: string) => req<T>(path);
const post = <T>(path: string, data: unknown) =>
  req<T>(path, { method: "POST", body: JSON.stringify(data) });

export interface MarketItem {
  marketId: string; category: string; title: string; description: string;
  images: string[]; phase: string; marketType: string;
  startTime: number; endTime: number; resolutionTime: number;
  region: string; resolved: boolean; status: string; volumeUsdc: string;
  yesPrice: string | null; noPrice: string | null;
}

export interface Position {
  marketId: string; category: string | null; side: "yes" | "no";
  shares: string; phase: string; claimable: boolean; claimed: boolean;
  outcome: "yes" | "no" | null;
}

/** Panta returns human-readable decimals; docs show strings ("0.520800")
 *  but be tolerant — normalize string|number to string so callers never
 *  crash on a type mismatch. */
type Decimal = string | number;
const dec = (v: Decimal): string => String(v);

export interface PrimaryQuote {
  quoteId: string; marketId: string; side: "yes" | "no";
  amountUsdc: string; shares: string; avgPrice: string;
  feeUsdc: string; expiresAt: string; blockhashExpiryHintSec?: number;
}

export const panta = {
  listMarkets: (p: { category?: string; status?: string; limit?: number; cursor?: string }) => {
    const q = new URLSearchParams();
    if (p.category) q.set("category", p.category);
    if (p.status) q.set("status", p.status);
    q.set("limit", String(Math.min(p.limit ?? 20, 50)));
    if (p.cursor) q.set("cursor", p.cursor);
    return get<{ items: MarketItem[]; nextCursor: string | null }>(`/markets/?${q}`);
  },

  getMarket: (marketId: string) => get<MarketItem>(`/markets/${marketId}/`),

  listPositions: (wallet: string) =>
    get<{ wallet: string; positions: Position[] }>(
      `/positions/?wallet=${encodeURIComponent(wallet)}`),

  quotePrimaryBuy: async (p: { wallet: string; marketId: string; side: "yes" | "no"; amountUsdc: string }): Promise<PrimaryQuote> => {
    const raw = await post<{
      quoteId: string; marketId: string; side: "yes" | "no"; amountUsdc: Decimal;
      shares: Decimal; avgPrice: Decimal; feeUsdc: Decimal;
      expiresAt: string; blockhashExpiryHintSec?: number;
    }>(
      `/primaryorderquote/`,
      { wallet: p.wallet, marketId: p.marketId, side: p.side, amountUsdc: p.amountUsdc, ...(USER_ID ? { userId: USER_ID } : {}) });
    return {
      ...raw,
      amountUsdc: dec(raw.amountUsdc),
      shares: dec(raw.shares),
      avgPrice: dec(raw.avgPrice),
      feeUsdc: dec(raw.feeUsdc),
    };
  },

  buildPrimaryBuy: (p: { quoteId: string; wallet: string; maxSlippageBps?: number }) =>
    post(`/primaryorderbuild/`,
      { quoteId: p.quoteId, wallet: p.wallet, maxSlippageBps: p.maxSlippageBps ?? 100, ...(USER_ID ? { userId: USER_ID } : {}) }),

  buildWinClaim: (wallet: string, marketId: string) =>
    post(`/claim/build/`, { wallet, marketId }),

  buildCreatorFeeClaim: (wallet: string, marketId: string) =>
    post(`/claim/creator-fees/build/`, { wallet, marketId }),
};
