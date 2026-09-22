import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { publicGet } from "../client/http.js";
import { runTool } from "./common.js";

const shortIntervals = [
  "1min",
  "5min",
  "10min",
  "15min",
  "30min",
  "1hour",
] as const;
const longIntervals = [
  "4hour",
  "8hour",
  "12hour",
  "1day",
  "1week",
  "1month",
] as const;
const intervals = [...shortIntervals, ...longIntervals] as const;

const klinesSchema = z
  .object({
    symbol: z.string().min(1).describe("GMO Coin symbol"),
    interval: z.enum(intervals),
    date: z
      .string()
      .regex(/^(\d{4}|\d{8})$/, "Use YYYY for long intervals or YYYYMMDD for short intervals"),
  })
  .superRefine(({ interval, date }, context) => {
    const allowed = date.length === 8 ? shortIntervals : longIntervals;
    if (!(allowed as readonly string[]).includes(interval)) {
      context.addIssue({
        code: "custom",
        path: ["interval"],
        message:
          date.length === 8
            ? "YYYYMMDD dates require 1min through 1hour intervals"
            : "YYYY dates require 4hour through 1month intervals",
      });
    }
  });

export function registerPublicTools(server: McpServer): void {
  const readOnly = { readOnlyHint: true };

  server.registerTool(
    "gmo_get_status",
    {
      title: "Get GMO Coin status",
      description: "Return the current exchange status: MAINTENANCE, PREOPEN, or OPEN.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => runTool(() => publicGet("/v1/status")),
  );

  server.registerTool(
    "gmo_get_ticker",
    {
      title: "Get ticker",
      description: "Return 24-hour ticker data. Omit symbol to return all symbols.",
      inputSchema: z.object({ symbol: z.string().min(1).optional() }),
      annotations: readOnly,
    },
    ({ symbol }) => runTool(() => publicGet("/v1/ticker", { symbol })),
  );

  server.registerTool(
    "gmo_get_orderbooks",
    {
      title: "Get order book",
      description: "Return the current order-book snapshot for a symbol.",
      inputSchema: z.object({ symbol: z.string().min(1) }),
      annotations: readOnly,
    },
    ({ symbol }) => runTool(() => publicGet("/v1/orderbooks", { symbol })),
  );

  server.registerTool(
    "gmo_get_trades",
    {
      title: "Get recent trades",
      description: "Return recent public trades, newest first.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        page: z.number().int().positive().optional(),
        count: z.number().int().min(1).max(100).optional(),
      }),
      annotations: readOnly,
    },
    (input) => runTool(() => publicGet("/v1/trades", input)),
  );

  server.registerTool(
    "gmo_get_klines",
    {
      title: "Get candlesticks",
      description:
        "Return candlesticks. Use YYYYMMDD with 1min–1hour intervals, or YYYY with 4hour–1month intervals. Daily boundaries are 06:00 JST.",
      inputSchema: klinesSchema,
      annotations: readOnly,
    },
    (input) => runTool(() => publicGet("/v1/klines", input)),
  );

  server.registerTool(
    "gmo_get_symbols",
    {
      title: "Get symbols",
      description: "Return current symbols and their order-size, tick-size, and fee metadata.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => runTool(() => publicGet("/v1/symbols")),
  );
}
