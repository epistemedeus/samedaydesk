// Real settlements and delivered work, built by scripts/build-receipts.mjs from receiving
// records (on-chain payments and public proofs). Never edited by hand.
import data from "../data/receipts.json";

export type Receipt = {
  kind: "settlement" | "delivered";
  date: string;
  for: string;
  delivered: string;
  amount?: string;
  rail?: string;
  paidHow?: string;
  proof: string;
  more?: string;
};

export const RECEIPTS = data.entries as Receipt[];
/** The tape appears only once it holds this many entries; below it, the band is absent. */
export const TAPE_FLOOR = data.floor;
export const tapeShown = () => RECEIPTS.length >= TAPE_FLOOR;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const tapeDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
export const tapeLine = (r: Receipt) =>
  [tapeDate(r.date), r.for, r.kind === "delivered" ? r.delivered : null, r.amount ? `${r.amount} · ${r.rail}` : null]
    .filter(Boolean)
    .join(" · ");

export { receiptId } from "../data/receiptPages.mjs";

export const DELIVERED = RECEIPTS.filter((r) => r.kind === "delivered").sort((a, b) => b.date.localeCompare(a.date));
export const SETTLED = RECEIPTS.filter((r) => r.kind === "settlement");

// USDC amounts to six decimals, summed without float drift: "0.005 USDC" -> 5000.
const micro = (amount = "") => Math.round(Number.parseFloat(amount) * 1e6) || 0;
const usdc = (units: number) => `${(units / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} USDC`;

export type Day = { date: string; calls: Receipt[]; total: string };
/** Paid calls grouped by day, newest first. */
export const DAYS: Day[] = Object.entries(
  SETTLED.reduce<Record<string, Receipt[]>>((days, r) => ((days[r.date] ??= []).push(r), days), {}),
)
  .sort(([a], [b]) => b.localeCompare(a))
  .map(([date, calls]) => ({ date, calls, total: usdc(calls.reduce((sum, r) => sum + micro(r.amount), 0)) }));

export const callsLabel = (n: number) => `${n} paid ${n === 1 ? "call" : "calls"} from AI agents`;
export const dayLine = (d: Day) => [tapeDate(d.date), callsLabel(d.calls.length), d.total].join(" · ");
export const SETTLED_TOTAL = usdc(SETTLED.reduce((sum, r) => sum + micro(r.amount), 0));

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export type Month = { month: string; name: string; days: Day[]; calls: number; total: string };
/** Paid-call days grouped by month, newest first, for /receipts; the year shows only when it differs from the newest. */
export const MONTHS_OF_CALLS: Month[] = Object.entries(
  DAYS.reduce<Record<string, Day[]>>((months, d) => ((months[d.date.slice(0, 7)] ??= []).push(d), months), {}),
)
  .sort(([a], [b]) => b.localeCompare(a))
  .map(([month, days], _, all) => ({
    month,
    name: MONTH_NAMES[Number(month.slice(5, 7)) - 1] + (month.slice(0, 4) === all[0][0].slice(0, 4) ? "" : ` ${month.slice(0, 4)}`),
    days,
    calls: days.reduce((n, d) => n + d.calls.length, 0),
    total: usdc(days.flatMap((d) => d.calls).reduce((sum, r) => sum + micro(r.amount), 0)),
  }));
