import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { privateRequest } from "../client/http.js";
import { runTool, type ToolContext } from "./common.js";

const side = z.enum(["BUY", "SELL"]);
const executionType = z.enum(["MARKET", "LIMIT", "STOP"]);
const timeInForce = z.enum(["FAK", "FAS", "FOK", "SOK"]);
const commaSeparatedIds = z
  .string()
  .regex(/^\d+(,\d+){0,9}$/, "Use 1 to 10 comma-separated numeric IDs");

const executionsSchema = z
  .object({
    orderId: z.number().int().positive().optional(),
    executionId: commaSeparatedIds.optional(),
  })
  .superRefine(({ orderId, executionId }, context) => {
    if ((orderId === undefined) === (executionId === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one of orderId or executionId",
      });
    }
  });

const placeOrderSchema = z
  .object({
    symbol: z.string().min(1),
    side,
    executionType,
    timeInForce: timeInForce.optional(),
    price: z
      .string()
      .min(1)
      .describe("Order price as a decimal string")
      .optional(),
    losscutPrice: z
      .string()
      .min(1)
      .describe("Leverage losscut price as a decimal string")
      .optional(),
    size: z.string().min(1).describe("Order size as a decimal string"),
    cancelBefore: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const priced = input.executionType === "LIMIT" || input.executionType === "STOP";
    if (priced && input.price === undefined) {
      context.addIssue({
        code: "custom",
        path: ["price"],
        message: "price is required for LIMIT and STOP orders",
      });
    }
    if (!priced && input.price !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["price"],
        message: "price must be absent for MARKET orders",
      });
    }
    if (input.timeInForce !== undefined && input.executionType !== "LIMIT") {
      context.addIssue({
        code: "custom",
        path: ["timeInForce"],
        message: "timeInForce may only be specified for LIMIT orders",
      });
    }
    // GMO leverage symbols use <COIN>_JPY; ERR-5118 backs up losscutPrice validation.
    if (
      input.losscutPrice !== undefined &&
      (!input.symbol.endsWith("_JPY") || !priced)
    ) {
      context.addIssue({
        code: "custom",
        path: ["losscutPrice"],
        message: "losscutPrice is only for leverage LIMIT or STOP orders",
      });
    }
    if (
      input.cancelBefore &&
      (input.symbol.endsWith("_JPY") ||
        input.executionType !== "MARKET" ||
        input.side !== "SELL")
    ) {
      context.addIssue({
        code: "custom",
        path: ["cancelBefore"],
        message: "cancelBefore is only for spot MARKET SELL orders (effective FAK)",
      });
    }
  });

export function registerOrderReadTools(
  server: McpServer,
  context: ToolContext,
): void {
  const get = (path: string, query: Record<string, string | number | undefined>) =>
    privateRequest(context.credentials, "GET", path, { query });
  const readOnly = { readOnlyHint: true };

  server.registerTool(
    "gmo_get_orders",
    {
      title: "Get orders",
      description: "Return up to 10 orders by comma-separated order IDs.",
      inputSchema: z.object({ orderId: commaSeparatedIds }),
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/orders", input)),
  );

  server.registerTool(
    "gmo_get_active_orders",
    {
      title: "Get active orders",
      description: "Return active orders for a symbol.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        page: z.number().int().positive().optional(),
        count: z.number().int().min(1).max(100).optional(),
      }),
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/activeOrders", input)),
  );

  server.registerTool(
    "gmo_get_executions",
    {
      title: "Get executions",
      description:
        "Return executions by one orderId or by up to 10 comma-separated execution IDs.",
      inputSchema: executionsSchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/executions", input)),
  );

  server.registerTool(
    "gmo_get_latest_executions",
    {
      title: "Get latest executions",
      description: "Return executions from the last day for a symbol.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        page: z.number().int().positive().optional(),
        count: z.number().int().min(1).max(100).optional(),
      }),
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/latestExecutions", input)),
  );
}

export function registerOrderWriteTools(
  server: McpServer,
  context: ToolContext,
): void {
  const post = (path: string, body: unknown) =>
    privateRequest(context.credentials, "POST", path, { body });
  const destructive = { destructiveHint: true };

  server.registerTool(
    "gmo_place_order",
    {
      title: "Place order",
      description:
        "Moves real money: place a spot or leverage order. price and size are decimal strings; MARKET forbids price and LIMIT/STOP require it. timeInForce accepts FAK / FAS / FOK / SOK, where SOK is post-only, and may only be specified with LIMIT. When omitted, MARKET and STOP use FAK and LIMIT uses FAS. losscutPrice is leverage-only and only valid with LIMIT or STOP. cancelBefore is only for spot MARKET SELL orders (effective FAK).",
      inputSchema: placeOrderSchema,
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/order", input)),
  );

  server.registerTool(
    "gmo_change_order",
    {
      title: "Change order",
      description: "Moves real money: change the price of an existing order.",
      inputSchema: z.object({
        orderId: z.number().int().positive(),
        price: z.string().min(1).describe("Order price as a decimal string"),
        losscutPrice: z
          .string()
          .min(1)
          .describe("Leverage losscut price as a decimal string")
          .optional(),
      }),
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/changeOrder", input)),
  );

  server.registerTool(
    "gmo_cancel_order",
    {
      title: "Cancel order",
      description: "Moves real money: cancel an existing order.",
      inputSchema: z.object({ orderId: z.number().int().positive() }),
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/cancelOrder", input)),
  );

  server.registerTool(
    "gmo_cancel_orders",
    {
      title: "Cancel multiple orders",
      description: "Moves real money: cancel up to 10 existing orders.",
      inputSchema: z.object({
        orderIds: z.array(z.number().int().positive()).min(1).max(10),
      }),
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/cancelOrders", input)),
  );

  server.registerTool(
    "gmo_cancel_bulk_order",
    {
      title: "Bulk cancel orders",
      description:
        "Moves real money: cancel up to 10 matching orders. desc=true cancels newest first; false cancels oldest first.",
      inputSchema: z.object({
        symbols: z.array(z.string().min(1)).min(1),
        side: side.optional(),
        settleType: z.enum(["OPEN", "CLOSE"]).optional(),
        desc: z.boolean().optional(),
      }),
      annotations: destructive,
    },
    (input) => runTool(() => post("/v1/cancelBulkOrder", input)),
  );
}
