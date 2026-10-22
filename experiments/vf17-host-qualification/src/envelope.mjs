import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CONNECTION_ENVELOPE = 24;
export const RECOMMENDED_BASE_POOL = 2;

export function readFoundryPools() {
  const path = fileURLToPath(new URL("../../../server/foundry/PINS.json", import.meta.url));
  const pins = JSON.parse(readFileSync(path, "utf8"));
  return pins.pools;
}

export function foundryConnectionMath(pools, recommendedBasePool = RECOMMENDED_BASE_POOL) {
  const perWeb = (base) => base + pools.entry + pools.workCells + pools.integration;
  const math = {
    source: "server/foundry/PINS.json",
    document: "docs/FOUNDRY-HOST-RECEIVER.md",
    pools,
    recommendedBasePool,
    oneWebPlusWorker: perWeb(recommendedBasePool) + pools.worker,
    twoWebAtBaseMax: perWeb(pools.baseMax) * 2,
    twoWebAtBaseMaxPlusWorker: perWeb(pools.baseMax) * 2 + pools.worker,
    connectionEnvelope: CONNECTION_ENVELOPE,
    note: "Cited from the receiving owner documents on this repo base. Not a Hostinger measurement.",
  };
  for (const value of [math.oneWebPlusWorker, math.twoWebAtBaseMax, math.twoWebAtBaseMaxPlusWorker]) {
    if (!Number.isInteger(value)) throw new Error("foundry pool math is incomplete");
  }
  return math;
}
