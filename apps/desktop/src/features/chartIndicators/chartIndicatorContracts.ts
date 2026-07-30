import type { CandlePoint, ChartPaneModel, ChartRenderLayer } from "@quant/chart";
import type { IndicatorConvention } from "./indicatorMath.ts";

export type ChartIndicatorPlacement = "overlay" | "pane";
export type ChartIndicatorParameterValue = number | boolean;
export type IndicatorConventionMode = "auto" | IndicatorConvention;

export interface ChartIndicatorParameter {
  readonly key: string;
  readonly label: string;
  readonly type: "number" | "boolean";
  readonly defaultValue: ChartIndicatorParameterValue;
  readonly aShareDefaultValue?: ChartIndicatorParameterValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
}

export type ChartIndicatorEvaluationResult =
  | { readonly placement: "overlay"; readonly layer: ChartRenderLayer }
  | { readonly placement: "pane"; readonly pane: ChartPaneModel };

export interface ChartIndicatorDefinition {
  readonly id: string;
  readonly name: string;
  /**
   * Optional for legacy plugins. Missing placement is normalized to a main-chart overlay.
   */
  readonly placement?: ChartIndicatorPlacement;
  readonly parameters: readonly ChartIndicatorParameter[];
  evaluate(
    candles: readonly CandlePoint[],
    parameters: Readonly<Record<string, ChartIndicatorParameterValue>>,
    convention?: IndicatorConvention,
  ): ChartIndicatorEvaluationResult | ChartRenderLayer | null;
}

export interface ChartIndicatorRegistry {
  register(definition: ChartIndicatorDefinition): void;
  get(id: string): ChartIndicatorDefinition | undefined;
  list(): readonly ChartIndicatorDefinition[];
}

export interface ChartIndicatorInstanceSettings {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly parametersByConvention: Readonly<
    Record<IndicatorConvention, Readonly<Record<string, ChartIndicatorParameterValue>>>
  >;
}

export interface ChartIndicatorSettings {
  readonly conventionMode: IndicatorConventionMode;
  readonly instances: Readonly<Record<string, ChartIndicatorInstanceSettings>>;
}

export type ChartIndicatorEvaluation =
  | {
      readonly id: string;
      readonly placement: "overlay";
      readonly visible: boolean;
      readonly layer: ChartRenderLayer;
    }
  | {
      readonly id: string;
      readonly placement: "pane";
      readonly visible: boolean;
      readonly pane: ChartPaneModel;
    };
