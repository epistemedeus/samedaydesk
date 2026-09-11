import path from "node:path";
import { refuse } from "./refuse.mjs";
import { parseFileSha256, readBoundedFile } from "./digest.mjs";
import { SUPPORTED_FAMILIES } from "./pins.mjs";
import { isLiveRecurrence, isSampleLabelled } from "./ticket.mjs";

const SLOTS = ["before", "after", "used"];

const CRON_FLAGS = [
  "install-cron",
  "cron",
  "crontab",
  "daemonize",
  "scheduler-daemon",
  "install-daemon",
];

export function refuseCron(args) {
  for (const flag of CRON_FLAGS) {
    if (args[flag]) {
      throw refuse("cron-install-refused", "Never cron install; this binder is not a scheduler daemon", {
        flag,
      });
    }
  }
}

export function refuseLiveSample(args, ticket) {
  const live = isLiveRecurrence(args, ticket.raw) || Boolean(args["live-recurrence"]);
  const sample = ticket.sampleLabelled || isSampleLabelled(ticket.raw, ticket.path);
  if (live && sample) {
    throw refuse(
      "sample-labelled-as-live-recurrence",
      "SAMPLE-labelled ticket cannot be claimed as live recurrence",
      { ticket: ticket.path },
    );
  }
}

function resolvePath(p, { ticketDir, inputRoot }) {
  if (p == null || p === true || p === "") return null;
  if (path.isAbsolute(p)) return path.normalize(p);
  if (inputRoot) return path.resolve(inputRoot, p);
  if (ticketDir) return path.resolve(ticketDir, p);
  return path.resolve(p);
}

export function resolveInputs(args, ticket) {
  const inputRoot = args["input-root"] ? path.resolve(String(args["input-root"])) : null;
  const ticketDir = ticket.dir;
  const resolved = {};
  for (const slot of SLOTS) {
    const cli = args[slot];
    const fromTicket = ticket.inputPaths?.[slot] || ticket.declared?.[slot]?.path || null;
    resolved[slot] = resolvePath(cli || fromTicket, { ticketDir, inputRoot });
  }
  return { ...resolved, inputRoot };
}

export function mergeDeclared(args, ticket) {
  const out = {};
  for (const slot of SLOTS) {
    const cliSha = parseFileSha256(args[`declare-${slot}-sha256`], {
      label: `declare-${slot}-sha256`,
    });
    const cliBytes = args[`declare-${slot}-bytes`];
    const fromTicket = ticket.declared?.[slot] || null;
    const sha256 = cliSha || fromTicket?.sha256 || null;
    const bytes =
      cliBytes != null && cliBytes !== true
        ? Number(cliBytes)
        : fromTicket?.bytes ?? null;
    out[slot] = sha256 || bytes != null ? { sha256, bytes, path: fromTicket?.path || null } : null;
  }
  return out;
}

export function verifyInputs(inputs, declared, { family } = {}) {
  const spec = SUPPORTED_FAMILIES[family];
  const required = spec?.requiredSlots || ["before", "after"];
  const verifiedInputs = {};
  const mismatches = [];
  const missing = [];
  let mismatchCount = 0;
  let missingCount = 0;
  let presentCount = 0;
  let declaredCount = 0;

  for (const slot of SLOTS) {
    const dec = declared[slot];
    const abs = inputs[slot];
    if (!dec && !required.includes(slot)) {
      verifiedInputs[slot] = null;
      continue;
    }
    if (required.includes(slot) || dec) declaredCount += 1;

    if (!abs) {
      missingCount += 1;
      missing.push({ slot, path: dec?.path ?? null });
      verifiedInputs[slot] = { declared: dec, state: "missing", actual: null };
      continue;
    }

    const actual = readBoundedFile(abs);
    if (actual.missing) {
      missingCount += 1;
      missing.push({ slot, path: dec?.path ?? abs, resolved: abs });
      verifiedInputs[slot] = { declared: dec, state: "missing", actual: null, resolvedPath: abs };
      continue;
    }

    presentCount += 1;
    const expectedSha = dec?.sha256 || null;
    const expectedBytes = dec?.bytes;
    const bytesMatch = expectedBytes == null || Number(expectedBytes) === actual.bytes;
    const hashMatch = !expectedSha || expectedSha === actual.sha256;
    if (!bytesMatch || !hashMatch) {
      mismatchCount += 1;
      mismatches.push({
        slot,
        path: dec?.path ?? abs,
        resolved: abs,
        declaredBytes: expectedBytes ?? null,
        actualBytes: actual.bytes,
        declaredSha256: expectedSha,
        actualSha256: actual.sha256,
      });
      verifiedInputs[slot] = {
        declared: dec,
        state: "mismatch",
        actual: { path: abs, bytes: actual.bytes, sha256: actual.sha256 },
      };
    } else {
      verifiedInputs[slot] = {
        declared: dec,
        state: "verified",
        actual: { path: abs, bytes: actual.bytes, sha256: actual.sha256 },
      };
    }
  }

  let state;
  if (mismatchCount > 0) state = "mismatch";
  else if (missingCount > 0 && presentCount === 0) state = "unverified-missing-files";
  else if (missingCount > 0) state = "partial-missing-files";
  else state = "verified";

  return {
    state,
    declaredCount,
    presentCount,
    missingCount,
    mismatchCount,
    mismatches,
    missing,
    verifiedInputs,
  };
}
