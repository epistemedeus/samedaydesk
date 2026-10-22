import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const D14_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");

export const EXECUTION_CONTRACT_VERSION = "samedaydesk.paid-useful-jobs.execution.v1";
export const D01_PIN = "6bed72dd22a396134aa5c957933b42c3a5746698";
export const D01_KERNEL_PIN = "bccf34b3816ebe20d43823d0978308fd10f9bb33";
export const D01_BRANCH = "codex/w5-d01-20260911";
export const D01_PR = 74;
export const SDS52_PIN = "aeef964fa188443078958d9d6d393afae1d542ee";
