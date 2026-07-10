import type { AlphaFeedApiCredentials, LongPortApiCredentials } from "@quant/api-client";
import type { LocalPersistenceStore } from "./localPersistence";

export type SecureCredentialProvider = "alphafeed" | "alphafeed-stream" | "longport";

export interface AlphaFeedStreamCredentials {
  wsUrl: string;
  apiKey: string;
}

export interface SecureCredentialCrypto {
  encrypt(value: string): string;
  decrypt(value: string): string;
  isEncryptionAvailable(): boolean;
}

export interface SecureCredentialStore {
  saveAlphaFeedCredentials(credentials: AlphaFeedApiCredentials): void;
  readAlphaFeedCredentials(): AlphaFeedApiCredentials | null;
  clearAlphaFeedCredentials(): void;
  saveAlphaFeedStreamCredentials(credentials: AlphaFeedStreamCredentials): void;
  readAlphaFeedStreamCredentials(): AlphaFeedStreamCredentials | null;
  clearAlphaFeedStreamCredentials(): void;
  saveLongPortCredentials(credentials: LongPortApiCredentials): void;
  readLongPortCredentials(): LongPortApiCredentials | null;
  clearLongPortCredentials(): void;
}

interface SecureCredentialEnvelope {
  version: 1;
  provider: SecureCredentialProvider;
  encryptedPayload: string;
  updatedAt: string;
  activatedAt?: string;
}

const STORAGE_VERSION = 1;
const ALPHAFEED_CREDENTIAL_KEY = "secure-credentials.alphafeed";
const ALPHAFEED_STREAM_CREDENTIAL_KEY = "secure-credentials.alphafeed-stream";
const LONGPORT_CREDENTIAL_KEY = "secure-credentials.longport";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeAlphaFeedCredentials(value: unknown): AlphaFeedApiCredentials | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AlphaFeedApiCredentials>;
  const apiUrl = normalizeString(candidate.apiUrl);
  const apiKey = normalizeString(candidate.apiKey);

  return apiUrl && apiKey ? { apiUrl, apiKey } : null;
}

function sanitizeLongPortCredentials(value: unknown): LongPortApiCredentials | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LongPortApiCredentials>;
  const apiUrl = normalizeString(candidate.apiUrl);
  const appKey = normalizeString(candidate.appKey);
  const appSecret = normalizeString(candidate.appSecret);
  const accessToken = normalizeString(candidate.accessToken);

  return apiUrl && appKey && appSecret && accessToken ? { apiUrl, appKey, appSecret, accessToken } : null;
}

function sanitizeAlphaFeedStreamCredentials(value: unknown): AlphaFeedStreamCredentials | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AlphaFeedStreamCredentials>;
  const wsUrl = normalizeString(candidate.wsUrl);
  const apiKey = normalizeString(candidate.apiKey);

  return wsUrl && apiKey ? { wsUrl, apiKey } : null;
}

function readEnvelope(value: string | null, provider: SecureCredentialProvider): SecureCredentialEnvelope | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SecureCredentialEnvelope>;

    if (
      parsed.version !== STORAGE_VERSION ||
      parsed.provider !== provider ||
      typeof parsed.encryptedPayload !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      version: STORAGE_VERSION,
      provider,
      encryptedPayload: parsed.encryptedPayload,
      updatedAt: parsed.updatedAt,
      activatedAt: typeof parsed.activatedAt === "string" ? parsed.activatedAt : undefined,
    };
  } catch {
    return null;
  }
}

function createEnvelope(
  provider: SecureCredentialProvider,
  encryptedPayload: string,
  activatedAt?: string,
): SecureCredentialEnvelope {
  return {
    version: STORAGE_VERSION,
    provider,
    encryptedPayload,
    updatedAt: new Date().toISOString(),
    activatedAt,
  };
}

export function createSecureCredentialStore(store: LocalPersistenceStore, crypto: SecureCredentialCrypto): SecureCredentialStore {
  const saveCredentials = (key: string, provider: SecureCredentialProvider, credentials: object, activate = false) => {
    if (!crypto.isEncryptionAvailable()) {
      throw new Error("当前系统不支持安全凭据加密。");
    }

    const encryptedPayload = crypto.encrypt(JSON.stringify(credentials));
    store.setItem(key, JSON.stringify(createEnvelope(provider, encryptedPayload, activate ? new Date().toISOString() : undefined)));
  };

  const readCredentials = <T>(
    key: string,
    provider: SecureCredentialProvider,
    sanitize: (value: unknown) => T | null,
    requireActivation = false,
  ): T | null => {
    const envelope = readEnvelope(store.getItem(key), provider);

    if (!envelope || (requireActivation && !envelope.activatedAt)) {
      return null;
    }

    try {
      return sanitize(JSON.parse(crypto.decrypt(envelope.encryptedPayload)));
    } catch {
      return null;
    }
  };

  return {
    saveAlphaFeedCredentials: (credentials) => {
      const sanitized = sanitizeAlphaFeedCredentials(credentials);
      if (!sanitized) {
        throw new Error("AlphaFeed 凭据不完整。");
      }

      // AlphaFeed REST is opt-in. Legacy encrypted entries without this marker
      // remain inert until the user explicitly fills and verifies the current form.
      saveCredentials(ALPHAFEED_CREDENTIAL_KEY, "alphafeed", sanitized, true);
    },
    readAlphaFeedCredentials: () => readCredentials(ALPHAFEED_CREDENTIAL_KEY, "alphafeed", sanitizeAlphaFeedCredentials, true),
    clearAlphaFeedCredentials: () => store.removeItem(ALPHAFEED_CREDENTIAL_KEY),
    saveAlphaFeedStreamCredentials: (credentials) => {
      const sanitized = sanitizeAlphaFeedStreamCredentials(credentials);
      if (!sanitized) {
        throw new Error("AlphaFeed WebSocket 凭据不完整。");
      }

      saveCredentials(ALPHAFEED_STREAM_CREDENTIAL_KEY, "alphafeed-stream", sanitized);
    },
    readAlphaFeedStreamCredentials: () =>
      readCredentials(ALPHAFEED_STREAM_CREDENTIAL_KEY, "alphafeed-stream", sanitizeAlphaFeedStreamCredentials),
    clearAlphaFeedStreamCredentials: () => store.removeItem(ALPHAFEED_STREAM_CREDENTIAL_KEY),
    saveLongPortCredentials: (credentials) => {
      const sanitized = sanitizeLongPortCredentials(credentials);
      if (!sanitized) {
        throw new Error("长桥凭据不完整。");
      }

      // LongBridge is opt-in. Legacy encrypted entries without this marker stay
      // inert until the user explicitly fills and verifies the current form.
      saveCredentials(LONGPORT_CREDENTIAL_KEY, "longport", sanitized, true);
    },
    readLongPortCredentials: () => readCredentials(LONGPORT_CREDENTIAL_KEY, "longport", sanitizeLongPortCredentials, true),
    clearLongPortCredentials: () => store.removeItem(LONGPORT_CREDENTIAL_KEY),
  };
}
