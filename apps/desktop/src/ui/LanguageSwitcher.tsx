import { Languages } from "lucide-react";

import { useI18n } from "../i18n/I18nProvider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, t, toggleLanguage } = useI18n();
  const switchLabel = language === "zh-CN" ? t("切换到英文") : t("切换到中文");

  return (
    <button
      aria-label={switchLabel}
      className={`language-switcher${compact ? " compact" : ""}`}
      onClick={toggleLanguage}
      title={switchLabel}
      type="button"
    >
      <Languages aria-hidden="true" size={16} />
      <span>{language === "zh-CN" ? "EN" : "中"}</span>
    </button>
  );
}
