import { packDossier, packFromPaths } from "./pack.mjs";
import { ERROR_CODES, REPO_ROOT, SOURCE_KINDS } from "./pins.mjs";
import { honestyEnvelope } from "./honesty.mjs";
import { loadJsonFile, resolveInputPath } from "./json.mjs";
import { runPinChecks } from "./source-status.mjs";

export function usage() {
  return `Failed-delivery evidence dossier (read-only).

Packs labelled evidence from F08 wrapper receipts, checkout intake_required
verify bodies, and extract unpaid-stop fixtures. Never refunds, never retries
payment, never calls Stripe, never sends PAYMENT-SIGNATURE.

node tools/failed-delivery-dossier/bin/dossier.mjs pack \\
  --wrapper-receipt fixtures/wrapper-receipt/rejected-sample-not-a-sale.json \\
  --checkout-intake fixtures/checkout-intake/fulfillment-pending-verify.json \\
  --extract-unpaid fixtures/extract-unpaid/agent402-stop.json

node tools/failed-delivery-dossier/bin/dossier.mjs --verify-pins
node tools/failed-delivery-dossier/bin/dossier.mjs --refund   # refused, exit 2
`;
}

export function parseArgs(argv) {
  const out = { command: null, flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--refund") out.flags.refund = true;
    else if (arg === "--retry-payment") out.flags.retryPayment = true;
    else if (arg === "--send-payment-signature" || arg === "--payment-signature") out.flags.paymentSignature = true;
    else if (arg === "--stripe" || arg === "--call-stripe") out.flags.stripe = true;
    else if (arg === "--as-revenue") out.flags.asRevenue = true;
    else if (arg === "--verify-pins") out.flags.verifyPins = true;
    else if (arg === "--wrapper-receipt") out.wrapperReceipt = argv[++i];
    else if (arg === "--checkout-intake") out.checkoutIntake = argv[++i];
    else if (arg === "--extract-unpaid") out.extractUnpaid = argv[++i];
    else if (arg === "--action") out.action = argv[++i];
    else if (arg === "--revenue-total") out.revenueTotalPath = argv[++i];
    else if (!arg.startsWith("--") && !out.command) out.command = arg;
    else if (arg.startsWith("--")) out.unknown = arg;
  }
  return out;
}

function printJson(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return code;
}

export async function runCli(argv, { cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (args.unknown) {
    return printJson(
      {
        ok: false,
        code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
        message: `unknown option ${args.unknown}`,
        sold: false,
        honesty: honestyEnvelope(),
      },
      2,
    );
  }

  if (args.flags.refund || args.action === "refund") {
    return printJson(packDossier({ action: "refund" }, { flags: { refund: true } }), 2);
  }
  if (args.flags.retryPayment) {
    return printJson(packDossier({ action: "retry-payment" }, { flags: { retryPayment: true } }), 2);
  }
  if (args.flags.paymentSignature) {
    return printJson(packDossier({ action: "send-payment-signature" }, { flags: { paymentSignature: true } }), 2);
  }
  if (args.flags.stripe) {
    return printJson(packDossier({ action: "call-stripe" }, { flags: { stripe: true } }), 2);
  }
  if (args.flags.asRevenue) {
    return printJson(packDossier({ asRevenue: true }, { flags: { asRevenue: true } }), 2);
  }

  const pinChecks = args.flags.verifyPins ? runPinChecks({ repoRoot: REPO_ROOT }) : null;
  if (args.flags.verifyPins && !args.wrapperReceipt && !args.checkoutIntake && !args.extractUnpaid && !args.command) {
    const payload = {
      ok: pinChecks.every((check) => check.status !== "unrun" && check.pass === true),
      sold: false,
      honesty: honestyEnvelope({
        checks: pinChecks,
        sourceStatus: {
          f08Capture: {
            sha: pinChecks[0]?.sha || null,
            status: pinChecks[0]?.pass ? "verified" : pinChecks[0]?.status,
            evidence: pinChecks[0]?.got ? { gitHead: pinChecks[0].got } : null,
          },
          sds52: {
            sha: pinChecks[1]?.sha || null,
            status: pinChecks[1]?.pass ? "verified" : pinChecks[1]?.status,
            evidence: pinChecks[1]?.got ? { gitHead: pinChecks[1].got } : null,
          },
        },
      }),
      pinChecks,
    };
    const incomplete = pinChecks.some((check) => check.status === "unrun" || check.pass !== true);
    return printJson(payload, incomplete ? 2 : 0);
  }
  if (args.revenueTotalPath) {
    const loaded = loadJsonFile(resolveInputPath(args.revenueTotalPath, cwd));
    if (!loaded.ok) return printJson(loaded.result, 2);
    return printJson(packDossier(loaded.value, { flags: args.flags }), 2);
  }

  const command = args.command || (args.wrapperReceipt || args.checkoutIntake || args.extractUnpaid ? "pack" : null);
  if (!command) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  if (command !== "pack") {
    return printJson(
      {
        ok: false,
        code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
        message: "command must be pack (refund/retry/signature/stripe are refused)",
        sold: false,
        honesty: honestyEnvelope(),
      },
      2,
    );
  }

  const spec = {
    "wrapper-receipt": args.wrapperReceipt,
    "checkout-intake": args.checkoutIntake,
    "extract-unpaid": args.extractUnpaid,
  };
  if (!SOURCE_KINDS.some((kind) => spec[kind])) {
    return printJson(
      packDossier({ items: [] }),
      2,
    );
  }
  const result = await packFromPaths(spec, {
    cwd,
    flags: args.flags,
    ...(pinChecks ? { pinChecks } : {}),
  });
  return printJson(result, result.ok ? 0 : 2);
}
