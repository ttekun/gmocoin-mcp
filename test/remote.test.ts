import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleRemoteRequest, type RemoteEnv } from "../src/remote.js";

const initializeBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "curl", version: "0" },
  },
};

function request(
  path: string,
  init: RequestInit = {},
): Request {
  return new Request(`http://localhost${path}`, init);
}

async function withClient(
  env: RemoteEnv,
  headers: HeadersInit,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      fetch: (input, init) =>
        handleRemoteRequest(new Request(input, init), env),
      requestInit: { headers },
    },
  );
  const client = new Client({ name: "remote-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
  }
}

describe("remote handler", () => {
  it("returns 405 for non-POST methods before opening a transport", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", { method: "GET" }),
      {},
    );

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  });

  it("returns 404 for any path other than /mcp", async () => {
    const response = await handleRemoteRequest(
      request("/", { method: "POST" }),
      {},
    );

    assert.equal(response.status, 404);
  });

  it("returns the initialize result as JSON", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initializeBody),
      }),
      {},
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      result: { serverInfo: { name: string } };
    };
    assert.equal(body.result.serverInfo.name, "gmocoin-mcp");
  });

  it("lists 6 public tools when credentials are absent", async () => {
    await withClient({}, {}, async (client) => {
      const result = await client.listTools();
      assert.equal(result.tools.length, 6);
    });
  });

  it("ignores Worker credentials when request headers are absent", async () => {
    await withClient(
      {
        GMO_API_KEY: "dummy-key",
        GMO_API_SECRET: "dummy-secret",
      },
      {},
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 6);
      },
    );
  });

  it("lists 20 tools when only key and secret headers are sent", async () => {
    await withClient(
      {},
      {
        "X-GMO-API-KEY": "dummy-key",
        "X-GMO-API-SECRET": "dummy-secret",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 20);
      },
    );
  });

  it("ignores a stray Authorization header", async () => {
    await withClient(
      {},
      {
        Authorization: "Bearer anything",
        "X-GMO-API-KEY": "dummy-key",
        "X-GMO-API-SECRET": "dummy-secret",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 20);
      },
    );
  });

  it("lists 20 tools when only the user enables trading", async () => {
    await withClient(
      {},
      {
        "X-GMO-API-KEY": "dummy-key",
        "X-GMO-API-SECRET": "dummy-secret",
        "X-GMO-ENABLE-TRADING": "true",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 20);
      },
    );
  });

  it("lists 29 tools when the user and operator enable trading", async () => {
    await withClient(
      { GMO_ENABLE_TRADING: "true" },
      {
        "X-GMO-API-KEY": "dummy-key",
        "X-GMO-API-SECRET": "dummy-secret",
        "X-GMO-ENABLE-TRADING": "true",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 29);
      },
    );
  });
});
