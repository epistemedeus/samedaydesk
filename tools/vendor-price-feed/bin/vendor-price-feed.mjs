#!/usr/bin/env node
import { runCli } from "../lib/cli.mjs";
import { FeedRefuse } from "../lib/refuse.mjs";

try {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 2);
} catch (err) {
  const body =
    err instanceof FeedRefuse
      ? err.toJSON()
      : {
          ok: false,
          refused: true,
          code: "error",
          error: err.message,
          purchaseAuthority: false,
          purchaseAuthorized: false,
          liveCatalogWritten: false,
        };
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exit(2);
}
