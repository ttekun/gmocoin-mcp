import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it } from "node:test";
import type { Config } from "../src/config.js";
import { buildServer } from "../src/index.js";

async function listToolNames(config: Config): Promise<string[]> {
  const server = buildServer(config);
  const client = new Client({ name: "gmocoin-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const result = await client.listTools();
  await client.close();
  await server.close();
  return result.tools.map((tool) => tool.name).sort();
}

describe("tool safety gates", () => {
  it("registers exactly 6 public tools without credentials", async () => {
    const names = await listToolNames({
      hasCredentials: false,
      tradingEnabled: false,
    });

    assert.equal(names.length, 6);
    assert.deepEqual(names, [
      "gmo_get_klines",
      "gmo_get_orderbooks",
      "gmo_get_status",
      "gmo_get_symbols",
      "gmo_get_ticker",
      "gmo_get_trades",
    ]);
  });

  it("registers 20 tools with credentials and trading disabled", async () => {
    const names = await listToolNames({
      apiKey: "test-key",
      apiSecret: "test-secret",
      hasCredentials: true,
      tradingEnabled: false,
    });

    assert.equal(names.length, 20);
    assert.ok(!names.includes("gmo_place_order"));
    assert.ok(!names.includes("gmo_transfer_jpy"));
  });

  it("registers all 29 tools when trading is enabled", async () => {
    const names = await listToolNames({
      apiKey: "test-key",
      apiSecret: "test-secret",
      hasCredentials: true,
      tradingEnabled: true,
    });

    assert.equal(names.length, 29);
    assert.ok(names.includes("gmo_place_order"));
    assert.ok(names.includes("gmo_transfer_jpy"));
  });
});
