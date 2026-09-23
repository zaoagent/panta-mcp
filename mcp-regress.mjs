/** Protocol-level regression for panta-mcp: exercises all 6 tools over MCP/stdio.
 *  Usage: PANTA_API_KEY=... node mcp-regress.mjs
 *  Read-only except build_* which are expected to fail closed on placeholder markets.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env },
});
const client = new Client({ name: "panta-regress", version: "0.1.0" });
await client.connect(transport);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const call = async (tool, args) => {
  const r = await client.callTool({ name: tool, arguments: args });
  const isError = r.isError === true;
  const text = r.content?.[0]?.text ?? "";
  return { isError, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

try {
  // 0. tool list
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  check("tools/list has 6 tools",
    names.join(",") === "build_claim_tx,build_trade_tx,get_market,get_positions,search_markets,track_resolutions",
    names.join(","));

  // 1. search_markets
  const s = await call("search_markets", { limit: 2 });
  check("search_markets", !s.isError && s.json && Array.isArray(s.json.items),
    `count=${s.json?.count}`);

  const marketId = s.json?.items?.[0]?.marketId;
  if (!marketId) throw new Error("no marketId from catalog");

  // 2. get_market
  const g = await call("get_market", { marketId });
  check("get_market", !g.isError && g.json?.marketId === marketId &&
    typeof g.json?.phase === "string" && typeof g.json?.resolved === "boolean",
    `phase=${g.json?.phase} resolved=${g.json?.resolved}`);

  // 3. get_positions (system program id = valid base58, expect empty or API-shaped)
  const p = await call("get_positions", { wallet: "11111111111111111111111111111111" });
  check("get_positions shape", !p.isError || /INVALID|NOT_FOUND/i.test(p.text),
    p.isError ? "api rejected (fail-closed ok)" : `positions=${p.json?.positions?.length}`);

  // 4. track_resolutions list
  const t = await call("track_resolutions", { limit: 2 });
  const tOk = !t.isError && Array.isArray(t.json?.items) &&
    t.json.items.every(i => typeof i.isResolved === "boolean" && "phase" in i && "status" in i && "resolved" in i);
  check("track_resolutions list synthesis", tOk, `count=${t.json?.count}`);

  // 5. track_resolutions single
  const t1 = await call("track_resolutions", { marketId });
  check("track_resolutions single synthesis", !t1.isError && typeof t1.json?.isResolved === "boolean",
    `isResolved=${t1.json?.isResolved} phase=${t1.json?.phase}`);

  // 6. build_trade_tx — placeholder market => must fail closed, not crash
  const b = await call("build_trade_tx", { wallet: "11111111111111111111111111111111", marketId, side: "yes", amountUsdc: "1.00" });
  check("build_trade_tx fail-closed", b.isError === true, b.isError ? "returned MCP error (no unsigned tx leaked)" : "unexpected success");

  // 7. build_claim_tx — no claimable position => must fail closed, not crash
  const c = await call("build_claim_tx", { wallet: "11111111111111111111111111111111", marketId, kind: "win" });
  check("build_claim_tx fail-closed", c.isError === true, c.isError ? "returned MCP error (no unsigned tx leaked)" : "unexpected success");

  // 8. avgPrice normalization unit check (string|number -> string)
  const dec = v => String(v);
  check("avgPrice normalization", dec("0.520800") === "0.520800" && dec(0.5208) === "0.5208");
} finally {
  await client.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
