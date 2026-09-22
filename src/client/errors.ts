import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface GmoApiMessage {
  message_code: string;
  message_string: string;
}

export const ERROR_MEANINGS: Record<string, string> = {
  "ERR-70": "Wrong closing side for the specified position",
  "ERR-189": "Close size exceeds closable position size",
  "ERR-200": "Active orders exist and size exceeds orderable quantity",
  "ERR-201": "Insufficient buying power",
  "ERR-208": "Insufficient holdings to sell",
  "ERR-254": "Position not found",
  "ERR-422": "No position for closeBulkOrder",
  "ERR-423": "Close size exceeds total closable position size",
  "ERR-430": "Invalid orderId or executionId",
  "ERR-554": "Server unavailable",
  "ERR-626": "Server congested; retry later",
  "ERR-635": "Active order count limit reached",
  "ERR-682": "Margin call outstanding",
  "ERR-683": "Margin call in progress",
  "ERR-754": "Transfer amount exceeds transferable amount",
  "ERR-846": "Timestamp range exceeds 30 minutes",
  "ERR-913": "Collateral sale must be all or leave at least the minimum",
  "ERR-5003": "Rate limit exceeded",
  "ERR-5007": "API-TIMESTAMP is missing or non-numeric",
  "ERR-5008": "API-TIMESTAMP is later than server time",
  "ERR-5009": "API-TIMESTAMP is earlier than server time",
  "ERR-5010": "Invalid API-SIGN",
  "ERR-5011": "API-KEY is missing",
  "ERR-5012": "API-KEY authentication error",
  "ERR-5014": "Account terms have not been acknowledged",
  "ERR-5016": "History query timed out; retry or narrow the range",
  "ERR-5106": "Invalid parameter",
  "ERR-5111": "Invalid timeInForce",
  "ERR-5114": "Too many decimal places",
  "ERR-5118": "losscutPrice is not allowed here",
  "ERR-5121": "Price is too low",
  "ERR-5122": "Order cannot be changed in its current state",
  "ERR-5123": "Order not found",
  "ERR-5125": "API trading is restricted",
  "ERR-5126": "Size is outside the per-order minimum or maximum",
  "ERR-5127": "Account trading is restricted",
  "ERR-5129": "STOP price would execute immediately",
  "ERR-5133": "Transfer is restricted",
  "ERR-5135": "FX account is not opened",
  "ERR-5201": "Scheduled maintenance",
  "ERR-5202": "Emergency maintenance",
  "ERR-5203": "Order or change attempted during pre-open",
  "ERR-5204": "Invalid URL",
  "ERR-5206": "Per-order change limit reached; cancel and reorder",
  "ERR-5207": "Invalid symbol, interval, or date",
  "ERR-5208": "Both orderId and executionId were provided",
};

export class GmoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly messages: GmoApiMessage[],
    public readonly httpStatus: number,
    public readonly rawBody: string,
  ) {
    super(message);
    this.name = "GmoApiError";
  }
}

const RAW_BODY_LIMIT = 2048;

function presentRawBody(rawBody: string): string {
  if (rawBody.length <= RAW_BODY_LIMIT) return rawBody;
  const totalBytes = Buffer.byteLength(rawBody);
  return `${rawBody.slice(0, RAW_BODY_LIMIT)}... [truncated, ${totalBytes} bytes total]`;
}

export function formatToolError(error: unknown): CallToolResult {
  let text: string;

  if (error instanceof GmoApiError) {
    const details =
      error.messages.length > 0
        ? error.messages.map(({ message_code, message_string }) => ({
            message_code,
            message_string,
            meaning: ERROR_MEANINGS[message_code],
          }))
        : [{ message: error.message }];
    text = JSON.stringify(
      {
        error: "GMO Coin API error",
        httpStatus: error.httpStatus,
        status: error.status,
        messages: details,
        ...(error.messages.length === 0
          ? { rawBody: presentRawBody(error.rawBody) }
          : {}),
      },
      null,
      2,
    );
  } else {
    text = JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    );
  }

  return { isError: true, content: [{ type: "text", text }] };
}
