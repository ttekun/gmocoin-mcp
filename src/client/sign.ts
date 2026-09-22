import { createHmac } from "node:crypto";

export function sign(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(timestamp + method.toUpperCase() + path + body)
    .digest("hex");
}
