// One page per entry of the tape (/receipts/<id>), shared by the React page and the server's
// route shells so the crawler HTML and the page say the same thing. Built from receipts.json,
// which scripts/build-receipts.mjs writes from receiving records.
import data from "./receipts.json" with { type: "json" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** A stable address for each entry: the transaction for a paid call, date and party for work. */
export function receiptId(r) {
  if (r.kind === "settlement") return (r.proof.match(/0x([0-9a-f]{10})/i)?.[1] ?? r.date).toLowerCase();
  const party = r.for.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${r.date}-${party}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What the page's title says the entry is. */
export function receiptHeading(r) {
  return r.kind === "settlement" ? (r.tool ? `A paid call: ${r.tool.name}` : "A paid call to the gateway") : r.for;
}

export function receiptShell(r) {
  const id = receiptId(r);
  const what = r.kind === "settlement"
    ? `A paid call to the SameDayDesk gateway${r.tool ? ` (${r.tool.name})` : ""}, settled on ${r.rail} on ${longDate(r.date)}: transaction ${r.chain.transactionHash}, block ${r.chain.blockNumber}, from wallet ${r.payer.address}${r.payer.class === "independent" ? `, ${r.payer.label}` : ""}.`
    : `Delivered for ${r.for} on ${longDate(r.date)}: ${r.delivered}.`;
  return {
    id,
    path: `/receipts/${id}`,
    title: `Receipt ${id} | SameDayDesk`,
    description: `${what}${r.amount ? ` Paid ${r.amount}.` : ""} With its public proof.`,
    crawlerHtml: `<h1>${esc(receiptHeading(r))}</h1><p>${esc(what)}</p><p><a href="${esc(r.proof)}">The proof</a> · <a href="/receipts">All receipts</a></p>`,
    ogImage: "/og/receipts.png",
  };
}

export const RECEIPT_SHELLS = data.entries.map(receiptShell);

const seen = new Set();
for (const shell of RECEIPT_SHELLS) {
  if (seen.has(shell.id)) throw new Error(`receipts: two entries share the id ${shell.id}`);
  seen.add(shell.id);
}
