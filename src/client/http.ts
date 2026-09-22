import { PRIVATE_BASE, PUBLIC_BASE } from "../config.js";
import { GmoApiError, type GmoApiMessage } from "./errors.js";
import { sign } from "./sign.js";

export type QueryValue = string | number | boolean | undefined;
export type Query = Record<string, QueryValue>;
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface Envelope {
  status?: number;
  data?: unknown;
  responsetime?: string;
  messages?: GmoApiMessage[];
}

export interface PrivateCredentials {
  apiKey: string;
  apiSecret: string;
}

function buildUrl(base: string, path: string, query?: Query): string {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function parseEnvelope(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  let envelope: Envelope;

  try {
    envelope = JSON.parse(rawBody) as Envelope;
  } catch {
    throw new GmoApiError(
      `GMO Coin returned a non-JSON response (HTTP ${response.status})`,
      undefined,
      [],
      response.status,
      rawBody,
    );
  }

  if (!response.ok || envelope.status !== 0) {
    const messages = Array.isArray(envelope.messages) ? envelope.messages : [];
    const summary =
      messages.length > 0
        ? messages
            .map((message) => `${message.message_code}: ${message.message_string}`)
            .join("; ")
        : `GMO Coin request failed (HTTP ${response.status}, status ${String(envelope.status)})`;
    throw new GmoApiError(
      summary,
      envelope.status,
      messages,
      response.status,
      rawBody,
    );
  }

  return envelope.data;
}

export async function publicGet(path: string, query?: Query): Promise<unknown> {
  const response = await fetch(buildUrl(PUBLIC_BASE, path, query), {
    headers: { Accept: "application/json" },
  });
  return parseEnvelope(response);
}

export async function privateRequest(
  credentials: PrivateCredentials,
  method: HttpMethod,
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<unknown> {
  const timestamp = Date.now().toString();
  const bodyText =
    method === "GET" || options.body === undefined
      ? ""
      : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "API-KEY": credentials.apiKey,
    "API-TIMESTAMP": timestamp,
    "API-SIGN": sign(credentials.apiSecret, timestamp, method, path, bodyText),
  };

  if (bodyText) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(PRIVATE_BASE, path, options.query), {
    method,
    headers,
    body: method === "GET" ? undefined : bodyText || undefined,
  });
  return parseEnvelope(response);
}
