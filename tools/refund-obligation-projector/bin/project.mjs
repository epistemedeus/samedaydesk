#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createAdapters } from "../lib/adapters.mjs";
import { createProjectionServer } from "../lib/http.mjs";
import { asRevenue, loadSettlementRecords, projectDossier, projectRecords } from "../lib/project.mjs";
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
        policy: { type: "string" },
        ledger: { type: "string" },
        receipt: { type: "string" },
        "operation-id": { type: "string" },
        "execute-refund": { type: "boolean", default: false },
        "sum-as-revenue": { type: "boolean", default: false },
        "post-paid": { type: "boolean", default: false },
        "attach-cited-banked": { type: "boolean", default: false },
        "terms-version": { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (error) {
    refuse("invalid_cli", error instanceof Error ? error.message : String(error));
  }
}

function loadJsonFile(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    refuse(code, error instanceof Error ? error.message : String(error));
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
  if (values["attach-cited-banked"]) adapters.citedBanked.attach();

  const termsCheck = adapters.terms.assertKind(values["terms-version"] ?? null);
  if (!termsCheck.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: termsCheck.code, message: termsCheck.message })}\n`);
    return 1;
  }

  const options = {
    evidenceKind: "fixture",
    termsVersion: values["terms-version"],
    policy: values.policy ? loadJsonFile(values.policy, "invalid_refund_policy") : null,
    ledger: values.ledger ? loadJsonFile(values.ledger, "d13_ledger_schema") : null,
    receipt: values.receipt ? loadJsonFile(values.receipt, "invalid_pr52_receipt") : null,
  };

  const loaded = loadSettlementRecords(values.dir, adapters);
  const records = loaded.map((item) => item.record);
  const report = values["operation-id"]
    ? projectDossier(values["operation-id"], records, adapters, options)
    : projectRecords(records, adapters, options);
  const indent = values.pretty ? 2 : 0;

  if (values.listen) {
    if (!report.ok) {
      process.stdout.write(`${JSON.stringify({ ok: false, code: report.code, rejected: report.rejected }, null, indent)}\n`);
      return 1;
    }
    const listening = await createProjectionServer({
      host: values.host,
      port: values.port ? Number(values.port) : 0,
      project: ({ operationId } = {}) => {
        const liveOptions = { ...options, evidenceKind: "local_runtime" };
        if (operationId) return projectDossier(operationId, records, adapters, liveOptions);
        return projectRecords(records, adapters, liveOptions);
      },
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
    process.stdout.write(`${JSON.stringify({ ok: false, code: report.code, rejected: report.rejected }, null, indent)}\n`);
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
  return `Project refund claims from an explicit policy and actual job facts.

Read-only. Never calls Stripe refunds. Never posts obligations as paid.
Operational delivery errors do not invent refund policy.
8.105 USDC is not attached to a job dossier.

Usage:
  node tools/refund-obligation-projector/bin/project.mjs
  node tools/refund-obligation-projector/bin/project.mjs --pretty --out projection.json
  node tools/refund-obligation-projector/bin/project.mjs --policy fixtures/policy/agent402-not-offered.json
  node tools/refund-obligation-projector/bin/project.mjs --operation-id agent402-external-validation-purchase-2026-08-29
  node tools/refund-obligation-projector/bin/project.mjs --listen --host 127.0.0.1 --port 0

Refused:
  --execute-refund
  --sum-as-revenue
  --post-paid
  --attach-cited-banked
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
