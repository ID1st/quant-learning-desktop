export function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function isTrustedServiceHostname(hostname: string, trustedHostnames: readonly string[]) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return isLoopbackHostname(normalized) || trustedHostnames.includes(normalized);
}
