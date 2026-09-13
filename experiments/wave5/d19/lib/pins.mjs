import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const D19_ROOT = join(here, "..");
export const REPO_ROOT = join(D19_ROOT, "../../..");
export const PIN = JSON.parse(readFileSync(join(D19_ROOT, "PIN.json"), "utf8"));

export const CO20_SHA = PIN.tested.co20.sha;
export const CO16_SHA = PIN.tested.co16.sha;
export const SDS52_SHA = PIN.tested.sds52.sha;
export const ORDER_CLI = PIN.tested.co20.cli;
export const LEDGER_CLI = PIN.tested.co16.cli;
export const CO20_PATH = PIN.tested.co20.path;
export const CO16_PATH = PIN.tested.co16.path;
export const LISTEN_PATH = PIN.tested.co20.listenPath;
export const PG_BIN = process.env.W5_D19_PG_BIN || "/usr/lib/postgresql/16/bin";
