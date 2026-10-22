import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { failBody, MailboxError } from "./errors.mjs";
import { pickup } from "./pickup.mjs";
import { seedBySpawningEngine, seedFromOutDir } from "./seed.mjs";
import { parseClock } from "./expiry.mjs";
import { DEFAULT_TTL_SECONDS } from "./pins.mjs";

function usage() {
  return `result-mailbox — pickup completed useful-job artifacts (non-settling prototype)

Commands:
  seed   Write an envelope from a useful-jobs out-dir (or spawn the PR51 engine)
  pickup Copy artifacts by requestId, verify sha256, label expiry, write pickup.json

Examples:
  node tools/result-mailbox/bin/mailbox.mjs seed \\
    --mailbox /tmp/mailbox --request-id req-1 --job-id vendor-budget-impact \\
    --from-out-dir /tmp/engine-out --clock 2026-09-11T20:00:00Z --expires-at 2026-09-12T20:00:00Z

  node tools/result-mailbox/bin/mailbox.mjs pickup \\
    --mailbox /tmp/mailbox --request-id req-1 --out /tmp/pickup --clock 2026-09-11T20:00:00Z

SAMPLE envelopes cannot be labelled delivered-to-buyer. Expiry is a timestamp
comparison against --clock, not a daemon. Payments are non-settling prototypes.
`;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--example") out.example = true;
    else if (a === "--delivered" || a === "--as-delivered") out.delivered = true;
    else if (a.startsWith("--")) {
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

function requireValue(args, key, message) {
  const value = args[key];
  if (value == null || value === true || value === "") {
    throw new MailboxError("missing-option", message);
  }
  return String(value);
}

export function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (args.help || !cmd || cmd === "help") {
    stdout.write(`${usage()}\n`);
    return { exitCode: args.help || cmd === "help" ? 0 : 2, body: null };
  }

  try {
    if (cmd === "seed") {
      const mailbox = resolve(requireValue(args, "mailbox", "seed requires --mailbox"));
      const requestId = requireValue(args, "request-id", "seed requires --request-id");
      const jobId = requireValue(args, "job-id", "seed requires --job-id");
      const clock = requireValue(args, "clock", "seed requires --clock (ISO UTC)");
      parseClock(clock, "clock");
      const ttl = args["ttl-seconds"] ? Number(args["ttl-seconds"]) : DEFAULT_TTL_SECONDS;
      const expiresAt = args["expires-at"] ? String(args["expires-at"]) : undefined;
      mkdirSync(mailbox, { recursive: true });

      let body;
      if (args["from-out-dir"]) {
        body = seedFromOutDir({
          mailbox,
          requestId,
          jobId,
          outDir: resolve(String(args["from-out-dir"])),
          clock,
          expiresAt,
          ttlSeconds: ttl,
          sample: args.example === true || args.sample === true,
        });
      } else {
        const files = {};
        for (const key of ["before", "after", "used", "input", "next-run", "input-root"]) {
          if (args[key]) files[key] = resolve(String(args[key]));
        }
        const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : undefined;
        body = seedBySpawningEngine({
          mailbox,
          requestId,
          jobId,
          files,
          example: args.example === true,
          outDir,
          clock,
          expiresAt,
          ttlSeconds: ttl,
        });
      }
      stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return { exitCode: 0, body };
    }

    if (cmd === "pickup") {
      const mailbox = resolve(requireValue(args, "mailbox", "pickup requires --mailbox"));
      const requestId = requireValue(args, "request-id", "pickup requires --request-id");
      const outDir = resolve(requireValue(args, "out", "pickup requires --out"));
      const clock = requireValue(args, "clock", "pickup requires --clock (ISO UTC)");
      parseClock(clock, "clock");
      const body = pickup({
        mailbox,
        requestId,
        outDir,
        clock,
        asDelivered: args.delivered === true,
      });
      stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return { exitCode: body.ok ? 0 : 2, body };
    }

    throw new MailboxError("unknown-command", `unknown command ${cmd}`);
  } catch (err) {
    const body = failBody(err);
    stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    if (err instanceof MailboxError && err.code === "unknown-command") {
      stderr.write(`${usage()}\n`);
    }
    return { exitCode: err instanceof MailboxError ? err.exitCode : 2, body };
  }
}
