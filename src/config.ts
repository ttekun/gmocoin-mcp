import { compareDecimalStrings } from "./tools/common.js";

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

export interface OperatorLimits {
  tradingEnabled: boolean;
  allowedSymbols?: ReadonlySet<string>;
  maxOrderSize?: string;
  maxOrderSizeInvalid?: boolean;
}

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

export function parseAllowedSymbols(
  value: string | undefined,
): ReadonlySet<string> | undefined {
  if (value === undefined) return undefined;
  const symbols = value
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
  return symbols.length > 0 ? new Set(symbols) : undefined;
}

export function parseMaxOrderSize(value: string | undefined): {
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

export function parseOperatorLimits(env: EnvSource): OperatorLimits {
  return {
    tradingEnabled: env.GMO_ENABLE_TRADING === "true",
    allowedSymbols: parseAllowedSymbols(env.GMO_ALLOWED_SYMBOLS),
    ...parseMaxOrderSize(env.GMO_MAX_ORDER_SIZE),
  };
}

export function applyOperatorCeilings(
  user: Config,
  operator: OperatorLimits,
): Config {
  let allowedSymbols = user.allowedSymbols ?? operator.allowedSymbols;
  if (user.allowedSymbols && operator.allowedSymbols) {
    allowedSymbols = new Set(
      [...user.allowedSymbols].filter((symbol) =>
        operator.allowedSymbols?.has(symbol),
      ),
    );
  }

  const maxOrderSizeInvalid = Boolean(
    user.maxOrderSizeInvalid || operator.maxOrderSizeInvalid,
  );
  let maxOrderSize: string | undefined;
  if (!maxOrderSizeInvalid) {
    if (user.maxOrderSize && operator.maxOrderSize) {
      maxOrderSize =
        compareDecimalStrings(user.maxOrderSize, operator.maxOrderSize) <= 0
          ? user.maxOrderSize
          : operator.maxOrderSize;
    } else {
      maxOrderSize = user.maxOrderSize ?? operator.maxOrderSize;
    }
  }

  return {
    ...user,
    tradingEnabled: user.tradingEnabled && operator.tradingEnabled,
    allowedSymbols,
    maxOrderSize,
    maxOrderSizeInvalid: maxOrderSizeInvalid || undefined,
  };
}

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
