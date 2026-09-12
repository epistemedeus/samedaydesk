#!/usr/bin/env node
import { resolve } from "node:path";
import { SDS52_CALLER, DEFAULT_JOB_ID, KIT_ROOT } from "../lib/pins.mjs";
import { packJourney, readbackPacket, loadPacket } from "../lib/packet.mjs";
import { measureReturn } from "../lib/return-job.mjs";
import { createPacketServer, listenPacketServer } from "../lib/http.mjs";
import { refuseIntegerTermsVersion } from "../lib/terms.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `w5-d28 — journey release packet, readback, first return-job measurement

Local owner-QA kit over SDS52 paid useful-jobs CLI. Not a live deploy or sale.

Commands:
  pack --out-dir <dir> [--job vendor-budget-impact] [--before f] [--after f]
       [--funding reserved-fixture] [--payment file.json]
  readback --packet <dir>
  measure-return --packet <dir> [--before f] [--after f]
  status --packet <dir>
  serve --packet <dir> [--host 127.0.0.1] [--port 0]

Live return stays absent unless --evidence points at a valid evidence file.
No spend, payout, or production deploy from this command.
`;
}

function emit(body, ok) {
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exit(ok ? 0 : 2);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || args.help || args.h) {
  process.stdout.write(usage());
  process.exit(0);
}

if (args["terms-version"]) {
  const terms = refuseIntegerTermsVersion(args["terms-version"]);
  if (!terms.ok) emit(terms, false);
}

if (cmd === "pack") {
  const outDir = args["out-dir"] || args.packet;
  if (!outDir) {
    process.stderr.write("pack requires --out-dir\n");
    process.stdout.write(usage());
    process.exit(2);
  }
  const funding = args.funding || "reserved-fixture";
  const packed = packJourney({
    packetDir: resolve(String(outDir)),
    jobId: args.job || DEFAULT_JOB_ID,
    inputs: {
      before: args.before ? resolve(String(args.before)) : SDS52_CALLER.before,
      after: args.after ? resolve(String(args.after)) : SDS52_CALLER.after,
    },
    funding,
    payment: args.payment
      ? resolve(String(args.payment))
      : funding === "reserved-fixture"
        ? SDS52_CALLER.payment
        : null,
    evidencePath: args.evidence ? resolve(String(args.evidence)) : null,
    label: args.label || "owner-qa",
  });
  emit({ ok: packed.packet.ok, packetDir: packed.packetDir, packet: packed.packet }, packed.packet.ok);
}

if (cmd === "readback") {
  const packetDir = args.packet || args["out-dir"];
  if (!packetDir) {
    process.stderr.write("readback requires --packet\n");
    process.exit(2);
  }
  const rb = readbackPacket(resolve(String(packetDir)), {
    evidencePath: args.evidence ? resolve(String(args.evidence)) : null,
  });
  emit(rb, rb.ok);
}

if (cmd === "measure-return") {
  const packetDir = args.packet || args["out-dir"];
  if (!packetDir) {
    process.stderr.write("measure-return requires --packet\n");
    process.exit(2);
  }
  const after = args.after
    ? resolve(String(args.after))
    : resolve(KIT_ROOT, "fixtures/caller/vendor-budget-impact/after-nochange.json");
  const before = args.before ? resolve(String(args.before)) : SDS52_CALLER.before;
  const measured = measureReturn({
    packetDir: resolve(String(packetDir)),
    inputs: { before, after },
    funding: args.funding || "unfunded",
    payment: args.payment ? resolve(String(args.payment)) : null,
    evidencePath: args.evidence ? resolve(String(args.evidence)) : null,
    returnDir: args["return-dir"] ? resolve(String(args["return-dir"])) : undefined,
  });
  emit(
    {
      ok: measured.ok,
      code: measured.code || null,
      comparison: measured.comparison,
      field: measured.field,
      returnJob: measured.packet?.returnJob || null,
    },
    measured.ok && measured.comparison?.usefulSecondJob === true,
  );
}

if (cmd === "status") {
  const packetDir = args.packet || args["out-dir"];
  if (!packetDir) {
    process.stderr.write("status requires --packet\n");
    process.exit(2);
  }
  const loaded = loadPacket(resolve(String(packetDir)));
  if (!loaded.ok) emit(loaded, false);
  const rb = readbackPacket(resolve(String(packetDir)));
  emit(
    {
      ok: rb.ok,
      kit: loaded.packet.schema,
      tested: loaded.packet.tested,
      firstUseful: loaded.packet.firstJob?.usefulDelivery === true,
      returnSignal: loaded.packet.returnJob?.comparison?.returnSignal || "absent",
      usefulSecondJob: loaded.packet.returnJob?.comparison?.usefulSecondJob === true,
      liveReturn: loaded.packet.field?.liveReturn || "absent",
      deployed: loaded.packet.deploy?.deployed === true,
      sold: loaded.packet.settlement?.sold === true,
      archiveMatch: loaded.packet.engineArchive?.match === true,
      remainingBinding: loaded.packet.tested?.d01 || null,
    },
    rb.ok,
  );
}

if (cmd === "serve") {
  const packetDir = args.packet || args["out-dir"];
  if (!packetDir) {
    process.stderr.write("serve requires --packet\n");
    process.exit(2);
  }
  const { server } = createPacketServer({ packetDir: resolve(String(packetDir)) });
  const addr = await listenPacketServer(server, {
    host: args.host || "127.0.0.1",
    port: args.port ? Number(args.port) : 0,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, origin: addr.origin, kit: "samedaydesk.wave5.d28.journey-release.v1" }, null, 2)}\n`);
  await new Promise(() => {});
}

process.stderr.write(`unknown command ${cmd}\n`);
process.stdout.write(usage());
process.exit(2);
