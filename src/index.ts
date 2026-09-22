#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, type Config } from "./config.js";
import { registerAccountTools } from "./tools/account.js";
import { type ToolContext } from "./tools/common.js";
import {
  registerOrderReadTools,
  registerOrderWriteTools,
} from "./tools/orders.js";
import {
  registerPositionReadTools,
  registerPositionWriteTools,
} from "./tools/positions.js";
import { registerPublicTools } from "./tools/public.js";
import { registerTransferTools } from "./tools/transfer.js";

export function buildServer(config: Config = loadConfig()): McpServer {
  const server = new McpServer({
    name: "gmocoin-mcp",
    version: "1.0.0",
  });

  registerPublicTools(server);

  if (!config.hasCredentials || !config.apiKey || !config.apiSecret) {
    console.error(
      "GMO API credentials are not configured; only public tools are enabled.",
    );
    return server;
  }

  const context: ToolContext = {
    credentials: {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    },
  };
  registerAccountTools(server, context);
  registerOrderReadTools(server, context);
  registerPositionReadTools(server, context);

  if (config.tradingEnabled) {
    registerOrderWriteTools(server, context);
    registerPositionWriteTools(server, context);
    registerTransferTools(server, context);
  }

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
