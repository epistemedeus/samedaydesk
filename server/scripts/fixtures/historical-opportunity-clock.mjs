// Retained producer suites carry an immutable October round. Replay those cases
// at their declared date; current-date mounted-consumer tests run without this.
// Elapsed time, deadlines and explicit Date arguments retain their normal meaning.
if (process.env.SDS_HISTORICAL_SUITE !== "opportunity-20261012") throw new Error("Historical test replay requires an explicit suite selection");
const RealDate = Date;
const start = Number(process.env.SDS_HISTORICAL_CLOCK_START);
if (!Number.isSafeInteger(start)) throw new Error("Historical replay requires its shared start instant");
const anchor = RealDate.parse("2026-10-12T12:00:00Z");
class HistoricalDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [anchor + RealDate.now() - start])); }
  static now() { return anchor + RealDate.now() - start; }
}
globalThis.Date = HistoricalDate;
