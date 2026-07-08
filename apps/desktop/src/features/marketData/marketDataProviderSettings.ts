import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";

export interface MarketDataProviderSettings {
  readonly stockSdkPrimaryEnabled: boolean;
}

const COLLECTION_KEY = "market-data-provider-settings";
const STORAGE_VERSION = 2;
const defaultSettings: MarketDataProviderSettings = {
  stockSdkPrimaryEnabled: true,
};

export function readMarketDataProviderSettings(database: LocalDatabase = appLocalDatabase): MarketDataProviderSettings {
  return database.readDocument(COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: defaultSettings,
    sanitize: sanitizeMarketDataProviderSettings,
  });
}

export function writeMarketDataProviderSettings(
  settings: MarketDataProviderSettings,
  database: LocalDatabase = appLocalDatabase,
): MarketDataProviderSettings {
  const sanitized = sanitizeMarketDataProviderSettings(settings);
  database.writeDocument(COLLECTION_KEY, STORAGE_VERSION, sanitized);
  return sanitized;
}

function sanitizeMarketDataProviderSettings(value: unknown): MarketDataProviderSettings {
  if (!value || typeof value !== "object") {
    return defaultSettings;
  }

  const candidate = value as Partial<MarketDataProviderSettings>;
  return {
    stockSdkPrimaryEnabled:
      typeof candidate.stockSdkPrimaryEnabled === "boolean"
        ? candidate.stockSdkPrimaryEnabled
        : defaultSettings.stockSdkPrimaryEnabled,
  };
}
