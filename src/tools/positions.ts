import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { privateRequest } from "../client/http.js";
import { decimalString, enforceTradingLimits, runTool, type ToolContext } from "./common.js";

const side = z.enum(["BUY", "SELL"]);
const executionType = z.enum(["MARKET", "LIMIT", "STOP"]);
const timeInForce = z.enum(["FAK", "FAS", "FOK", "SOK"]);

function validateCloseOrder(
  input: {
    executionType: "MARKET" | "LIMIT" | "STOP";
    timeInForce?: "FAK" | "FAS" | "FOK" | "SOK";
    price?: string;
    cancelBefore?: boolean;
  },
  context: z.core.$RefinementCtx,
): void {
  const priced = input.executionType === "LIMIT" || input.executionType === "STOP";
  if (priced && input.price === undefined) {
    context.addIssue({
      code: "custom",
      path: ["price"],
      message: "price is required for LIMIT and STOP close orders",
      input,
    });
  }
  if (!priced && input.price !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["price"],
      message: "price must be absent for MARKET close orders",
      input,
    });
  }
  if (input.timeInForce !== undefined && input.executionType !== "LIMIT") {
    context.addIssue({
      code: "custom",
      path: ["timeInForce"],
      message: "timeInForce may only be specified for LIMIT close orders",
      input,
    });
  }
  if (input.cancelBefore && input.executionType !== "MARKET") {
    context.addIssue({
      code: "custom",
      path: ["cancelBefore"],
      message: "cancelBefore is only for MARKET close orders (effective FAK)",
      input,
    });
  }
}

const closeOrderSchema = z
  .object({
    symbol: z.string().min(1),
    side,
    executionType,
    timeInForce: timeInForce.optional(),
    price: decimalString
      .describe("Closing order price as a decimal string")
      .optional(),
    settlePosition: z
      .array(
        z.object({
          positionId: z.number().int().positive(),
          size: decimalString.describe("Position size to close as a decimal string"),
        }),
      )
      .length(1),
    cancelBefore: z.boolean().optional(),
  })
  .superRefine(validateCloseOrder);

const closeBulkOrderSchema = z
  .object({
    symbol: z.string().min(1),
    side,
    executionType,
    timeInForce: timeInForce.optional(),
    price: decimalString
      .describe("Closing order price as a decimal string")
      .optional(),
    size: decimalString.describe("Total size to close as a decimal string"),
  })
  .superRefine(validateCloseOrder);

export function registerPositionReadTools(
  server: McpServer,
  context: ToolContext,
): void {
  const get = (path: string, query: Record<string, string | number | undefined>) =>
    privateRequest(context.credentials, "GET", path, { query });
  const readOnly = { readOnlyHint: true };

  server.registerTool(
    "gmo_get_open_positions",
    {
      title: "Get open positions",
      description: "Return open leverage positions for a symbol.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        page: z.number().int().positive().optional(),
        count: z.number().int().min(1).max(100).optional(),
      }),
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/openPositions", input)),
  );

  server.registerTool(
    "gmo_get_position_summary",
    {
      title: "Get position summary",
      description: "Return leverage position summaries by symbol and side.",
      inputSchema: z.object({ symbol: z.string().min(1).optional() }),
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/positionSummary", input)),
  );
}

export function registerPositionWriteTools(
  server: McpServer,
  context: ToolContext,
): void {
  const post = (path: string, body: unknown) =>
    privateRequest(context.credentials, "POST", path, { body });
  const destructive = { destructiveHint: true };

  server.registerTool(
    "gmo_close_order",
    {
      title: "Close one position",
      description:
        "Moves real money: close exactly one leverage position. side is the closing-order side, opposite the position. price and size are decimal strings; MARKET forbids price and LIMIT/STOP require it. timeInForce accepts FAK / FAS / FOK / SOK, where SOK is post-only, and may only be specified with LIMIT. When omitted, MARKET and STOP use FAK and LIMIT uses FAS. cancelBefore is only valid with MARKET (effective FAK).",
      inputSchema: closeOrderSchema,
      annotations: destructive,
    },
    (input) => {
      const blocked = enforceTradingLimits(context, {
        symbols: [input.symbol],
        size: input.settlePosition[0]?.size,
      });
      if (blocked) return blocked;
      return runTool(() => post("/v1/closeOrder", input));
    },
  );

  server.registerTool(
    "gmo_close_bulk_order",
    {
      title: "Bulk close positions",
      description:
        "Moves real money: close leverage positions in bulk. side is the closing-order side, opposite the positions. price and size are decimal strings; MARKET forbids price and LIMIT/STOP require it. timeInForce accepts FAK / FAS / FOK / SOK, where SOK is post-only, and may only be specified with LIMIT. When omitted, MARKET and STOP use FAK and LIMIT uses FAS.",
      inputSchema: closeBulkOrderSchema,
      annotations: destructive,
    },
    (input) => {
      const blocked = enforceTradingLimits(context, {
        symbols: [input.symbol],
        size: input.size,
      });
      if (blocked) return blocked;
      return runTool(() => post("/v1/closeBulkOrder", input));
    },
  );

  server.registerTool(
    "gmo_change_losscut_price",
    {
      title: "Change losscut price",
      description: "Moves real money: change the losscut price of a leverage position.",
      inputSchema: z.object({
        positionId: z.number().int().positive(),
        losscutPrice: decimalString.describe(
          "New losscut price as a decimal string",
        ),
      }),
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/changeLosscutPrice", input)),
  );
}
