import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { appLocalDatabase } from "../features/persistence/localDatabase";
import type { Timeframe } from "@quant/shared";
import {
  formatChartTime as formatChartTimeValue,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatTime as formatTimeValue,
  readTimeZonePreference,
  resolveTimeZone,
  writeTimeZonePreference,
  type AppTimeZone,
  type DateTimeValue,
} from "./dateTime";
import {
  createTranslator,
  getNextLanguage,
  readLanguagePreference,
  writeLanguagePreference,
  type AppLanguage,
  type Translate,
} from "./i18n";

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  timeZone: AppTimeZone;
  resolvedTimeZone: string;
  setTimeZone: (timeZone: AppTimeZone) => void;
  formatDate: (value: DateTimeValue) => string;
  formatTime: (value: DateTimeValue, includeSeconds?: boolean) => string;
  formatDateTime: (value: DateTimeValue, includeSeconds?: boolean) => string;
  formatChartTime: (timestamp: number, timeframe: Timeframe, tradingDateLabel: string) => string;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    readLanguagePreference(appLocalDatabase),
  );
  const [timeZone, setTimeZoneState] = useState<AppTimeZone>(() =>
    readTimeZonePreference(appLocalDatabase),
  );
  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    writeLanguagePreference(appLocalDatabase, nextLanguage);
  }, []);
  const toggleLanguage = useCallback(() => {
    setLanguageState((currentLanguage) => {
      const nextLanguage = getNextLanguage(currentLanguage);
      writeLanguagePreference(appLocalDatabase, nextLanguage);
      return nextLanguage;
    });
  }, []);
  const setTimeZone = useCallback((nextTimeZone: AppTimeZone) => {
    setTimeZoneState(nextTimeZone);
    writeTimeZonePreference(appLocalDatabase, nextTimeZone);
  }, []);
  const formatDate = useCallback(
    (value: DateTimeValue) => formatDateValue(value, language, timeZone),
    [language, timeZone],
  );
  const formatTime = useCallback(
    (value: DateTimeValue, includeSeconds = true) =>
      formatTimeValue(value, language, timeZone, includeSeconds),
    [language, timeZone],
  );
  const formatDateTime = useCallback(
    (value: DateTimeValue, includeSeconds = false) =>
      formatDateTimeValue(value, language, timeZone, includeSeconds),
    [language, timeZone],
  );
  const formatChartTime = useCallback(
    (timestamp: number, timeframe: Timeframe, tradingDateLabel: string) =>
      formatChartTimeValue(timestamp, timeframe, timeZone, tradingDateLabel),
    [timeZone],
  );
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      timeZone,
      resolvedTimeZone: resolveTimeZone(timeZone),
      setTimeZone,
      formatDate,
      formatTime,
      formatDateTime,
      formatChartTime,
      t: createTranslator(language),
    }),
    [
      formatChartTime,
      formatDate,
      formatDateTime,
      formatTime,
      language,
      setLanguage,
      setTimeZone,
      timeZone,
      toggleLanguage,
    ],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
