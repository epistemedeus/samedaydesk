#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runOneShot } from "./impact.mjs";
import { requireEvidence } from "./evidence.mjs";

try {
  const { values } = parseArgs({ options: {
    installed: { type: "string" }, observation: { type: "string" }, "observation-url": { type: "string" },
    repo: { type: "string", default: "." }, clock: { type: "string" }, "horizon-hours": { type: "string" },
    "out-dir": { type: "string" }, "timeout-ms": { type: "string", default: "5000" },
    "mounted-origin": { type: "boolean", default: false }, pretty: { type: "boolean", default: false }, help: { type: "boolean" },
  } });
  if (values.help) {
    process.stdout.write("Finite release impact for the installed SDS301 archive-refusal repair.\nnode tools/release-impact-211710/cli.mjs --installed installed.json --observation observation.json --repo . --clock 2026-10-11T04:00:00Z --horizon-hours 24 --out-dir /tmp/release-impact\nUse --observation-url with --mounted-origin for an explicitly mounted loopback HTTP source.\nExit 0: supported assessment; 2: useful refusal/uncertainty; 1: operational/argument error.\n");
  } else {
    requireEvidence(values.installed && values["out-dir"], "installed_and_output_required", "error");
    const timeoutMs = Number(values["timeout-ms"]);
    requireEvidence(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, "invalid_timeout", "error");
    const outcome = await runOneShot({ installedPath: resolve(values.installed), observationPath: values.observation ? resolve(values.observation) : null,
      observationUrl: values["observation-url"], repo: resolve(values.repo), clock: values.clock,
      horizonHours: Number(values["horizon-hours"]), outDir: resolve(values["out-dir"]), timeoutMs, mountedOrigin: values["mounted-origin"] });
    process.stdout.write(`${JSON.stringify(outcome, null, values.pretty ? 2 : 0)}\n`);
    process.exitCode = outcome.ok ? 0 : outcome.outcome === "error" ? 1 : 2;
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, outcome: "error", reason: error.code || "invalid_arguments", paymentAttempted: false, installedStateChanged: false })}\n`);
  process.exitCode = 1;
}
