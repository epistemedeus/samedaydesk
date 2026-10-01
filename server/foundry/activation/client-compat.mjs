#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { factsFrom } from "./classify.mjs";
import { clientSurfaces, judgeClient, judgePublicClient } from "./client-contract.mjs";
import { redact } from "./local-journey.mjs";
import { observeOrigin } from "./observe.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

function emit(result) {
  process.stdout.write(`${JSON.stringify({ ...result, productionActivate: "HOLD" })}\n`);
  process.exit(result.exitCode ?? (result.ok ? 0 : 1));
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    const fixture = argument("--fixture");
    const origin = argument("--origin");
    if (fixture && origin) emit({ ok: false, exitCode: 2, code: "false_green_rejected", reason: "fixture_and_origin", productionReady: false });
    if (!fixture && !origin) emit({ ok: false, exitCode: 2, code: "false_green_rejected", reason: "observation_missing", productionReady: false });
    if (fixture) emit(judgeClient(JSON.parse(await readFile(fixture, "utf8"))));
    const observation = await observeOrigin(origin);
    const host = new URL(origin).hostname;
    if (host === "samedaydesk.com" || host === "www.samedaydesk.com") emit(judgePublicClient(observation));
    const surfaces = clientSurfaces(observation);
    if (!surfaces.ok) {
      emit({
        ok: false,
        exitCode: 1,
        code: "client_contract_unmet",
        reasons: surfaces.reasons,
        productionReady: false,
        launchedService: false,
      });
    }
    emit({
      ok: true,
      exitCode: 0,
      code: "client_surfaces_ok",
      productionReady: false,
      launchedService: false,
      panelEnvRead: false,
      toolsCalled: false,
      facts: factsFrom(observation),
      surfaces: surfaces.stamp,
    });
  } catch (error) {
    emit({
      ok: false,
      exitCode: 1,
      code: "client_probe_failed",
      productionReady: false,
      launchedService: false,
      detail: redact(error instanceof Error ? error.message : error),
    });
  }
}
