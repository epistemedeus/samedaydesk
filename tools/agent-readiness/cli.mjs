#!/usr/bin/env node
// CI entry for the agent-readiness conformance checker.
// Default path is offline. --live reads the four public hosts and does not pay.

import { pathToFileURL } from "node:url";
import { compareBaseline, loadBaseline, scoreAll, seededRejection } from "./baseline.mjs";
import { KNOWN_HOST_IDS } from "./captures.mjs";
import { probeKnownHosts } from "./probe.mjs";
import { scoreCapture } from "./score.mjs";

function usage() {
  return [
    "SameDayDesk agent-readiness conformance",
    "",
    "  node tools/agent-readiness/cli.mjs --baseline",
    "  node tools/agent-readiness/cli.mjs --coverage",
    "  node tools/agent-readiness/cli.mjs --seeded-failure held-out-seed",
    "  node tools/agent-readiness/cli.mjs --seeded-failure malformed-discovery",
    "  node tools/agent-readiness/cli.mjs --seeded-failure malformed-handshake",
    "  node tools/agent-readiness/cli.mjs --seeded-failure identity-conflict",
    "  node tools/agent-readiness/cli.mjs --live",
    "",
    "Exit 0: baseline matches the 2026-09-24 structural pin.",
    "Exit 1: a seeded host was rejected, or the baseline drifted.",
    "Seeded failures are supposed to exit 1. Their JSON sets rejected true.",
    "No payment, no Hostinger action, no secret material.",
  ].join("\n");
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stderr.write(`${usage()}\n`);
    return argv.includes("--help") || argv.includes("-h") ? 0 : 2;
  }
  if (argv.includes("--baseline")) {
    const compared = compareBaseline();
    emit({
      ok: compared.ok,
      command: "baseline",
      auditDate: "2026-09-24",
      paid: false,
      coverageRows: compared.view.coverageRows,
      heldOutDiffers: compared.view.heldOutDiffers,
      known: compared.view.known,
      seeded: compared.view.seeded,
      mismatches: compared.mismatches,
    });
    return compared.ok ? 0 : 1;
  }
  if (argv.includes("--coverage")) {
    const reports = scoreAll();
    const compared = compareBaseline(reports);
    emit({
      ok: compared.view.coverageRows === 136,
      command: "coverage",
      coverageRows: compared.view.coverageRows,
      families: compared.view.families,
      paid: false,
    });
    return compared.view.coverageRows === 136 ? 0 : 1;
  }
  const seededAt = argv.indexOf("--seeded-failure");
  if (seededAt !== -1) {
    const id = argv[seededAt + 1];
    if (!id) {
      emit({ ok: false, command: "seeded-failure", error: "missing fixture id", paid: false });
      return 2;
    }
    let report;
    try {
      report = seededRejection(id);
    } catch (error) {
      emit({ ok: false, command: "seeded-failure", error: error.message, paid: false });
      return 2;
    }
    const rejected = report.verdict === "reject" && report.failClosed.length > 0;
    emit({
      ok: false,
      command: "seeded-failure",
      rejected,
      hostId: report.hostId,
      score: report.score,
      grade: report.grade,
      verdict: report.verdict,
      failClosed: report.failClosed,
      paid: false,
    });
    return 1;
  }
  if (argv.includes("--live")) {
    const probed = await probeKnownHosts();
    const pin = loadBaseline();
    const knownPin = new Map(pin.known.map((host) => [host.hostId, host]));
    const hosts = probed.map((item) => {
      if (!item.capture) {
        return { hostId: item.id, origin: item.origin, score: null, verdict: "incomplete", failClosed: [], pinnedScore: null, pinnedVerdict: null, scoreDelta: null, errors: item.errors };
      }
      const report = scoreCapture({ ...item.capture, id: item.id, role: item.role, label: item.label, origin: item.origin });
      const expected = knownPin.get(item.id);
      return {
        hostId: item.id,
        origin: item.origin,
        score: report.score,
        verdict: report.verdict,
        failClosed: report.failClosed,
        pinnedScore: expected?.score ?? null,
        pinnedVerdict: expected?.verdict ?? null,
        scoreDelta: expected ? report.score - expected.score : null,
        errors: item.errors,
      };
    });
    emit({
      ok: hosts.every((host) => host.errors.length === 0),
      command: "live",
      auditDate: "2026-09-24",
      hosts: KNOWN_HOST_IDS.map((id) => hosts.find((host) => host.hostId === id)),
      paid: false,
      note: "Live structural score against the pinned baseline. Catalog cardinality is not a failure.",
    });
    return hosts.every((host) => host.errors.length === 0) ? 0 : 1;
  }
  process.stderr.write(`${usage()}\n`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
