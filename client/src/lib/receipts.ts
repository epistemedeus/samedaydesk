// Real settlements and delivered work, built by scripts/build-receipts.mjs from receiving
// records (on-chain payments and public proofs). Never edited by hand.
import data from "../data/receipts.json";

/** Who paid: an independent party named for what it was, or an unresolved wallet with no claim. */
export type Payer = { address: string; class: "independent" | "unresolved"; label?: string; who?: string };
/** A paid call as Base recorded it: the transferWithAuthorization the facilitator submitted. */
export type Chain = {
  network: string;
  token: string;
  tokenContract: string;
  method: string;
  authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string };
  transactionHash: string;
  blockNumber: number;
  blockTime: string;
  logIndex: number;
  submittedBy: string;
  status: string;
  verifiedAt: string;
};
export type Receipt = {
  kind: "settlement" | "delivered";
  date: string;
  time?: string;
  for: string;
  delivered: string;
  amount?: string;
  rail?: string;
  paidHow?: string;
  proof: string;
  more?: string;
  payer?: Payer;
  tool?: { route: string; name: string; what: string } | null;
  chain?: Chain;
  check?: { rpc: string; request: unknown; expect: string };
};

export const RECEIPTS = data.entries as Receipt[];
/** Counts by class for the frame's header: delivered, paid calls, distinct wallets, independent. */
export const CLASSES = data.classes;
export const CHAIN_READ_AT = data.generatedAt;
/** "0x8904…3cee": the head and tail of an address or hash. */
export const short = (hex: string, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;
/** "14:05 UTC" from an ISO time. */
export const utcTime = (iso?: string) => (iso ? `${iso.slice(11, 16)} UTC` : "");
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

export const callsLabel = (n: number) => `${n} paid ${n === 1 ? "call" : "calls"}`;
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
