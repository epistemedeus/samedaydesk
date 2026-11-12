import { readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { RECEIPT_SCHEMA } from "./pins.mjs";

function readBootId() {
  try {
    return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function sourceReceipt(env = process.env) {
  return {
    schema: RECEIPT_SCHEMA,
    prepared: true,
    installed: false,
    workflow: {
      id: "eFUkVKYk8xXbM7LV",
      reuse: "existing-unpublished-no-new-charge",
      newCharge: false,
      newExecution: false,
      newCredentialRecipient: false,
    },
    native: {
      executable: process.execPath,
      pid: process.pid,
      account: userInfo().username,
      catalogModel: env.AE14_NATIVE_MODEL || env.GROK_MODEL || null,
      catalogEffort: env.AE14_NATIVE_EFFORT || null,
      session: env.GROK_SESSION_ID || null,
      vm: env.AE14_HOST || null,
      boot: readBootId(),
      writer: "tools/recurring-decision-consumer",
      hostname: hostname(),
    },
    outsideUse: "none",
    payment: "none",
  };
}
