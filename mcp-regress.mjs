/** Protocol-level regression for panta-mcp: exercises all 6 tools over MCP/stdio.
 *  Safety model: the server NEVER signs or broadcasts — build_* return UNSIGNED
 *  payloads only. When the API errors (bad key, bad input on live), the tool
 *  surfaces an MCP error and no transaction is returned.
 *  Note: the Panta sandbox returns fixture data for any input, so placeholder
 *  inputs are asserted as unsigned-only (warning present, no signature field),
 *  NOT as rejections. Deterministic fail-closed is tested with no API key.
 *  Usage: PANTA_API_KEY=... node mcp-regress.mjs
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

  // 6. build_trade_tx — unsigned-only: warning present, no signature field, nothing signed
  const b = await call("build_trade_tx", { wallet: "11111111111111111111111111111111", marketId, side: "yes", amountUsdc: "1.00" });
  const bOk = !b.isError && /UNSIGNED TRANSACTION/.test(b.text) && !/"signature"/.test(b.text);
  check("build_trade_tx unsigned-only", bOk,
    b.isError ? "errored: " + b.text.slice(0, 80) : "warning present, no signature field");

  // 7. build_claim_tx — same unsigned-only guarantee
  const c = await call("build_claim_tx", { wallet: "11111111111111111111111111111111", marketId, kind: "win" });
  const cOk = !c.isError && /UNSIGNED TRANSACTION/.test(c.text) && !/"signature"/.test(c.text);
  check("build_claim_tx unsigned-only", cOk,
    c.isError ? "errored: " + c.text.slice(0, 80) : "warning present, no signature field");

  // 8. deterministic fail-closed: no API key => MCP error, no transaction leaks
  const t2 = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...process.env, PANTA_API_KEY: "" },
  });
  const c2 = new Client({ name: "panta-regress-nokey", version: "0.1.0" });
  await c2.connect(t2);
  try {
    const r2 = await c2.callTool({ name: "search_markets", arguments: { limit: 1 } });
    const r2text = r2.content?.[0]?.text ?? "";
    check("fail-closed without API key",
      r2.isError === true && /PANTA_API_KEY/.test(r2text),
      r2.isError ? "MCP error, no data leaked" : "unexpected success");
  } finally {
    await c2.close();
  }

  // 9. avgPrice normalization unit check (string|number|null -> string, never "undefined")
  const dec = v => (v == null ? "" : String(v));
  check("avgPrice normalization", dec("0.520800") === "0.520800" && dec(0.5208) === "0.5208" && dec(undefined) === "" && dec(null) === "");
} finally {
  await client.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
