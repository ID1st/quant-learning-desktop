import type { Market } from "@quant/shared";

export interface LongPortApiForm {
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
}

export interface LongPortApiBinding {
  apiUrl: string;
  apiKey: string;
  keyPreview: string;
  markets: Market[];
  boundAt: string;
}

const STORAGE_KEY = "quant-learning.longport-api-binding";

function waitForNetworkBoundary() {
  return new Promise((resolve) => window.setTimeout(resolve, 420));
}

function ensureHttpsUrl(apiUrl: string) {
  let url: URL;

  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("请输入有效的 API URL。");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API URL 需要以 http 或 https 开头。");
  }
}

function ensureCredential(name: string, value: string) {
  if (value.trim().length < 8) {
    throw new Error(`${name} 至少需要 8 位。`);
  }
}

function createKeyPreview(apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length <= 8) {
    return "********";
  }

  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
}

export function readLongPortApiBinding(): LongPortApiBinding | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as LongPortApiBinding) : null;
  } catch {
    return null;
  }
}

export function clearLongPortApiBinding() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function verifyLongPortApiConfig(form: LongPortApiForm): Promise<LongPortApiBinding> {
  ensureHttpsUrl(form.apiUrl);
  ensureCredential("API Key", form.apiKey);
  ensureCredential("API Secret", form.apiSecret);
  await waitForNetworkBoundary();

  const binding: LongPortApiBinding = {
    apiUrl: form.apiUrl.trim(),
    apiKey: form.apiKey.trim(),
    keyPreview: createKeyPreview(form.apiKey),
    markets: ["US", "HK", "CN"],
    boundAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(binding));
  return binding;
}
