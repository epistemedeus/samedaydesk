#!/usr/bin/env node
import { runCli } from "../lib/cli.mjs";
import { ExportRefuse, mapMailboxRefuse } from "../lib/refuse.mjs";

try {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.exit(result.exitCode);
} catch (err) {
  const mapped = mapMailboxRefuse(err);
  const refused = mapped instanceof ExportRefuse;
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      refused: refused || undefined,
      code: refused ? mapped.code : "internal-error",
      error: mapped.message,
      detail: refused ? mapped.detail : undefined,
    })}\n`,
  );
  process.exit(refused ? mapped.exitCode : 1);
}
