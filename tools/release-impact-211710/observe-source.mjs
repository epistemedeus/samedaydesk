#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { observeSource } from "./source.mjs";
import { readJson, requireEvidence, writeImmutable } from "./evidence.mjs";

try {
  const { values } = parseArgs({ options: { repo: { type: "string", default: "." }, from: { type: "string" }, to: { type: "string" },
    clock: { type: "string" }, "window-start": { type: "string" }, runtime: { type: "string" }, out: { type: "string" }, "timeout-ms": { type: "string", default: "5000" } } });
  requireEvidence(values.out, "output_required");
  const observation = await observeSource({ repo: resolve(values.repo), fromRef: values.from, toRef: values.to,
    clock: values.clock, windowStart: values["window-start"], timeoutMs: Number(values["timeout-ms"]),
    runtimeValue: values.runtime ? readJson(resolve(values.runtime)).document : undefined });
  const persisted = writeImmutable(resolve(values.out), observation);
  process.stdout.write(`${JSON.stringify({ ok: observation.status === "complete", schema: observation.schema, status: observation.status,
    fromRef: observation.fromRef, toRef: observation.toRef, failureCode: observation.failureCode || null, persisted })}\n`);
  process.exitCode = observation.status === "complete" ? 0 : 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: error.code || "source_observation_failed" })}\n`);
  process.exitCode = 2;
}
