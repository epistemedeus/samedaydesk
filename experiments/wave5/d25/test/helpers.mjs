import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { D01_CLI, D01_PAYMENT, QA, REPO_ROOT } from "../lib/repo.mjs";
import { OWNER_QA_BUDGET } from "../lib/journey.mjs";
import { reservedFixturePaymentPath, runPaidCli } from "../lib/execute.mjs";
import { classifyResult } from "../lib/classify.mjs";
import { parseJsonStdout, runNode } from "../lib/spawn.mjs";

export function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export { assert, copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync, join, D01_CLI, D01_PAYMENT, QA, REPO_ROOT, OWNER_QA_BUDGET, reservedFixturePaymentPath, runPaidCli, classifyResult, parseJsonStdout, runNode };
