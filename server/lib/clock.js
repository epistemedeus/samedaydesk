// Business-day arithmetic for the published delivery clocks.
// Monday to Friday in America/Los_Angeles, US federal holidays excluded. The holiday list
// is explicit rather than computed, so a reader can check it against the OPM calendar.
const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24",
]);

const TZ = "America/Los_Angeles";

export function localParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

export function isBusinessDay(iso, weekday) {
  if (weekday === "Sat" || weekday === "Sun") return false;
  return !HOLIDAYS.has(iso);
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${iso}T12:00:00Z`));
}

// The next business morning after `date`, as an ISO date string.
export function nextBusinessMorning(date = new Date()) {
  let iso = addDaysIso(localParts(date).iso, 1);
  while (!isBusinessDay(iso, weekdayOf(iso))) iso = addDaysIso(iso, 1);
  return iso;
}

// `days` business days after the start date, inclusive of the start day as day one.
export function addBusinessDays(startIso, days) {
  let iso = startIso;
  let counted = isBusinessDay(iso, weekdayOf(iso)) ? 1 : 0;
  while (counted < days) {
    iso = addDaysIso(iso, 1);
    if (isBusinessDay(iso, weekdayOf(iso))) counted += 1;
  }
  return iso;
}
