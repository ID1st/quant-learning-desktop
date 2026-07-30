import { useEffect, useRef, useState } from "react";
import type { Market } from "@quant/shared";
import { Check, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import {
  builtInChartIndicatorDefinitions,
  getIndicatorInstance,
  setIndicatorEnabled,
  type ChartIndicatorSettings,
  type ChartIndicatorDefinition,
  type IndicatorConventionMode,
} from "../chartIndicators/chartIndicators.ts";

interface IndicatorQuickMenuProps {
  readonly market: Market;
  readonly settings: ChartIndicatorSettings;
  readonly updateSettings: (
    update: (current: ChartIndicatorSettings) => ChartIndicatorSettings,
  ) => void;
  readonly onOpenParameters: (indicatorId: string) => void;
  readonly definitions?: readonly ChartIndicatorDefinition[];
}

const conventionOptions: readonly { value: IndicatorConventionMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "a-share", label: "A股" },
  { value: "cross-market", label: "跨市场" },
];

export function IndicatorQuickMenu({
  market,
  settings,
  updateSettings,
  onOpenParameters,
  definitions = builtInChartIndicatorDefinitions,
}: IndicatorQuickMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const enabledCount = definitions.filter(
    (definition) => getIndicatorInstance(settings, definition.id, definition).enabled,
  ).length;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target))
        setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const renderGroup = (placement: "overlay" | "pane", title: string, help: string) => (
    <section className="indicator-menu-group" aria-label={title}>
      <div className="indicator-menu-group-heading">
        <strong>{title}</strong>
        <span>{help}</span>
      </div>
      {definitions
        .filter((definition) => (definition.placement ?? "overlay") === placement)
        .map((definition) => {
          const instance = getIndicatorInstance(settings, definition.id, definition);
          return (
            <div
              className={
                instance.enabled ? "strategy-quick-menu-item active" : "strategy-quick-menu-item"
              }
              key={definition.id}
            >
              <span>
                <strong>{definition.name}</strong>
                <small>{placement === "overlay" ? "叠加在主图" : "显示在单独副图"}</small>
              </span>
              <div>
                <button
                  aria-label={`${definition.name}${instance.enabled ? "关闭" : "打开"}`}
                  aria-pressed={instance.enabled}
                  className={instance.enabled ? "active" : ""}
                  onClick={() =>
                    updateSettings((current) =>
                      setIndicatorEnabled(current, definition.id, !instance.enabled, definitions),
                    )
                  }
                  type="button"
                >
                  {instance.enabled && <Check size={13} />}
                  {instance.enabled ? "已打开" : "打开"}
                </button>
                {definition.parameters.length > 0 && (
                  <button
                    aria-label={`${definition.name} 参数`}
                    onClick={() => {
                      setIsOpen(false);
                      onOpenParameters(definition.id);
                    }}
                    type="button"
                  >
                    <SlidersHorizontal size={13} />
                    参数
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </section>
  );

  return (
    <div className="strategy-quick-menu" ref={wrapperRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={isOpen ? "strategy-quick-menu-trigger active" : "strategy-quick-menu-trigger"}
        onClick={() => setIsOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <SlidersHorizontal size={16} />
        <span>指标</span>
        {enabledCount > 0 && <small>{enabledCount}</small>}
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {isOpen && (
        <section
          className="strategy-quick-menu-panel indicator-quick-menu"
          role="menu"
          aria-label="技术指标"
        >
          <header>
            <span>
              <strong>技术指标</strong>
              <small>{enabledCount > 0 ? `${enabledCount} 个已打开` : "默认全部关闭"}</small>
            </span>
            <small>{market === "CN" ? "当前市场：中国 A 股" : `当前市场：${market}`}</small>
          </header>
          <div className="indicator-convention-switch" aria-label="指标口径">
            {conventionOptions.map((option) => (
              <button
                aria-pressed={settings.conventionMode === option.value}
                className={settings.conventionMode === option.value ? "active" : ""}
                key={option.value}
                onClick={() =>
                  updateSettings((current) => ({ ...current, conventionMode: option.value }))
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {renderGroup("overlay", "主图指标", "可同时打开多个")}
          {renderGroup("pane", "副图指标", "始终只保留一个")}
        </section>
      )}
    </div>
  );
}
