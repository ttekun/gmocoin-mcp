import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, it } from "node:test";
import { buildServer } from "../src/server.js";

const originalFetch = globalThis.fetch;
let fetchCalls = 0;

afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchCalls = 0;
});

function stubFetch(): void {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ status: 0, data: "1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function resultText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const block = result.content[0];
  return block?.type === "text" ? block.text : "";
}

describe("decimal string tool inputs", () => {
  const accepted = ["0.01", "1", "12345"];
  const rejected = ["-1", "1e3", "1,000", " 1", "abc", ""];

  async function withClient(
    check: (client: Client) => Promise<void>,
  ): Promise<void> {
    const server = buildServer({
      apiKey: "test-key",
      apiSecret: "test-secret",
      hasCredentials: true,
      tradingEnabled: true,
    });
    const client = new Client({ name: "schema-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      await check(client);
    } finally {
      await client.close();
      await server.close();
    }
  }

  for (const size of accepted) {
    it(`accepts gmo_place_order size ${JSON.stringify(size)}`, async () => {
      stubFetch();
      await withClient(async (client) => {
        const result = await client.callTool({
          name: "gmo_place_order",
          arguments: {
            symbol: "BTC",
            side: "BUY",
            executionType: "MARKET",
            size,
          },
        });
        assert.notEqual(result.isError, true);
        assert.equal(fetchCalls, 1);
      });
    });
  }

  for (const size of rejected) {
    it(`rejects gmo_place_order size ${JSON.stringify(size)}`, async () => {
      stubFetch();
      await withClient(async (client) => {
        const result = await client.callTool({
          name: "gmo_place_order",
          arguments: {
            symbol: "BTC",
            side: "BUY",
            executionType: "MARKET",
            size,
          },
        });
        assert.equal(result.isError, true);
        assert.match(resultText(result), /non-negative decimal string/);
        assert.equal(fetchCalls, 0);
      });
    });
  }

  for (const amount of accepted) {
    it(`accepts gmo_transfer_jpy amount ${JSON.stringify(amount)}`, async () => {
      stubFetch();
      await withClient(async (client) => {
        const result = await client.callTool({
          name: "gmo_transfer_jpy",
          arguments: { amount, transferType: "WITHDRAWAL" },
        });
        assert.notEqual(result.isError, true);
        assert.equal(fetchCalls, 1);
      });
    });
  }

  for (const amount of rejected) {
    it(`rejects gmo_transfer_jpy amount ${JSON.stringify(amount)}`, async () => {
      stubFetch();
      await withClient(async (client) => {
        const result = await client.callTool({
          name: "gmo_transfer_jpy",
          arguments: { amount, transferType: "WITHDRAWAL" },
        });
        assert.equal(result.isError, true);
        assert.match(resultText(result), /non-negative decimal string/);
        assert.equal(fetchCalls, 0);
      });
    });
  }
});
