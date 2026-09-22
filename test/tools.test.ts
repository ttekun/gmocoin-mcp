import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it } from "node:test";
import type { Config } from "../src/config.js";
import { buildServer } from "../src/server.js";

async function listTools(config: Config) {
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
  return result.tools;
}

describe("tool safety gates", () => {
  it("registers exactly 6 public tools without credentials", async () => {
    const tools = await listTools({
      hasCredentials: false,
      tradingEnabled: false,
    });
    const names = tools.map((tool) => tool.name).sort();

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
    const tools = await listTools({
      apiKey: "test-key",
      apiSecret: "test-secret",
      hasCredentials: true,
      tradingEnabled: false,
    });
    const names = tools.map((tool) => tool.name);

    assert.equal(names.length, 20);
    assert.ok(!names.includes("gmo_place_order"));
    assert.ok(!names.includes("gmo_transfer_jpy"));
  });

  it("registers all 29 tools when trading is enabled", async () => {
    const tools = await listTools({
      apiKey: "test-key",
      apiSecret: "test-secret",
      hasCredentials: true,
      tradingEnabled: true,
    });
    const names = tools.map((tool) => tool.name);

    assert.equal(names.length, 29);
    assert.ok(names.includes("gmo_place_order"));
    assert.ok(names.includes("gmo_transfer_jpy"));

    const writePrefixes = [
      "gmo_place_",
      "gmo_change_",
      "gmo_cancel_",
      "gmo_close_",
      "gmo_transfer_",
    ];
    for (const tool of tools) {
      const isWrite = writePrefixes.some((prefix) => tool.name.startsWith(prefix));
      if (isWrite) {
        assert.equal(
          tool.annotations?.destructiveHint,
          true,
          `${tool.name} must be marked destructive`,
        );
      } else {
        assert.equal(
          tool.annotations?.readOnlyHint,
          true,
          `${tool.name} must be marked read-only`,
        );
      }
    }
  });
});
