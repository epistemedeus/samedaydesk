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
