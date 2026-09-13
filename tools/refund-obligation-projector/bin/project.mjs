#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createAdapters } from "../lib/adapters.mjs";
import { createProjectionServer } from "../lib/http.mjs";
import { asRevenue, projectDir } from "../lib/project.mjs";
import { isRefusal, refuse, refusalPayload } from "../lib/refuse.mjs";

function isMain() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseCli(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        dir: { type: "string" },
        out: { type: "string" },
        pretty: { type: "boolean", default: false },
        listen: { type: "boolean", default: false },
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "string" },
        "execute-refund": { type: "boolean", default: false },
        "sum-as-revenue": { type: "boolean", default: false },
        "post-paid": { type: "boolean", default: false },
        "terms-version": { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (error) {
    refuse("invalid_cli", error instanceof Error ? error.message : String(error));
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseCli(argv);

  if (values.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const adapters = createAdapters();
  if (values["execute-refund"]) adapters.stripe.executeRefund();
  if (values["post-paid"]) adapters.obligations.postPaid();
  if (values["sum-as-revenue"]) asRevenue(null);

  const termsCheck = adapters.terms.assertKind(values["terms-version"] ?? null);
  if (!termsCheck.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: termsCheck.code, message: termsCheck.message })}\n`);
    return 1;
  }

  const report = projectDir(values.dir, adapters, {
    evidenceKind: "fixture",
    termsVersion: values["terms-version"],
  });
  const indent = values.pretty ? 2 : 0;

  if (values.listen) {
    if (!report.ok) {
      process.stdout.write(`${JSON.stringify({ ok: false, rejected: report.rejected }, null, indent)}\n`);
      return 1;
    }
    const listening = await createProjectionServer({
      host: values.host,
      port: values.port ? Number(values.port) : 0,
      project: () => ({
        ok: true,
        projection: { ...report.projection, evidenceKind: "local_runtime" },
      }),
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, url: listening.url, projection: report.projection }, null, indent)}\n`,
    );
    await new Promise((resolve) => {
      const stop = () => {
        listening.close().finally(resolve);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    return 0;
  }

  if (!report.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, rejected: report.rejected }, null, indent)}\n`);
    return 1;
  }

  const body = `${JSON.stringify({ ok: true, projection: report.projection }, null, indent)}\n`;
  if (values.out) {
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, body);
  }
  process.stdout.write(body);
  return 0;
}

function usage() {
  return `Project payable vs unknown vs not-refundable from evidence-record settlement fixtures.

Read-only. Never calls Stripe refunds. Never posts obligations as paid.
8.105 USDC is historical, not spendable. Do not sum buyerClass as revenue.

Usage:
  node tools/refund-obligation-projector/bin/project.mjs
  node tools/refund-obligation-projector/bin/project.mjs --pretty --out projection.json
  node tools/refund-obligation-projector/bin/project.mjs --listen --host 127.0.0.1 --port 0

Refused:
  --execute-refund
  --sum-as-revenue
  --post-paid
  --terms-version <integer>
`;
}

if (isMain()) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stdout.write(`${JSON.stringify(refusalPayload(error))}\n`);
      process.exit(isRefusal(error) ? 1 : 2);
    },
  );
}
