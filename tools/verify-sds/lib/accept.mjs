import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { SEEDED_DEFAULT, SEEDED_IDS } from "./pins.mjs";
import { envelope, failError } from "./envelope.mjs";
import { packRoot } from "./repo.mjs";
import { classifyStale, loadReceiptObject, staleError } from "./stale.mjs";

export function seededFixturePath(id = SEEDED_DEFAULT) {
  return join(packRoot(), "fixtures/seeded", `${id}.json`);
}

export function readReceiptFile(path) {
  const raw = readFileSync(path, "utf8");
  return loadReceiptObject(JSON.parse(raw));
}

export function runAccept(parsed, ctx) {
  const { root, dryRun = false, clock } = ctx;
  const seededId = parsed.seededId;
  let path = parsed.flags.output || parsed.flags.fixture || parsed.flags.out || parsed.tokens[0];
  if (parsed.seededFailure) {
    const id = SEEDED_IDS.includes(seededId) ? seededId : SEEDED_DEFAULT;
    path = seededFixturePath(id);
  }
  if (!path) {
    return envelope({
      ok: false,
      command: "accept",
      status: "usage",
      error: failError("USAGE", "accept requires --output <receipt.json> or --seeded-failure"),
    });
  }
  const resolved = isAbsolute(path) ? path : join(root, path);
  const evidence = [{ kind: "receipt-path", path: resolved, seeded: Boolean(parsed.seededFailure) }];

  if (dryRun) {
    return envelope({
      ok: true,
      command: "accept",
      dryRun: true,
      evidence,
      result: { would: ["load receipt", "recompute input digest", "reject if stale"] },
    });
  }

  if (!existsSync(resolved)) {
    return envelope({
      ok: false,
      command: "accept",
      evidence,
      error: failError("USAGE", `receipt not found: ${path}`),
    });
  }

  let receipt;
  try {
    receipt = readReceiptFile(resolved);
  } catch (error) {
    return envelope({
      ok: false,
      command: "accept",
      evidence,
      error: failError("STALE_OUTPUT", `stale_output: receipt is not current (reasons: invalid_receipt)`, {
        parseError: error instanceof Error ? error.message : String(error),
      }),
    });
  }

  const classified = classifyStale(receipt, {
    root,
    now: clock || parsed.flags.clock,
    horizonHours: parsed.flags.horizonHours,
  });
  evidence.push({ kind: "stale", reasons: classified.reasons, jobId: receipt?.jobId ?? null });

  if (classified.stale) {
    return envelope({
      ok: false,
      command: "accept",
      job: receipt?.jobId ?? null,
      evidence,
      error: staleError(classified),
      result: { receipt, stale: true, reasons: classified.reasons },
    });
  }

  return envelope({
    ok: true,
    command: "accept",
    job: receipt.jobId,
    evidence,
    result: { receipt, stale: false, reasons: [] },
  });
}
