export const PRODUCTION_AUTH_BASE_URL = "https://auth.fnndp.xyz";

const DEVELOPMENT_AUTH_BASE_URL = "http://127.0.0.1:8787";

export function resolveAuthBaseUrl(
  injectedBaseUrl: string,
  isPackaged: boolean,
): string {
  const configuredBaseUrl = injectedBaseUrl.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }
  return isPackaged
    ? PRODUCTION_AUTH_BASE_URL
    : DEVELOPMENT_AUTH_BASE_URL;
}
