import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PIN, PACK_ROOT } from "./paths.mjs";

export const RECEIPT_SCHEMA = "samedaydesk.useful-job-desk.receipt.v1";

const SCHEMA = JSON.parse(readFileSync(join(PACK_ROOT, "receipts/schema.json"), "utf8"));

export function assertReceiptContract(receipt) {
  for (const key of SCHEMA.required) {
    if (!(key in receipt)) {
      throw Object.assign(new Error(`receipt missing required field ${key}`), { code: "schema-drift" });
    }
  }
  if (receipt.schema !== SCHEMA.properties.schema.const) {
    throw Object.assign(new Error("receipt schema id drifted"), { code: "schema-drift" });
  }
  for (const flag of ["purchaseAuthority", "organicDemand", "repeatDemand", "h32PrivatePrimitivesReopened"]) {
    if (receipt[flag] !== SCHEMA.properties[flag].const) {
      throw Object.assign(new Error(`receipt ${flag} must stay ${SCHEMA.properties[flag].const}`), {
        code: "schema-drift",
      });
    }
  }
  if (receipt.engine?.version !== SCHEMA.properties.engine.properties.version.const) {
    throw Object.assign(new Error("receipt engine.version drifted"), { code: "schema-drift" });
  }
  if (receipt.engine?.sha256 !== SCHEMA.properties.engine.properties.sha256.const) {
    throw Object.assign(new Error("receipt engine.sha256 drifted"), { code: "schema-drift" });
  }
}

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
    callerOwned: true,
    ...extra,
    purchaseAuthority: false,
    hostedAcquisition: false,
    schedulerDaemon: false,
    organicDemand: false,
    repeatDemand: false,
    h32PrivatePrimitivesReopened: false,
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
  assertReceiptContract(receipt);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`);
  return filePath;
}

export function printReceipt(receipt) {
  assertReceiptContract(receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

export { PACK_ROOT };
