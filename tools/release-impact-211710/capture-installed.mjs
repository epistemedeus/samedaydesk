#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { captureInstalled } from "./installed.mjs";
import { requireEvidence, writeImmutable } from "./evidence.mjs";

try {
  const { values } = parseArgs({ options: { repo: { type: "string", default: "." }, ref: { type: "string" }, clock: { type: "string" }, out: { type: "string" } } });
  requireEvidence(values.out, "output_required");
  const installed = await captureInstalled({ repo: resolve(values.repo), ref: values.ref, clock: values.clock });
  const persisted = writeImmutable(resolve(values.out), installed);
  process.stdout.write(`${JSON.stringify({ ok: true, schema: installed.schema, repairId: installed.repairId,
    installedRef: installed.installation.ref, installationKind: installed.installation.kind, relationship: installed.installation.relationship, persisted })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: error.code || "installation_capture_failed", installedAcceptance: false })}\n`);
  process.exitCode = 2;
}
