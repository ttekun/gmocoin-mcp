import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { privateRequest } from "../client/http.js";
import { runTool, type ToolContext } from "./common.js";

const utcTimestamp = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    "Use UTC YYYY-MM-DDTHH:MM:SS.SSSZ",
  );

function validateTimestampRange(
  { fromTimestamp, toTimestamp }: { fromTimestamp: string; toTimestamp?: string },
  context: z.core.$RefinementCtx,
): void {
  if (!toTimestamp) return;
  const from = Date.parse(fromTimestamp);
  const to = Date.parse(toTimestamp);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    context.addIssue({
      code: "custom",
      path: ["toTimestamp"],
      message: "toTimestamp must be on or after fromTimestamp",
      input: toTimestamp,
    });
  } else if (to - from > 30 * 60 * 1000) {
    context.addIssue({
      code: "custom",
      path: ["toTimestamp"],
      message: "The timestamp range must not exceed 30 minutes",
      input: toTimestamp,
    });
  }
}

const fiatHistorySchema = z
  .object({
    fromTimestamp: utcTimestamp,
    toTimestamp: utcTimestamp.optional(),
  })
  .superRefine(validateTimestampRange);

const cryptoHistorySchema = z
  .object({
    symbol: z.string().min(1),
    fromTimestamp: utcTimestamp,
    toTimestamp: utcTimestamp.optional(),
  })
  .superRefine(validateTimestampRange);

const businessDate = z
  .string()
  .regex(/^\d{8}$/, "Use a GMO business date in YYYYMMDD format");

function currentGmoBusinessDate(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (jst.getUTCHours() < 6) {
    jst.setUTCDate(jst.getUTCDate() - 1);
  }
  return [
    jst.getUTCFullYear(),
    String(jst.getUTCMonth() + 1).padStart(2, "0"),
    String(jst.getUTCDate()).padStart(2, "0"),
  ].join("");
}

const exchangeFeeSchema = z
  .object({
    fromDate: businessDate,
    toDate: businessDate.optional(),
    count: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .superRefine(({ fromDate, toDate }, context) => {
    const latestDate = currentGmoBusinessDate();
    if (fromDate > latestDate) {
      context.addIssue({
        code: "custom",
        path: ["fromDate"],
        message: "fromDate must not be in the future",
      });
    }
    if (toDate && toDate > latestDate) {
      context.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "toDate must not be in the future",
      });
    }
    if (!toDate) return;
    const parse = (value: string) =>
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
      );
    const span = parse(toDate) - parse(fromDate);
    if (span < 0) {
      context.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "toDate must be on or after fromDate",
      });
    } else if (span > 7 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "The date range must not exceed 7 days",
      });
    }
  });

export function registerAccountTools(
  server: McpServer,
  context: ToolContext,
): void {
  const get = (path: string, query?: Record<string, string | number | undefined>) =>
    privateRequest(context.credentials, "GET", path, { query });
  const readOnly = { readOnlyHint: true };

  server.registerTool(
    "gmo_get_margin",
    {
      title: "Get account margin",
      description: "Return margin, buying power, margin ratio, and margin-call status.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => runTool(() => get("/v1/account/margin")),
  );

  server.registerTool(
    "gmo_get_assets",
    {
      title: "Get account assets",
      description: "Return JPY and crypto asset balances. Numeric values remain strings.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => runTool(() => get("/v1/account/assets")),
  );

  server.registerTool(
    "gmo_get_trading_volume",
    {
      title: "Get trading volume",
      description: "Return JPY trading volume, fee tier, limits, and fees.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => runTool(() => get("/v1/account/tradingVolume")),
  );

  server.registerTool(
    "gmo_get_fiat_deposit_history",
    {
      title: "Get fiat deposit history",
      description:
        "Return JPY deposit history. Timestamps are UTC and the range is at most 30 minutes.",
      inputSchema: fiatHistorySchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/account/fiatDeposit/history", input)),
  );

  server.registerTool(
    "gmo_get_fiat_withdrawal_history",
    {
      title: "Get fiat withdrawal history",
      description:
        "Return JPY withdrawal history. Timestamps are UTC and the range is at most 30 minutes.",
      inputSchema: fiatHistorySchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/account/fiatWithdrawal/history", input)),
  );

  server.registerTool(
    "gmo_get_crypto_deposit_history",
    {
      title: "Get crypto deposit history",
      description:
        "Return crypto deposit history. Timestamps are UTC and the range is at most 30 minutes.",
      inputSchema: cryptoHistorySchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/account/deposit/history", input)),
  );

  server.registerTool(
    "gmo_get_crypto_withdrawal_history",
    {
      title: "Get crypto withdrawal history",
      description:
        "Return crypto withdrawal history. Timestamps are UTC and the range is at most 30 minutes.",
      inputSchema: cryptoHistorySchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/account/withdrawal/history", input)),
  );

  server.registerTool(
    "gmo_get_exchange_fee_history",
    {
      title: "Get exchange fee history",
      description:
        "Return exchange fee history. Dates are GMO business days (06:00–05:59 JST), range at most 7 days. Reuse the same dates with a returned cursor.",
      inputSchema: exchangeFeeSchema,
      annotations: readOnly,
    },
    (input) => runTool(() => get("/v1/account/exchangeFee/history", input)),
  );
}
