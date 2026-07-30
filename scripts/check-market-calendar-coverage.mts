import { getCalendarCoverage } from "../apps/desktop/src/features/marketData/marketCalendar.ts";
import type { Market } from "../packages/shared/src/index.ts";

const minimumCoverageDays = 90;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;
const now = new Date();
const requiredThrough = new Date(now.getTime() + minimumCoverageDays * millisecondsPerDay);

for (const market of ["CN", "HK", "US"] satisfies Market[]) {
  const coverage = getCalendarCoverage(market);
  const lastCoveredInstant = Date.parse(`${coverage.lastDate}T23:59:59.999Z`);
  if (lastCoveredInstant < requiredThrough.getTime()) {
    throw new Error(
      `${market} trading calendar ${coverage.sourceVersion} ends on ` +
        `${coverage.lastDate}; release coverage must extend at least ` +
        `${minimumCoverageDays} days beyond ${now.toISOString().slice(0, 10)}`,
    );
  }
  console.log(
    `${market}: ${coverage.firstDate}..${coverage.lastDate} ` + `(${coverage.sourceVersion})`,
  );
}
