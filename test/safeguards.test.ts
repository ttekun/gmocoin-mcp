import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, it } from "node:test";
import { loadConfig, type Config } from "../src/config.js";
import { buildServer } from "../src/server.js";

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; body?: string }> = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  requests.length = 0;
});

function stubFetch(): void {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
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

function tradingConfig(extra: Partial<Config> = {}): Config {
  return {
    apiKey: "test-key",
    apiSecret: "test-secret",
    hasCredentials: true,
    tradingEnabled: true,
    ...extra,
  };
}

async function withClient(
  config: Config,
  check: (client: Client) => Promise<void>,
): Promise<void> {
  const server = buildServer(config);
  const client = new Client({ name: "safeguard-test", version: "1.0.0" });
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

describe("trading safeguards", () => {
  const idOperations = [
    { name: "gmo_change_order", arguments: { orderId: 1, price: "1" } },
    { name: "gmo_cancel_order", arguments: { orderId: 1 } },
    { name: "gmo_cancel_orders", arguments: { orderIds: [1] } },
    { name: "gmo_change_losscut_price", arguments: { positionId: 1, losscutPrice: "1" } },
  ];

  for (const symbols of [[], ["BTC"]]) {
    it(`blocks all ID-based mutations with allowlist ${JSON.stringify(symbols)}`, async () => {
      stubFetch();
      await withClient(tradingConfig({ allowedSymbols: new Set(symbols) }), async (client) => {
        for (const operation of idOperations) {
          const result = await client.callTool(operation);
          assert.equal(result.isError, true, operation.name);
          assert.match(resultText(result), /GMO_ALLOWED_SYMBOLS/);
        }
        assert.equal(requests.length, 0);
      });
    });
  }

  it("allows ID-based mutations without a symbol allowlist", async () => {
    stubFetch();
    await withClient(tradingConfig(), async (client) => {
      for (const operation of idOperations) {
        const result = await client.callTool(operation);
        assert.notEqual(result.isError, true, operation.name);
      }
      assert.equal(requests.length, idOperations.length);
    });
  });

  it("parses optional limits and treats blanks as unset", () => {
    const parsed = loadConfig({
      GMO_API_KEY: "key",
      GMO_API_SECRET: "secret",
      GMO_ENABLE_TRADING: "true",
      GMO_ALLOWED_SYMBOLS: " BTC, ETH ",
      GMO_MAX_ORDER_SIZE: " 0.50 ",
    });
    assert.deepEqual([...(parsed.allowedSymbols ?? [])], ["BTC", "ETH"]);
    assert.equal(parsed.maxOrderSize, "0.50");

    const unset = loadConfig({
      GMO_API_KEY: "key",
      GMO_API_SECRET: "secret",
      GMO_ENABLE_TRADING: "true",
      GMO_ALLOWED_SYMBOLS: " , ",
      GMO_MAX_ORDER_SIZE: " ",
    });
    assert.equal(unset.allowedSymbols, undefined);
    assert.equal(unset.maxOrderSize, undefined);
    assert.equal(unset.maxOrderSizeInvalid, undefined);

    const invalid = loadConfig({
      GMO_API_KEY: "key",
      GMO_API_SECRET: "secret",
      GMO_ENABLE_TRADING: "true",
      GMO_MAX_ORDER_SIZE: "1e3",
    });
    assert.equal(invalid.maxOrderSize, undefined);
    assert.equal(invalid.maxOrderSizeInvalid, true);
  });

  it("refuses size-checked orders when GMO_MAX_ORDER_SIZE is not a decimal", async () => {
    stubFetch();
    const config = loadConfig({
      GMO_API_KEY: "key",
      GMO_API_SECRET: "secret",
      GMO_ENABLE_TRADING: "true",
      GMO_MAX_ORDER_SIZE: "-1",
    });
    await withClient(config, async (client) => {
      const result = await client.callTool({
        name: "gmo_place_order",
        arguments: {
          symbol: "BTC",
          side: "BUY",
          executionType: "MARKET",
          size: "1",
        },
      });
      assert.equal(result.isError, true);
      assert.match(resultText(result), /GMO_MAX_ORDER_SIZE/);
      assert.equal(requests.length, 0);
    });
  });

  it("sends an allowed order at the configured size", async () => {
    stubFetch();
    await withClient(
      tradingConfig({
        allowedSymbols: new Set(["BTC"]),
        maxOrderSize: "1.1",
      }),
      async (client) => {
        const result = await client.callTool({
          name: "gmo_place_order",
          arguments: {
            symbol: "BTC",
            side: "BUY",
            executionType: "MARKET",
            size: "1.10",
          },
        });
        assert.notEqual(result.isError, true);
        assert.equal(requests.length, 1);
        assert.match(requests[0]?.body ?? "", /"size":"1.10"/);
      },
    );
  });

  it("rejects a symbol outside GMO_ALLOWED_SYMBOLS before any request", async () => {
    stubFetch();
    await withClient(
      tradingConfig({ allowedSymbols: new Set(["BTC"]) }),
      async (client) => {
        const result = await client.callTool({
          name: "gmo_place_order",
          arguments: {
            symbol: "ETH",
            side: "BUY",
            executionType: "MARKET",
            size: "0.01",
          },
        });
        assert.equal(result.isError, true);
        assert.match(resultText(result), /ETH/);
        assert.match(resultText(result), /GMO_ALLOWED_SYMBOLS \(BTC\)/);
        assert.equal(requests.length, 0);
      },
    );
  });

  it("rejects a size above GMO_MAX_ORDER_SIZE before any request", async () => {
    stubFetch();
    await withClient(
      tradingConfig({ maxOrderSize: "9007199254740992" }),
      async (client) => {
        const result = await client.callTool({
          name: "gmo_place_order",
          arguments: {
            symbol: "BTC",
            side: "BUY",
            executionType: "MARKET",
            size: "9007199254740993",
          },
        });
        assert.equal(result.isError, true);
        assert.match(
          resultText(result),
          /Size 9007199254740993 exceeds GMO_MAX_ORDER_SIZE 9007199254740992/,
        );
        assert.equal(requests.length, 0);
      },
    );
  });

  it("passes symbols and sizes through when both limits are unset", async () => {
    stubFetch();
    await withClient(tradingConfig(), async (client) => {
      const result = await client.callTool({
        name: "gmo_place_order",
        arguments: {
          symbol: "ETH",
          side: "BUY",
          executionType: "MARKET",
          size: "9007199254740993",
        },
      });
      assert.notEqual(result.isError, true);
      assert.equal(requests.length, 1);
      assert.match(requests[0]?.body ?? "", /"symbol":"ETH"/);
      assert.match(requests[0]?.body ?? "", /"size":"9007199254740993"/);
    });
  });

  it("applies the symbol and size limits to close and bulk-cancel tools", async () => {
    stubFetch();
    const limited = tradingConfig({
      allowedSymbols: new Set(["BTC_JPY"]),
      maxOrderSize: "0.5",
    });
    await withClient(limited, async (client) => {
      const closeOrder = await client.callTool({
        name: "gmo_close_order",
        arguments: {
          symbol: "BTC_JPY",
          side: "SELL",
          executionType: "MARKET",
          settlePosition: [{ positionId: 1, size: "0.50" }],
        },
      });
      const closeBulk = await client.callTool({
        name: "gmo_close_bulk_order",
        arguments: {
          symbol: "ETH_JPY",
          side: "SELL",
          executionType: "MARKET",
          size: "0.1",
        },
      });
      const oversized = await client.callTool({
        name: "gmo_close_bulk_order",
        arguments: {
          symbol: "BTC_JPY",
          side: "SELL",
          executionType: "MARKET",
          size: "0.51",
        },
      });
      const cancelBulk = await client.callTool({
        name: "gmo_cancel_bulk_order",
        arguments: { symbols: ["BTC_JPY", "ETH"] },
      });

      assert.notEqual(closeOrder.isError, true);
      assert.equal(closeBulk.isError, true);
      assert.match(resultText(closeBulk), /ETH_JPY/);
      assert.equal(oversized.isError, true);
      assert.match(resultText(oversized), /GMO_MAX_ORDER_SIZE 0\.5/);
      assert.equal(cancelBulk.isError, true);
      assert.match(resultText(cancelBulk), /ETH/);
      assert.equal(requests.length, 1);
      assert.match(requests[0]?.url ?? "", /\/v1\/closeOrder$/);
    });
  });
});
