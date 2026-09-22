import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  applyOperatorCeilings,
  loadConfig,
  parseOperatorLimits,
} from "./config.js";
import { buildServer } from "./server.js";

// `type`, not `interface`: only type-alias object types get an implicit index
// signature, which this value needs to be passed to loadConfig.
export type RemoteEnv = {
  // Accepted but ignored: the Worker holds no GMO credentials of its own.
  GMO_API_KEY?: string;
  GMO_API_SECRET?: string;
  GMO_ENABLE_TRADING?: string;
  GMO_ALLOWED_SYMBOLS?: string;
  GMO_MAX_ORDER_SIZE?: string;
};

export async function handleRemoteRequest(
  request: Request,
  env: RemoteEnv,
): Promise<Response> {
  // Never log the request or its headers. They can contain GMO credentials.
  const { pathname } = new URL(request.url);
  if (pathname !== "/mcp") {
    return new Response("Not Found", { status: 404 });
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

  const userConfig = loadConfig({
    GMO_API_KEY: request.headers.get("X-GMO-API-KEY") ?? undefined,
    GMO_API_SECRET: request.headers.get("X-GMO-API-SECRET") ?? undefined,
    GMO_ENABLE_TRADING:
      request.headers.get("X-GMO-ENABLE-TRADING") ?? undefined,
    GMO_ALLOWED_SYMBOLS:
      request.headers.get("X-GMO-ALLOWED-SYMBOLS") ?? undefined,
    GMO_MAX_ORDER_SIZE:
      request.headers.get("X-GMO-MAX-ORDER-SIZE") ?? undefined,
  });
  const config = applyOperatorCeilings(
    userConfig,
    parseOperatorLimits(env),
  );
  const server = buildServer(config);
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
