import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { privateRequest } from "../client/http.js";
import { runTool, type ToolContext } from "./common.js";

export function registerTransferTools(
  server: McpServer,
  context: ToolContext,
): void {
  server.registerTool(
    "gmo_transfer_jpy",
    {
      title: "Transfer JPY",
      description:
        "Moves real money: transfer JPY between the crypto account and the GMO FX account. transferType values are WITHDRAWAL / DEPOSIT (direction relative to the crypto account; verify). Requires an FX account and is limited to one call per 3 minutes.",
      inputSchema: z.object({
        amount: z.string().min(1).describe("JPY amount as a string"),
        transferType: z.enum(["WITHDRAWAL", "DEPOSIT"]),
      }),
      annotations: { destructiveHint: true },
    },
    (input) =>
      runTool(() =>
        privateRequest(context.credentials, "POST", "/v1/account/transfer", {
          body: input,
        }),
      ),
  );
}
