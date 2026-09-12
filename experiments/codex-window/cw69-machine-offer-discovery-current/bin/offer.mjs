#!/usr/bin/env node
/**
 * CW69 lockfile-pin-delta adapter. Discover, describe, and invoke as separate
 * processes. Local non-settling CLI only. Hosted merchant captures stay evidence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, usage } from "../lib/args.mjs";
import { JOB_ID } from "../lib/constants.mjs";
import { buildDescription, writeDescription } from "../lib/describe.mjs";
import { buildDiscovery, writeDiscovery } from "../lib/discovery.mjs";
import { buildInvocation } from "../lib/invoke.mjs";
import { liveRebind } from "../lib/live-rebind.mjs";
import { asRefusePayload, OfferRefuse } from "../lib/refuse.mjs";

function emit(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args._[0]) {
  process.stdout.write(usage());
  process.exit(args.help ? 0 : 2);
}

const cmd = args._[0];

try {
  if (args["engine-root"] || process.env.CW69_ENGINE_ROOT) {
    throw new OfferRefuse("engine-root-override", "engine-root override is refused", {
      engineRoot: args["engine-root"] || process.env.CW69_ENGINE_ROOT,
    });
  }

  if (cmd === "discover") {
    const jobId = args["job-id"] || JOB_ID;
    const { discovery } = buildDiscovery({ jobId, repoRoot: args["repo-root"] });
    if (args["live-rebind"] === true) {
      discovery.liveRebind = await liveRebind(discovery.identity.merchant);
    }
    if (args.out) writeDiscovery(discovery, resolve(String(args.out)));
    emit(discovery, 0);
  }

  if (cmd === "describe") {
    const { description } = buildDescription({
      discovery: args.discovery ? resolve(String(args.discovery)) : null,
      before: args.before,
      after: args.after,
      method: args.method,
      acquisition: args.acquisition,
      engineRoot: args["engine-root"],
      example: args.example === true,
      repoRoot: args["repo-root"],
    });
    if (args.out) writeDescription(description, resolve(String(args.out)));
    emit(description, 0);
  }

  if (cmd === "invoke") {
    const { invocation } = buildInvocation({
      description: args.description ? resolve(String(args.description)) : null,
      before: args.before,
      after: args.after,
      outDir: args["out-dir"],
      method: args.method,
      acquisition: args.acquisition,
      engineRoot: args["engine-root"],
      example: args.example === true,
      repoRoot: args["repo-root"],
    });
    emit(invocation, invocation.ok ? 0 : 2);
  }

  if (cmd === "verify") {
    const { assertUntamperedArtifacts } = await import("../lib/invoke.mjs");
    const invocationPath = args.invocation ? resolve(String(args.invocation)) : null;
    const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : null;
    if (!invocationPath || !outDir) {
      throw new OfferRefuse("missing-verify-inputs", "verify requires --invocation and --out-dir");
    }
    const invocation = JSON.parse(readFileSync(invocationPath, "utf8"));
    assertUntamperedArtifacts(invocation, outDir);
    emit({ ok: true, code: null, jobId: invocation.jobId, purchaseAuthority: false }, 0);
  }

  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
} catch (err) {
  const payload = asRefusePayload(err);
  if (args.out && cmd !== "invoke") {
    try {
      writeFileSync(resolve(String(args.out)), `${JSON.stringify(payload, null, 2)}\n`);
    } catch {
      /* still fail on stdout */
    }
  }
  emit(payload, err instanceof OfferRefuse ? 2 : 1);
}
