export const PUBLIC_BASE = "https://api.coin.z.com/public";
export const PRIVATE_BASE = "https://api.coin.z.com/private";

export interface Config {
  apiKey?: string;
  apiSecret?: string;
  hasCredentials: boolean;
  tradingEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.GMO_API_KEY?.trim() || undefined;
  const apiSecret = env.GMO_API_SECRET?.trim() || undefined;
  const hasCredentials = Boolean(apiKey && apiSecret);

  if (Boolean(apiKey) !== Boolean(apiSecret)) {
    console.error(
      "Both GMO_API_KEY and GMO_API_SECRET are required; private tools are disabled.",
    );
  }

  return {
    apiKey,
    apiSecret,
    hasCredentials,
    tradingEnabled: hasCredentials && env.GMO_ENABLE_TRADING === "true",
  };
}
