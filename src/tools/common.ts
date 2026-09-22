import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PrivateCredentials } from "../client/http.js";
import { formatToolError } from "../client/errors.js";

export interface ToolContext {
  credentials: PrivateCredentials;
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
