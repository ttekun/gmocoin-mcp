import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { PrivateCredentials } from "../client/http.js";
import { formatToolError } from "../client/errors.js";
import { compareDecimalStrings } from "../config.js";

export const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Use a non-negative decimal string such as "0.01"');

export interface ToolContext {
  credentials: PrivateCredentials;
  allowedSymbols?: ReadonlySet<string>;
  maxOrderSize?: string;
  maxOrderSizeInvalid?: boolean;
}

export function enforceTradingLimits(
  context: ToolContext,
  check: { symbols?: readonly string[]; size?: string },
): CallToolResult | undefined {
  if (context.allowedSymbols && check.symbols === undefined) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: "ID-based changes and cancellations are disabled when GMO_ALLOWED_SYMBOLS is set because the target symbol cannot be verified from the input.",
      }],
    };
  }
  if (context.allowedSymbols && check.symbols) {
    const rejected = check.symbols.filter(
      (symbol) => !context.allowedSymbols?.has(symbol),
    );
    if (rejected.length > 0) {
      const label = rejected.length === 1 ? "Symbol" : "Symbols";
      const verb = rejected.length === 1 ? "is" : "are";
      const allowed = [...context.allowedSymbols].join(", ");
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `${label} ${rejected.join(", ")} ${verb} not allowed by GMO_ALLOWED_SYMBOLS (${allowed}).`,
          },
        ],
      };
    }
  }

  if (check.size === undefined) return undefined;

  if (context.maxOrderSizeInvalid) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "GMO_MAX_ORDER_SIZE must be a non-negative decimal string; the order was not sent.",
        },
      ],
    };
  }

  if (
    context.maxOrderSize !== undefined &&
    compareDecimalStrings(check.size, context.maxOrderSize) > 0
  ) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Size ${check.size} exceeds GMO_MAX_ORDER_SIZE ${context.maxOrderSize}.`,
        },
      ],
    };
  }

  return undefined;
}

export function toolSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
  };
}

export async function runTool(
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return toolSuccess(await operation());
  } catch (error) {
    return formatToolError(error);
  }
}
