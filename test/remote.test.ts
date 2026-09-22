import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleRemoteRequest, type RemoteEnv } from "../src/remote.js";

const TOKEN = "test-token";

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
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      fetch: (input, init) =>
        handleRemoteRequest(new Request(input, init), env),
      requestInit: {
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
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
  it("returns 503 when MCP_AUTH_TOKEN is not configured", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      {},
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "MCP_AUTH_TOKEN is not configured",
    });
  });

  it("returns 401 when the bearer token is missing", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", { method: "POST" }),
      { MCP_AUTH_TOKEN: TOKEN },
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("WWW-Authenticate"), "Bearer");
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
      }),
      { MCP_AUTH_TOKEN: TOKEN },
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("WWW-Authenticate"), "Bearer");
  });

  it("returns 405 for non-POST methods before opening a transport", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", {
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { MCP_AUTH_TOKEN: TOKEN },
    );

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  });

  it("returns 404 for any path other than /mcp", async () => {
    const response = await handleRemoteRequest(
      request("/", {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { MCP_AUTH_TOKEN: TOKEN },
    );

    assert.equal(response.status, 404);
  });

  it("returns the initialize result as JSON", async () => {
    const response = await handleRemoteRequest(
      request("/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initializeBody),
      }),
      { MCP_AUTH_TOKEN: TOKEN },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      result: { serverInfo: { name: string } };
    };
    assert.equal(body.result.serverInfo.name, "gmocoin-mcp");
  });

  it("lists 6 public tools when credentials are absent", async () => {
    await withClient({ MCP_AUTH_TOKEN: TOKEN }, async (client) => {
      const result = await client.listTools();
      assert.equal(result.tools.length, 6);
    });
  });

  it("lists 20 tools when dummy credentials are configured", async () => {
    await withClient(
      {
        MCP_AUTH_TOKEN: TOKEN,
        GMO_API_KEY: "dummy-key",
        GMO_API_SECRET: "dummy-secret",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 20);
      },
    );
  });

  it("lists 29 tools when trading is enabled", async () => {
    await withClient(
      {
        MCP_AUTH_TOKEN: TOKEN,
        GMO_API_KEY: "dummy-key",
        GMO_API_SECRET: "dummy-secret",
        GMO_ENABLE_TRADING: "true",
      },
      async (client) => {
        const result = await client.listTools();
        assert.equal(result.tools.length, 29);
      },
    );
  });
});
