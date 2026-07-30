import type { AppRoute } from "@quant/shared";

export function resolveRequiredAppRoute(
  authenticated: boolean,
  currentRoute: AppRoute,
): AppRoute | null {
  if (!authenticated) {
    return currentRoute === "login" ? null : "login";
  }

  return currentRoute === "login" ? "chart" : null;
}
