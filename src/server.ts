import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

  if (!config.apiKey || !config.apiSecret) {
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
