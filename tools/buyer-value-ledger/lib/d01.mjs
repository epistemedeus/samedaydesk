import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Current pinned SDS52 wrapper this ledger may consume. D01 may amend later. */
export const D01_PIN = "aeef964fa188443078958d9d6d393afae1d542ee";
export const D01_REPO = "epistemedeus/samedaydesk";
export const D01_REF = "fable/f08-paid-wrappers";
export const D01_EXPORT = "server/paid-useful-jobs/index.mjs";

export function d01Root(explicit = process.env.BUYER_VALUE_LEDGER_D01_ROOT) {
  if (explicit && existsSync(join(explicit, D01_EXPORT))) return explicit;
  const fallback = "/tmp/ro-sds-pr52-aeef964";
  if (existsSync(join(fallback, D01_EXPORT))) return fallback;
  return null;
}

export function d01BindingNote(root = d01Root()) {
  return {
    integrationOwner: "W5-D01",
    repo: D01_REPO,
    pin: D01_PIN,
    ref: D01_REF,
    exportPath: D01_EXPORT,
    available: Boolean(root),
    root: root || null,
    remaining:
      "Default labelled runs spawn pinned useful-jobs 1.0.0. Optional BUYER_VALUE_LEDGER_D01_ROOT imports runPaidOffer from this pin. This ledger does not copy the wrapper and does not claim later D01 amendments.",
  };
}

export async function importD01(root = d01Root()) {
  const note = d01BindingNote(root);
  if (!root) return note;
  const mod = await import(pathToFileURL(join(root, D01_EXPORT)).href);
  return {
    ...note,
    runPaidOffer: mod.runPaidOffer,
    engineArchiveIdentity: mod.engineArchiveIdentity || null,
  };
}
