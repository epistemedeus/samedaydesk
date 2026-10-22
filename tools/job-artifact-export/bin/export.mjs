#!/usr/bin/env node
import { runCli } from "../lib/cli.mjs";
import { ExportRefuse } from "../lib/refuse.mjs";

try {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.exit(result.exitCode);
} catch (err) {
  const refused = err instanceof ExportRefuse;
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      refused: refused || undefined,
      code: refused ? err.code : "internal-error",
      error: err.message,
      detail: refused ? err.detail : undefined,
    })}\n`,
  );
  process.exit(refused ? err.exitCode : 1);
}
