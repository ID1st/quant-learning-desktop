export type AppRoute = "login" | "dashboard" | "chart" | "strategies" | "learning" | "apiConfig" | "settings";

export type ThemeMode = "dark" | "light" | "system";

export type Market = "US" | "HK" | "CN";

export type Timeframe = "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";

export interface MoneyValue {
  amount: number;
  currency: "USD" | "HKD" | "CNY";
}

export interface ApiResult<T> {
  data: T;
  requestId: string;
}
export * from "./auth.ts";
