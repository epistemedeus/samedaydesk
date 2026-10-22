import { constants, closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { boundedJson } from "./util.mjs";
import { validate } from "./schemas.mjs";

export function readPrivateJson(file) {
  if (!file || !isAbsolute(file)) throw new Error("absolute private config file required");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size > 524288) throw new Error("invalid private config file");
    return boundedJson(readFileSync(fd, "utf8"), 524288);
  } finally { closeSync(fd); }
}

export function loadConfig(env = process.env) {
  if (env.MACHINE_GATEWAY_ENABLED !== "1") {
    if (env.MACHINE_GATEWAY_ENABLED && env.MACHINE_GATEWAY_ENABLED !== "0") throw new Error("invalid gateway opt-in");
    return null;
  }
  const file = env.MACHINE_GATEWAY_STATE_FILE;
  if (!file || !isAbsolute(file) || !file.endsWith("/machine-gateway.sqlite")) throw new Error("dedicated absolute gateway state file required");
  const config = readPrivateJson(env.MACHINE_GATEWAY_TENANTS_FILE);
  validate("tenantConfig", config);
  const payments = env.MACHINE_GATEWAY_PAYMENTS_ENABLED || "0";
  if (!["0", "1"].includes(payments)) throw new Error("invalid gateway payment opt-in");
  return { file, tenants: config.tenants, prefix: "/api/machine-gateway", paymentsEnabled: payments === "1", environment: env.NODE_ENV || "production" };
}
