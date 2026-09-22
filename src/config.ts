export const PUBLIC_BASE = "https://api.coin.z.com/public";
export const PRIVATE_BASE = "https://api.coin.z.com/private";

export interface Config {
  apiKey?: string;
  apiSecret?: string;
  hasCredentials: boolean;
  tradingEnabled: boolean;
  allowedSymbols?: ReadonlySet<string>;
  maxOrderSize?: string;
  maxOrderSizeInvalid?: boolean;
}

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

function parseAllowedSymbols(
  value: string | undefined,
): ReadonlySet<string> | undefined {
  if (value === undefined) return undefined;
  const symbols = value
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
  return symbols.length > 0 ? new Set(symbols) : undefined;
}

function parseMaxOrderSize(value: string | undefined): {
  maxOrderSize?: string;
  maxOrderSizeInvalid?: boolean;
} {
  const trimmed = value?.trim();
  if (!trimmed) return {};
  if (DECIMAL_STRING.test(trimmed)) return { maxOrderSize: trimmed };
  console.error(
    "GMO_MAX_ORDER_SIZE must be a non-negative decimal string; size-checked orders will be refused.",
  );
  return { maxOrderSizeInvalid: true };
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: EnvSource = process.env): Config {
  const apiKey = env.GMO_API_KEY?.trim() || undefined;
  const apiSecret = env.GMO_API_SECRET?.trim() || undefined;
  const hasCredentials = Boolean(apiKey && apiSecret);

  if (Boolean(apiKey) !== Boolean(apiSecret)) {
    console.error(
      "Both GMO_API_KEY and GMO_API_SECRET are required; private tools are disabled.",
    );
  }

  const sizeLimit = parseMaxOrderSize(env.GMO_MAX_ORDER_SIZE);

  return {
    apiKey,
    apiSecret,
    hasCredentials,
    tradingEnabled: hasCredentials && env.GMO_ENABLE_TRADING === "true",
    allowedSymbols: parseAllowedSymbols(env.GMO_ALLOWED_SYMBOLS),
    ...sizeLimit,
  };
}
