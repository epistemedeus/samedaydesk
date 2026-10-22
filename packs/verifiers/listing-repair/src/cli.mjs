import { loadJson, parseArgs, resolveInputPath } from "./load.mjs";
import { verifyListingRepair } from "./verify.mjs";

export const USAGE = `Usage:
  node bin/listing-repair-verifier.mjs verify --packet <repair-packet.json> --source <listing-or-source.json> [--bind <bind.json>]

Offline oracle bound to SameDayDesk listing-repair-packet outputs (useful-jobs 1.4.7).
Judges owner-repair actions[] + source digest. Does not invent 1.0.0 corrections[].
Never publishes. Never emits actual_completion. purchaseAuthority: false.
Does not republish the 1.4.7 kit.
`;

function flagsFromArgs(args) {
  return {
    publish: args.publish === true,
    live: args.live === true,
    writeSds: args["write-sds"] === true || args.writeSds === true,
    deploy: args.deploy === true,
    sourcePath: typeof args.source === "string" ? args.source : null,
    liveSourceUrl:
      typeof args.source === "string" && /^https?:\/\//i.test(args.source) ? args.source : null,
  };
}

export function runVerify(args, { cwd = process.cwd() } = {}) {
  const packetPath = args.packet;
  if (typeof packetPath !== "string" || !packetPath.trim()) {
    const err = new Error("missing --packet");
    err.code = "usage";
    err.exitCode = 2;
    throw err;
  }

  const flags = flagsFromArgs(args);
  let packet;
  try {
    packet = loadJson(resolveInputPath(packetPath, cwd));
  } catch (e) {
    const err = new Error(`cannot read --packet: ${e.message}`);
    err.code = "packet_unreadable";
    err.exitCode = 2;
    throw err;
  }

  let source = null;
  if (typeof args.source === "string" && args.source.trim()) {
    if (/^https?:\/\//i.test(args.source)) {
      source = null;
      flags.liveSourceUrl = args.source;
    } else {
      try {
        source = loadJson(resolveInputPath(args.source, cwd));
      } catch (e) {
        const err = new Error(`cannot read --source: ${e.message}`);
        err.code = "source_unreadable";
        err.exitCode = 2;
        throw err;
      }
    }
  }

  let bind = null;
  if (typeof args.bind === "string" && args.bind.trim()) {
    try {
      bind = loadJson(resolveInputPath(args.bind, cwd));
    } catch (e) {
      const err = new Error(`cannot read --bind: ${e.message}`);
      err.code = "bind_unreadable";
      err.exitCode = 2;
      throw err;
    }
  }

  return verifyListingRepair({ packet, source, bind, flags });
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === "help" || args.help === true || cmd == null) {
    stdout.write(USAGE);
    return 0;
  }
  if (cmd !== "verify") {
    stdout.write(USAGE);
    return 2;
  }
  try {
    const verdict = runVerify(args, { cwd });
    stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
    return verdict.ok ? 0 : 1;
  } catch (err) {
    if (err.exitCode === 2) {
      stdout.write(
        `${JSON.stringify({ ok: false, reasons: ["usage"], error: err.message, purchaseAuthority: false }, null, 2)}\n`,
      );
      return 2;
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: process.stdout,
  });
}
