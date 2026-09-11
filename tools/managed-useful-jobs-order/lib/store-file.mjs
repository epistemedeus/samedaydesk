import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OrderRefuse } from "./errors.mjs";

function fileFor(dir, orderId) {
  return join(dir, `${orderId}.json`);
}

export function createFileStore(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    kind: "file",
    async get(orderId) {
      const path = fileFor(dir, orderId);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf8"));
    },
    async put(record) {
      const existing = await this.get(record.orderId);
      if (existing) {
        if (existing.termsHash !== record.termsHash) {
          throw new OrderRefuse(
            "f-order",
            "orderId is immutable; swapped files require a new orderId",
            {
              falsifier: "F-ORDER",
              httpStatus: 409,
              detail: {
                orderId: record.orderId,
                storedTermsHash: existing.termsHash,
                requestedTermsHash: record.termsHash,
              },
            },
          );
        }
        return { replayed: true, record: existing };
      }
      const dest = fileFor(dir, record.orderId);
      const tmp = `${dest}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
      renameSync(tmp, dest);
      return { replayed: false, record };
    },
    async close() {},
  };
}
