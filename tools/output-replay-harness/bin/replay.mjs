#!/usr/bin/env node
import { ReplayRefuse, replayFromArgv, usage } from "../lib/replay.mjs";

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

try {
  const result = replayFromArgv(process.argv.slice(2));
  if (result.help) {
    process.stdout.write(result.usage);
    process.exit(0);
  }
  emit(result, 0);
} catch (err) {
  if (err instanceof ReplayRefuse) {
    emit(
      {
        ok: false,
        refused: true,
        code: err.code,
        error: err.message,
        detail: err.detail,
        identityVerified: false,
        purchaseAuthority: false,
      },
      err.exitCode,
    );
  }
  emit(
    {
      ok: false,
      refused: true,
      code: "internal-error",
      error: String(err?.message || err),
      identityVerified: false,
      purchaseAuthority: false,
    },
    1,
  );
}
