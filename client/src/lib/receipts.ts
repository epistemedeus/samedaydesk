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

/** A stable address for each entry: the transaction for a settlement, date and party for work. */
export const receiptId = (r: Receipt): string =>
  r.kind === "settlement"
    ? (r.proof.match(/0x([0-9a-f]{10})/i)?.[1] ?? r.date).toLowerCase()
    : `${r.date}-${r.for.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

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
