import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

// `type`, not `interface`: only type-alias object types get an implicit index
// signature, which this value needs to be passed to loadConfig.
export type RemoteEnv = {
  GMO_API_KEY?: string;
  GMO_API_SECRET?: string;
  GMO_ENABLE_TRADING?: string;
  GMO_ALLOWED_SYMBOLS?: string;
  GMO_MAX_ORDER_SIZE?: string;
  MCP_AUTH_TOKEN?: string;
};

function jsonError(
  status: number,
  message: string,
  headers?: HeadersInit,
): Response {
  return Response.json({ error: message }, { status, headers });
}

function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get("Authorization");
  if (header === null) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token ? token : undefined;
}

function bearerTokensMatch(expected: string, presented: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const presentedBytes = encoder.encode(presented);
  if (expectedBytes.byteLength !== presentedBytes.byteLength) return false;
  return timingSafeEqual(expectedBytes, presentedBytes);
}

export async function handleRemoteRequest(
  request: Request,
  env: RemoteEnv,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== "/mcp") {
    return new Response("Not Found", { status: 404 });
  }

  const expected = env.MCP_AUTH_TOKEN;
  if (!expected) {
    return jsonError(503, "MCP_AUTH_TOKEN is not configured");
  }

  const presented = readBearerToken(request);
  if (presented === undefined || !bearerTokensMatch(expected, presented)) {
    return jsonError(401, "Unauthorized", { "WWW-Authenticate": "Bearer" });
  }

  // Reject non-POST before building a transport. Stateless mode does not
  // validate sessions, so a GET would open an SSE stream whose keepalive
  // timer outlives this request.
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const server = buildServer(loadConfig(env));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
