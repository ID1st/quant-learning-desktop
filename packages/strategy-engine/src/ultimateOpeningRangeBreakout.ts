import { sma } from "@quant/pine-runtime";
import type {
  StrategyDefinition,
  StrategyInput,
  StrategyOutput,
  StrategySignal,
  StrategyVisualBase,
  StrategyVisualElement,
} from "./contracts.ts";
import {
  type CalendarDate,
  calendarDateKey,
  createPlaceholderOutput,
  getBooleanParameter,
  getColorParameter,
  getNumberParameter,
  getPositiveNumberParameter,
  getStringParameter,
  getZonedDateParts,
  isSeriesNumber,
  marketTimeZones,
  pineAtr,
  shiftCalendarDate,
  zonedDateTimeToTimestamp,
} from "./strategyMath.ts";

function runUtorbStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const sessionStartHour = Math.min(
    23,
    Math.max(0, Math.round(getNumberParameter(input.parameters, "sessionStartHour", 9))),
  );
  const sessionStartMinute = Math.min(
    59,
    Math.max(0, Math.round(getNumberParameter(input.parameters, "sessionStartMinute", 30))),
  );
  const openingRangeMinutes = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "openingRangeMinutes", 30)),
  );
  const sessionDays =
    getStringParameter(input.parameters, "sessionDays", "1234567").replace(/[^1-7]/g, "") ||
    "1234567";
  const timezoneMode =
    getStringParameter(input.parameters, "timezoneMode", "fixed-offset") === "market"
      ? "market"
      : "fixed-offset";
  const timezoneOffsetHours = Math.min(
    12,
    Math.max(-12, getNumberParameter(input.parameters, "timezoneOffsetHours", -5)),
  );
  const sessionTimeZone = marketTimeZones[input.market];
  const rangeSource =
    getStringParameter(input.parameters, "rangeSource", "high-low") === "close"
      ? "close"
      : "high-low";
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);
  const showTargetLabels = getBooleanParameter(input.parameters, "showTargetLabels", true);
  const bullColor = getColorParameter(input.parameters, "bullColor", "#089981");
  const bearColor = getColorParameter(input.parameters, "bearColor", "#f23645");
  const neutralColor = getColorParameter(input.parameters, "neutralColor", "#5b9cf6");
  const backgroundTransparency = Math.min(
    100,
    Math.max(0, getNumberParameter(input.parameters, "backgroundTransparency", 85)),
  );
  const signalLabelSize = getStringParameter(input.parameters, "signalLabelSize", "small");
  const signalTextSize: StrategyVisualBase["textSize"] =
    signalLabelSize === "tiny" || signalLabelSize === "small" || signalLabelSize === "large"
      ? signalLabelSize
      : "normal";
  const targetZoneOpacities = [5, 7.5, 2.5].map(
    (transparencyOffset) =>
      (100 - Math.min(100, Math.max(0, backgroundTransparency + transparencyOffset))) / 100,
  );
  const extensionType =
    getStringParameter(input.parameters, "extensionType", "multiples") === "fibonacci"
      ? "fibonacci"
      : "multiples";
  const extensionMultipliers =
    extensionType === "fibonacci"
      ? [0.382, 0.618, 1]
      : [
          Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierOne", 1)),
          Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierTwo", 2)),
          Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierThree", 3)),
        ];
  const showVolumeProfile = getBooleanParameter(input.parameters, "showVolumeProfile", true);
  const volumeProfileRows = Math.min(
    50,
    Math.max(5, Math.round(getPositiveNumberParameter(input.parameters, "volumeProfileRows", 14))),
  );
  const volumeProfileWidthPercent = Math.min(
    100,
    Math.max(1, getPositiveNumberParameter(input.parameters, "volumeProfileWidthPercent", 30)),
  );
  const volumeProfileColor = getColorParameter(input.parameters, "volumeProfileColor", "#5b9cf6");
  const stopPlotting = getBooleanParameter(input.parameters, "stopPlotting", true);
  const plottingEndType = getStringParameter(input.parameters, "plottingEndType", "new-york-close");
  const manualEndHour = Math.min(
    23,
    Math.max(0, Math.round(getNumberParameter(input.parameters, "manualEndHour", 16))),
  );
  const manualEndMinute = Math.min(
    59,
    Math.max(0, Math.round(getNumberParameter(input.parameters, "manualEndMinute", 0))),
  );
  const plottingEndMinutes =
    plottingEndType === "london-close"
      ? 11 * 60 + 30
      : plottingEndType === "manual"
        ? manualEndHour * 60 + manualEndMinute
        : plottingEndType === "end-of-day"
          ? 23 * 60 + 59
          : 17 * 60;
  const showTrailingStop = getBooleanParameter(input.parameters, "showTrailingStop", false);
  const trailingStopAtrMultiplier = getPositiveNumberParameter(
    input.parameters,
    "trailingStopAtrMultiplier",
    2,
  );
  const trailingStopAtrPeriod = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "trailingStopAtrPeriod", 14)),
  );
  const showOptimizer = getBooleanParameter(input.parameters, "showOptimizer", false);

  if (!enabled) {
    return createPlaceholderOutput(strategy, false);
  }

  if (input.bars.length < 2) {
    const output = createPlaceholderOutput(strategy, true);
    return {
      ...output,
      logs: ["UTORB 需要至少 2 根 K 线才能计算开盘区间和突破信号。"],
    };
  }

  const bars = [...input.bars].sort((left, right) => left.timestamp - right.timestamp);
  const atr = pineAtr(bars, trailingStopAtrPeriod);
  const volumeAverage = sma(
    bars.map((bar) => bar.volume),
    20,
  );
  const elements: StrategyVisualElement[] = [];
  const signals: StrategySignal[] = [];
  const targetAlerts: string[] = [];
  const hour = 60 * 60 * 1000;
  const timezoneOffset = timezoneOffsetHours * hour;
  const openingRangeDuration = openingRangeMinutes * 60 * 1000;
  const optimizerMultipliers = [1, 1.5, 2, 2.5, 3];
  const optimizerProfits = optimizerMultipliers.map(() => 0);
  const optimizerStops: Array<number | null> = optimizerMultipliers.map(() => null);
  const optimizerDirections = optimizerMultipliers.map(() => 0);
  const targetHits = { upper: [0, 0, 0], lower: [0, 0, 0] };
  const sessionTargetReached = { upper: [false, false, false], lower: [false, false, false] };
  let totalSessions = 0;
  let sessionKey: number | null = null;
  let sessionStartTimestamp = 0;
  let plottingEndTimestamp = 0;
  let openingRangeHigh = 0;
  let openingRangeLow = 0;
  let sessionEnded = false;
  let previousInSession = false;
  let canSignalUp = true;
  let canSignalDown = true;
  let activeDirection = 0;
  let entryPrice = 0;
  let trailStop: number | null = null;
  let totalTrailProfit = 0;
  let currentTrailPoints: Array<{ timestamp: number; price: number }> = [];
  let trailSegmentDirection = 0;
  let trailSegmentIndex = 0;
  let latestVolumeProfile = new Map<number, number>();
  let latestTickSize = 0.01;
  let lastSessionRendered: number | null = null;
  let lastLocalDayKey: number | null = null;
  let previousClose: number | null = null;
  let previousUpperTargetThree: number | null = null;
  let previousLowerTargetThree: number | null = null;

  const getSessionDate = (timestamp: number): CalendarDate => {
    if (timezoneMode === "market") {
      const { year, month, day: dayOfMonth } = getZonedDateParts(timestamp, sessionTimeZone);
      return { year, month, day: dayOfMonth };
    }
    const local = new Date(timestamp + timezoneOffset);
    return {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
    };
  };

  const localDateTimeToTimestamp = (
    date: CalendarDate,
    localHour: number,
    localMinute: number,
    timeZone = sessionTimeZone,
  ) =>
    timezoneMode === "market"
      ? zonedDateTimeToTimestamp(date, localHour, localMinute, timeZone)
      : Date.UTC(date.year, date.month - 1, date.day, localHour, localMinute) - timezoneOffset;

  const getPlotEndTimestamp = (date: CalendarDate, start: number) => {
    let plotEnd: number;
    if (timezoneMode === "market" && plottingEndType === "new-york-close") {
      plotEnd = zonedDateTimeToTimestamp(date, 17, 0, "America/New_York");
    } else if (timezoneMode === "market" && plottingEndType === "london-close") {
      plotEnd = zonedDateTimeToTimestamp(date, 16, 30, "Europe/London");
    } else {
      plotEnd = localDateTimeToTimestamp(
        date,
        Math.floor(plottingEndMinutes / 60),
        plottingEndMinutes % 60,
      );
    }
    if (plotEnd <= start) {
      const nextDate = shiftCalendarDate(date, 1);
      if (timezoneMode === "market" && plottingEndType === "new-york-close") {
        return zonedDateTimeToTimestamp(nextDate, 17, 0, "America/New_York");
      }
      if (timezoneMode === "market" && plottingEndType === "london-close") {
        return zonedDateTimeToTimestamp(nextDate, 16, 30, "Europe/London");
      }
      return localDateTimeToTimestamp(
        nextDate,
        Math.floor(plottingEndMinutes / 60),
        plottingEndMinutes % 60,
      );
    }
    return plotEnd;
  };

  const getSessionWindow = (timestamp: number) => {
    const currentDate = getSessionDate(timestamp);
    for (const date of [currentDate, shiftCalendarDate(currentDate, -1)]) {
      const start = localDateTimeToTimestamp(date, sessionStartHour, sessionStartMinute);
      const end = start + openingRangeDuration;
      const pineDay = new Date(calendarDateKey(date)).getUTCDay() + 1;
      if (sessionDays.includes(String(pineDay)) && timestamp >= start && timestamp < end) {
        return {
          key: calendarDateKey(date),
          start,
          end,
          plotEnd: getPlotEndTimestamp(date, start),
        };
      }
    }
    return null;
  };

  const flushTrailSegment = () => {
    if (showTrailingStop && currentTrailPoints.length > 1) {
      elements.push({
        id: `utorb-trail-${trailSegmentIndex}`,
        kind: "trend-line",
        points: currentTrailPoints,
        tone: trailSegmentDirection > 0 ? "bullish" : "bearish",
        color: trailSegmentDirection > 0 ? bullColor : bearColor,
      });
      trailSegmentIndex += 1;
    }
    currentTrailPoints = [];
    trailSegmentDirection = 0;
  };

  const addSessionElements = () => {
    if (
      sessionKey === null ||
      lastSessionRendered === sessionKey ||
      openingRangeHigh <= openingRangeLow
    )
      return;
    const range = openingRangeHigh - openingRangeLow;
    const upper = extensionMultipliers.map((multiplier) => openingRangeHigh + range * multiplier);
    const lower = extensionMultipliers.map((multiplier) => openingRangeLow - range * multiplier);
    const key = String(sessionKey);

    elements.push(
      {
        id: `utorb-opening-range-high-${key}`,
        kind: "price-line",
        price: openingRangeHigh,
        tone: "range",
        color: neutralColor,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
      {
        id: `utorb-opening-range-low-${key}`,
        kind: "price-line",
        price: openingRangeLow,
        tone: "range",
        color: neutralColor,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
      {
        id: `utorb-opening-range-${key}`,
        kind: "band",
        fromPrice: openingRangeLow,
        toPrice: openingRangeHigh,
        tone: "range",
        fillColor: neutralColor,
        borderColor: neutralColor,
        opacity: (100 - backgroundTransparency) / 100,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
    );

    if (showTargets) {
      upper.forEach((price, index) => {
        elements.push(
          {
            id: `utorb-target-zone-up-${index + 1}-${key}`,
            kind: "band",
            fromPrice: index === 0 ? openingRangeHigh : upper[index - 1],
            toPrice: price,
            tone: "target",
            fillColor: bullColor,
            borderColor: bullColor,
            opacity: targetZoneOpacities[index],
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
          {
            id: `utorb-target-up-${index + 1}-${key}`,
            kind: "price-line",
            price,
            tone: "target",
            color: bullColor,
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
        );
      });
      lower.forEach((price, index) => {
        elements.push(
          {
            id: `utorb-target-zone-down-${index + 1}-${key}`,
            kind: "band",
            fromPrice: index === 0 ? openingRangeLow : lower[index - 1],
            toPrice: price,
            tone: "risk",
            fillColor: bearColor,
            borderColor: bearColor,
            opacity: targetZoneOpacities[index],
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
          {
            id: `utorb-target-down-${index + 1}-${key}`,
            kind: "price-line",
            price,
            tone: "stop",
            color: bearColor,
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
        );
      });
    }

    lastSessionRendered = sessionKey;
  };

  bars.forEach((bar, index) => {
    const localDayKey = calendarDateKey(getSessionDate(bar.timestamp));
    if (lastLocalDayKey !== null && localDayKey !== lastLocalDayKey) {
      if (previousInSession && sessionKey !== null && openingRangeHigh > openingRangeLow) {
        totalSessions += 1;
      }
      addSessionElements();
      flushTrailSegment();
      sessionKey = null;
      sessionStartTimestamp = 0;
      plottingEndTimestamp = 0;
      openingRangeHigh = Number.NEGATIVE_INFINITY;
      openingRangeLow = Number.POSITIVE_INFINITY;
      sessionEnded = false;
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      entryPrice = 0;
      trailStop = null;
      latestVolumeProfile = new Map();
      latestTickSize = 0.01;
      sessionTargetReached.upper.fill(false);
      sessionTargetReached.lower.fill(false);
      optimizerStops.fill(null);
      optimizerDirections.fill(0);
      previousInSession = false;
      previousUpperTargetThree = null;
      previousLowerTargetThree = null;
    }
    lastLocalDayKey = localDayKey;

    const window = getSessionWindow(bar.timestamp);
    const inSession = window !== null;

    if (window && window.key !== sessionKey) {
      addSessionElements();
      flushTrailSegment();
      sessionKey = window.key;
      sessionStartTimestamp = window.start;
      plottingEndTimestamp = window.plotEnd;
      openingRangeHigh = Number.NEGATIVE_INFINITY;
      openingRangeLow = Number.POSITIVE_INFINITY;
      sessionEnded = false;
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      trailStop = null;
      latestVolumeProfile = new Map();
      latestTickSize = 0.01;
      sessionTargetReached.upper.fill(false);
      sessionTargetReached.lower.fill(false);
      optimizerStops.fill(null);
      optimizerDirections.fill(0);
    }

    if (inSession) {
      const high = rangeSource === "close" ? Math.max(bar.open, bar.close) : bar.high;
      const low = rangeSource === "close" ? Math.min(bar.open, bar.close) : bar.low;
      openingRangeHigh = Math.max(openingRangeHigh, high);
      openingRangeLow = Math.min(openingRangeLow, low);
      const range = openingRangeHigh - openingRangeLow;
      if (range > 0) latestTickSize = Math.max(0.01, range / volumeProfileRows);
      const priceLevel = Math.round(bar.close / latestTickSize) * latestTickSize;
      latestVolumeProfile.set(priceLevel, (latestVolumeProfile.get(priceLevel) ?? 0) + bar.volume);
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      trailStop = null;
      flushTrailSegment();
    }

    if (!inSession && previousInSession && sessionKey !== null) {
      sessionEnded = true;
      totalSessions += 1;
      addSessionElements();
    }

    const hasRange =
      sessionKey !== null &&
      Number.isFinite(openingRangeHigh) &&
      Number.isFinite(openingRangeLow) &&
      openingRangeHigh > openingRangeLow;
    const range = hasRange ? openingRangeHigh - openingRangeLow : 0;
    const upperTargets = extensionMultipliers.map(
      (multiplier) => openingRangeHigh + range * multiplier,
    );
    const lowerTargets = extensionMultipliers.map(
      (multiplier) => openingRangeLow - range * multiplier,
    );
    const displayAllowed =
      !stopPlotting ||
      (sessionKey !== null &&
        bar.timestamp >= sessionStartTimestamp &&
        bar.timestamp <= plottingEndTimestamp);

    if (hasRange && previousClose !== null && previousUpperTargetThree !== null) {
      const crossedUpperTarget =
        (bar.close > upperTargets[2] && previousClose <= previousUpperTargetThree) ||
        (bar.close < upperTargets[2] && previousClose >= previousUpperTargetThree);
      if (crossedUpperTarget)
        targetAlerts.push(`最终向上目标已触及：${upperTargets[2].toFixed(2)}`);
    }
    if (hasRange && previousClose !== null && previousLowerTargetThree !== null) {
      const crossedLowerTarget =
        (bar.close > lowerTargets[2] && previousClose <= previousLowerTargetThree) ||
        (bar.close < lowerTargets[2] && previousClose >= previousLowerTargetThree);
      if (crossedLowerTarget)
        targetAlerts.push(`最终向下目标已触及：${lowerTargets[2].toFixed(2)}`);
    }

    if (sessionEnded && hasRange) {
      upperTargets.forEach((target, targetIndex) => {
        if (bar.high >= target && !sessionTargetReached.upper[targetIndex]) {
          targetHits.upper[targetIndex] += 1;
          sessionTargetReached.upper[targetIndex] = true;
        }
      });
      lowerTargets.forEach((target, targetIndex) => {
        if (bar.low <= target && !sessionTargetReached.lower[targetIndex]) {
          targetHits.lower[targetIndex] += 1;
          sessionTargetReached.lower[targetIndex] = true;
        }
      });
    }

    const breakoutUp =
      !inSession &&
      sessionEnded &&
      hasRange &&
      displayAllowed &&
      previousClose !== null &&
      previousClose <= openingRangeHigh &&
      bar.close > openingRangeHigh;
    const breakoutDown =
      !inSession &&
      sessionEnded &&
      hasRange &&
      displayAllowed &&
      previousClose !== null &&
      previousClose >= openingRangeLow &&
      bar.close < openingRangeLow;
    const highVolume = isSeriesNumber(volumeAverage[index]) && bar.volume > volumeAverage[index]!;
    const volumeSuffix = highVolume ? "（高量）" : "（低量）";
    const currentAtr = atr[index];

    if (breakoutUp && canSignalUp) {
      const label = `向上突破${volumeSuffix}`;
      signals.push({
        timestamp: bar.timestamp,
        type: "buy",
        backtestAction: activeDirection === 0 ? "enter-long" : "none",
        price: bar.close,
        label,
      });
      elements.push({
        id: `utorb-buy-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: bar.high,
        direction: "down",
        tone: "buy",
        shape: "label-down",
        text: label,
        textSize: signalTextSize,
        color: bullColor,
        placement: "over-candles",
      });
      canSignalUp = false;
      if (activeDirection === 0) {
        activeDirection = 1;
        entryPrice = openingRangeHigh;
        trailStop = isSeriesNumber(currentAtr)
          ? bar.low - currentAtr * trailingStopAtrMultiplier
          : null;
        optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
          optimizerDirections[optimizerIndex] = 1;
          optimizerStops[optimizerIndex] = isSeriesNumber(currentAtr)
            ? bar.low - currentAtr * multiplier
            : null;
        });
      }
    }

    if (breakoutDown && canSignalDown) {
      const label = `向下突破${volumeSuffix}`;
      signals.push({
        timestamp: bar.timestamp,
        type: "sell",
        backtestAction: activeDirection === 0 ? "enter-short" : "none",
        price: bar.close,
        label,
      });
      elements.push({
        id: `utorb-sell-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: bar.low,
        direction: "up",
        tone: "sell",
        shape: "label-up",
        text: label,
        textSize: signalTextSize,
        color: bearColor,
        placement: "over-candles",
      });
      canSignalDown = false;
      if (activeDirection === 0) {
        activeDirection = -1;
        entryPrice = openingRangeLow;
        trailStop = isSeriesNumber(currentAtr)
          ? bar.high + currentAtr * trailingStopAtrMultiplier
          : null;
        optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
          optimizerDirections[optimizerIndex] = -1;
          optimizerStops[optimizerIndex] = isSeriesNumber(currentAtr)
            ? bar.high + currentAtr * multiplier
            : null;
        });
      }
    }

    if (activeDirection !== 0 && isSeriesNumber(currentAtr)) {
      trailStop =
        activeDirection > 0
          ? Math.max(
              trailStop ?? bar.low - currentAtr * trailingStopAtrMultiplier,
              bar.low - currentAtr * trailingStopAtrMultiplier,
            )
          : Math.min(
              trailStop ?? bar.high + currentAtr * trailingStopAtrMultiplier,
              bar.high + currentAtr * trailingStopAtrMultiplier,
            );
      if (trailSegmentDirection !== activeDirection) {
        flushTrailSegment();
        trailSegmentDirection = activeDirection;
      }
      currentTrailPoints.push({ timestamp: bar.timestamp, price: trailStop });

      const stopped = activeDirection > 0 ? bar.close < trailStop : bar.close > trailStop;
      if (stopped || !displayAllowed) {
        const exitBacktestAction = activeDirection > 0 ? "exit-long" : "exit-short";
        totalTrailProfit += activeDirection > 0 ? bar.close - entryPrice : entryPrice - bar.close;
        signals.push({
          timestamp: bar.timestamp,
          type: "exit",
          backtestAction: exitBacktestAction,
          price: bar.close,
          label: "移动风险线失效",
        });
        elements.push({
          id: `utorb-exit-${bar.timestamp}`,
          kind: "signal-marker",
          timestamp: bar.timestamp,
          price: trailStop,
          direction: activeDirection > 0 ? "down" : "up",
          tone: "neutral",
        });
        activeDirection = 0;
        trailStop = null;
        flushTrailSegment();
      }
    }

    if (showOptimizer && isSeriesNumber(currentAtr)) {
      optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
        const direction = optimizerDirections[optimizerIndex];
        if (direction === 0) return;
        const candidate =
          direction > 0 ? bar.low - currentAtr * multiplier : bar.high + currentAtr * multiplier;
        const nextStop =
          direction > 0
            ? Math.max(optimizerStops[optimizerIndex] ?? candidate, candidate)
            : Math.min(optimizerStops[optimizerIndex] ?? candidate, candidate);
        optimizerStops[optimizerIndex] = nextStop;
        const stopped = direction > 0 ? bar.close < nextStop : bar.close > nextStop;
        if (stopped || !displayAllowed) {
          optimizerProfits[optimizerIndex] +=
            direction > 0 ? bar.close - entryPrice : entryPrice - bar.close;
          optimizerDirections[optimizerIndex] = 0;
        }
      });
    }

    previousInSession = inSession;
    previousClose = bar.close;
    previousUpperTargetThree = hasRange ? upperTargets[2] : null;
    previousLowerTargetThree = hasRange ? lowerTargets[2] : null;
  });

  addSessionElements();
  flushTrailSegment();

  if (showVolumeProfile && latestVolumeProfile.size > 0 && sessionKey !== null) {
    const maximumVolume = Math.max(...latestVolumeProfile.values());
    const maximumWidth = openingRangeDuration * (volumeProfileWidthPercent / 100);
    const profileEndTimestamp = bars.at(-1)!.timestamp;
    [...latestVolumeProfile.entries()]
      .sort(([left], [right]) => left - right)
      .forEach(([price, volume], index) => {
        const width = maximumWidth * (volume / Math.max(1, maximumVolume));
        elements.push({
          id: `utorb-volume-profile-${index}`,
          kind: "band",
          fromPrice: price - latestTickSize / 2,
          toPrice: price + latestTickSize / 2,
          label: volume === maximumVolume ? "POC" : undefined,
          tone: "range",
          fillColor: volumeProfileColor,
          borderColor: volumeProfileColor,
          opacity: 0.1,
          fromTimestamp: profileEndTimestamp - width,
          toTimestamp: profileEndTimestamp,
        });
      });
  }

  const openingRange = Math.max(0, openingRangeHigh - openingRangeLow);
  const upperTargets = extensionMultipliers.map(
    (multiplier) => openingRangeHigh + openingRange * multiplier,
  );
  const lowerTargets = extensionMultipliers.map(
    (multiplier) => openingRangeLow - openingRange * multiplier,
  );
  const bestOptimizerIndex = optimizerProfits.reduce(
    (best, profit, index) => (profit > optimizerProfits[best] ? index : best),
    0,
  );
  const hitRate = (hits: number) => (totalSessions > 0 ? (hits / totalSessions) * 100 : 0);
  const latestSessionSuffix = sessionKey === null ? null : `-${sessionKey}`;
  elements.forEach((element) => {
    if (element.kind !== "price-line") return;
    const isLatestSession =
      latestSessionSuffix !== null && element.id.endsWith(latestSessionSuffix);
    if (!isLatestSession || !showTargetLabels) {
      element.label = undefined;
      return;
    }
    if (element.id.startsWith("utorb-opening-range-high-")) {
      element.label = "开盘高点";
      return;
    }
    if (element.id.startsWith("utorb-opening-range-low-")) {
      element.label = "开盘低点";
      return;
    }
    const targetMatch = /^utorb-target-(up|down)-([1-3])-/.exec(element.id);
    if (!targetMatch) return;
    const targetIndex = Number(targetMatch[2]) - 1;
    const hits =
      targetMatch[1] === "up" ? targetHits.upper[targetIndex] : targetHits.lower[targetIndex];
    element.label = `目标 ${targetIndex + 1} (${Math.round(hitRate(hits))}%)`;
  });

  const directionalSignalCount = signals.filter(
    (signal) => signal.type === "buy" || signal.type === "sell",
  ).length;

  return {
    signals,
    overlays: elements,
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 10,
      elements,
    },
    metrics: {
      openingRangeHigh,
      openingRangeLow,
      openingRange,
      upperTargetOne: upperTargets[0],
      upperTargetTwo: upperTargets[1],
      upperTargetThree: upperTargets[2],
      lowerTargetOne: lowerTargets[0],
      lowerTargetTwo: lowerTargets[1],
      lowerTargetThree: lowerTargets[2],
      totalSessions,
      upperTargetOneHits: targetHits.upper[0],
      upperTargetTwoHits: targetHits.upper[1],
      upperTargetThreeHits: targetHits.upper[2],
      lowerTargetOneHits: targetHits.lower[0],
      lowerTargetTwoHits: targetHits.lower[1],
      lowerTargetThreeHits: targetHits.lower[2],
      upperTargetOneHitRate: hitRate(targetHits.upper[0]),
      upperTargetTwoHitRate: hitRate(targetHits.upper[1]),
      upperTargetThreeHitRate: hitRate(targetHits.upper[2]),
      lowerTargetOneHitRate: hitRate(targetHits.lower[0]),
      lowerTargetTwoHitRate: hitRate(targetHits.lower[1]),
      lowerTargetThreeHitRate: hitRate(targetHits.lower[2]),
      totalTrailingProfit: totalTrailProfit,
      bestTrailingStopMultiplier: optimizerMultipliers[bestOptimizerIndex],
      bestTrailingStopProfit: optimizerProfits[bestOptimizerIndex],
      signalCount: directionalSignalCount,
    },
    logs: [
      timezoneMode === "market"
        ? `UTORB 已按市场时区 ${sessionTimeZone} 追踪 ${totalSessions} 个开盘区间。`
        : `UTORB 已按 UTC${timezoneOffsetHours >= 0 ? "+" : ""}${timezoneOffsetHours} 追踪 ${totalSessions} 个开盘区间。`,
      `最新区间 ${openingRangeLow.toFixed(2)} - ${openingRangeHigh.toFixed(2)}，生成 ${directionalSignalCount} 个突破条件事件。`,
    ],
    alerts: [...signals.map((signal) => signal.label ?? signal.type), ...targetAlerts],
  };
}

export function createUtorbStrategyDefinition(): StrategyDefinition {
  const utorbStrategy: StrategyDefinition = {
    key: "utorb",
    name: "UTORB 开盘区间突破",
    version: "1.0.0",
    description:
      "按 Pine Script 复刻的逐日开盘区间突破策略，包含扩展观察水平、量能分类、成交量分布与 ATR 移动风险线。",
    sourceType: "preset",
    sourceFile: "trading-strategies/utorb.md",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["realtime", "1m", "5m", "15m", "30m"],
    parameterSchema: [
      {
        key: "sessionStartHour",
        label: "开盘时（本地）",
        type: "number",
        defaultValue: 9,
        description: "开盘区间开始小时，按策略时区解释。",
      },
      {
        key: "sessionStartMinute",
        label: "开盘分（本地）",
        type: "number",
        defaultValue: 30,
      },
      {
        key: "openingRangeMinutes",
        label: "开盘区间分钟数",
        type: "number",
        defaultValue: 30,
        description: "对应 Pine 默认 09:30-10:00 的 30 分钟会话。",
      },
      {
        key: "sessionDays",
        label: "适用交易日",
        type: "select",
        defaultValue: "1234567",
        options: [
          { label: "每天", value: "1234567" },
          { label: "周一至周五", value: "23456" },
        ],
      },
      {
        key: "timezoneMode",
        label: "时区模式",
        type: "select",
        defaultValue: "fixed-offset",
        description: "固定偏移与原 Pine 默认 UTC-5 一致；也可切换为市场时区并自动处理夏令时。",
        options: [
          { label: "固定 UTC 偏移", value: "fixed-offset" },
          { label: "跟随市场（自动夏令时）", value: "market" },
        ],
      },
      {
        key: "timezoneOffsetHours",
        label: "时区 UTC 偏移",
        type: "number",
        defaultValue: -5,
        description: "与 Pine 的 UTC-5 默认时区一致；固定偏移，不自动切换夏令时。",
      },
      {
        key: "rangeSource",
        label: "区间来源",
        type: "select",
        defaultValue: "high-low",
        options: [
          { label: "最高/最低价", value: "high-low" },
          { label: "蜡烛实体", value: "close" },
        ],
      },
      {
        key: "showTargets",
        label: "显示扩展水平",
        type: "boolean",
        defaultValue: true,
      },
      { key: "showTargetLabels", label: "显示目标文字标签", type: "boolean", defaultValue: true },
      {
        key: "extensionType",
        label: "扩展类型",
        type: "select",
        defaultValue: "multiples",
        options: [
          { label: "倍数", value: "multiples" },
          { label: "斐波那契", value: "fibonacci" },
        ],
      },
      { key: "extensionMultiplierOne", label: "扩展倍数 1", type: "number", defaultValue: 1 },
      { key: "extensionMultiplierTwo", label: "扩展倍数 2", type: "number", defaultValue: 2 },
      { key: "extensionMultiplierThree", label: "扩展倍数 3", type: "number", defaultValue: 3 },
      { key: "bullColor", label: "多头颜色", type: "color", defaultValue: "#089981" },
      { key: "bearColor", label: "空头颜色", type: "color", defaultValue: "#f23645" },
      { key: "neutralColor", label: "区间颜色", type: "color", defaultValue: "#5b9cf6" },
      { key: "backgroundTransparency", label: "区域透明度", type: "number", defaultValue: 85 },
      {
        key: "signalLabelSize",
        label: "事件标签大小",
        type: "select",
        defaultValue: "small",
        options: [
          { label: "极小", value: "tiny" },
          { label: "小", value: "small" },
          { label: "中", value: "normal" },
          { label: "大", value: "large" },
        ],
      },
      { key: "showVolumeProfile", label: "显示成交量分布", type: "boolean", defaultValue: true },
      { key: "volumeProfileRows", label: "成交量分布行数", type: "number", defaultValue: 14 },
      {
        key: "volumeProfileWidthPercent",
        label: "成交量分布宽度 (%)",
        type: "number",
        defaultValue: 30,
      },
      {
        key: "volumeProfileColor",
        label: "成交量分布颜色",
        type: "color",
        defaultValue: "#5b9cf6",
      },
      { key: "stopPlotting", label: "限制绘制时长", type: "boolean", defaultValue: true },
      {
        key: "plottingEndType",
        label: "结束绘制于",
        type: "select",
        defaultValue: "new-york-close",
        options: [
          { label: "纽约收盘", value: "new-york-close" },
          { label: "伦敦收盘", value: "london-close" },
          { label: "手动时间", value: "manual" },
          { label: "当日结束", value: "end-of-day" },
        ],
      },
      { key: "manualEndHour", label: "手动结束小时", type: "number", defaultValue: 16 },
      { key: "manualEndMinute", label: "手动结束分钟", type: "number", defaultValue: 0 },
      { key: "showTrailingStop", label: "显示移动风险线", type: "boolean", defaultValue: false },
      {
        key: "trailingStopAtrMultiplier",
        label: "移动风险线 ATR 倍数",
        type: "number",
        defaultValue: 2,
      },
      {
        key: "trailingStopAtrPeriod",
        label: "移动风险线 ATR 周期",
        type: "number",
        defaultValue: 14,
      },
      { key: "showOptimizer", label: "计算风险线优化器", type: "boolean", defaultValue: false },
    ],
    run: (input) => runUtorbStrategy(utorbStrategy, input),
  };
  return utorbStrategy;
}
