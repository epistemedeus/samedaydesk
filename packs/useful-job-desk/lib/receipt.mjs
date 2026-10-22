import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PIN, PACK_ROOT } from "./paths.mjs";

export const RECEIPT_SCHEMA = "samedaydesk.useful-job-desk.receipt.v1";

export function baseReceipt(extra = {}) {
  return {
    schema: RECEIPT_SCHEMA,
    pack: PIN.pack,
    engine: {
      package: PIN.engine.package,
      version: PIN.engine.version,
      sha256: PIN.engine.sha256,
      bytes: PIN.engine.bytes,
      cli: PIN.engine.cli,
      enginesModified: false,
    },
    purchaseAuthority: false,
    hostedAcquisition: false,
    schedulerDaemon: false,
    organicDemand: false,
    repeatDemand: false,
    h32PrivatePrimitivesReopened: false,
    callerOwned: true,
    ...extra,
  };
}

export function honestDelivered(run) {
  if (!run) return false;
  if (run.status !== 0) return false;
  if (run.engineJson?.ok === false) return false;
  if (!run.promisedOutputs?.length) return false;
  if (run.missingOutputs?.length) return false;
  return true;
}

export function writeReceipt(filePath, receipt) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`);
  return filePath;
}

export function printReceipt(receipt) {
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

export { PACK_ROOT };
