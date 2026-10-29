import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_CODES,
  FORBIDDEN_FLAGS,
  LIVE_ROUTES,
  PACK_DIR,
  PACK_ID,
  PIN_SCHEMA,
  RESULT_SCHEMA,
  SDS_REPO,
} from "./constants.mjs";
import { honestyEnvelope, liveRouteRecords } from "./honesty.mjs";
import { loadJson, looksLikeUrl, parseArgs, resolveInputPath } from "./load.mjs";
import { verifyDocuments } from "./verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(HERE, "..");

export function usage() {
  return `price-drift — SDS live x402 price-drift verifier

Records extract $0.005 and seller-integrity-audit $0.01. Never rewrites them.
Cold fixture run only. No neo, publish, payment, or checkout.

Commands:
  verify --pin <json> --observation <json>
  doctor
  status
  help

Literal cold run:
  node bin/price-drift.mjs verify --pin fixtures/pin.json --observation fixtures/ok-observation.json

Seeded failure:
  node bin/price-drift.mjs verify --pin fixtures/pin.json --observation fixtures/reject/extract-amount-drift.json
`;
}

export function statusPayload() {
  return {
    ok: true,
    pack: PACK_ID,
    directory: PACK_DIR,
    repo: SDS_REPO,
    schema: PIN_SCHEMA,
    resultSchema: RESULT_SCHEMA,
    liveSdsRoutePrices: liveRouteRecords(),
    extract: LIVE_ROUTES.extract,
    sellerIntegrityAudit: LIVE_ROUTES["seller-integrity-audit"],
    honesty: honestyEnvelope(),
    node: process.version,
    cold: true,
  };
}

export function doctorPayload() {
  try {
    const pin = loadJson(resolveInputPath("fixtures/pin.json", PACK_ROOT));
    const observation = loadJson(resolveInputPath("fixtures/ok-observation.json", PACK_ROOT));
    const verdict = verifyDocuments({
      pin,
      observation,
      paths: { pin: "fixtures/pin.json", observation: "fixtures/ok-observation.json" },
    });
    return {
      ok: verdict.ok === true,
      command: "doctor",
      node: process.version,
      fixturesReadable: true,
      network: false,
      honesty: honestyEnvelope(),
      verify: verdict,
    };
  } catch (err) {
    const code =
      err.code && Object.values(ERROR_CODES).includes(err.code) ? err.code : ERROR_CODES.INVALID_JSON;
    return {
      ok: false,
      command: "doctor",
      node: process.version,
      fixturesReadable: false,
      network: false,
      code,
      message: err.message,
      honesty: honestyEnvelope(),
    };
  }
}

function refuseFlag(flag) {
  const map = {
    live: ERROR_CODES.LIVE_HTTP_REFUSED,
    publish: ERROR_CODES.PUBLISH_ATTEMPTED,
    checkout: ERROR_CODES.CHECKOUT_ATTEMPTED,
    pay: ERROR_CODES.PAYMENT_ATTEMPTED,
    payment: ERROR_CODES.PAYMENT_ATTEMPTED,
    settle: ERROR_CODES.PAYMENT_ATTEMPTED,
    prepare: ERROR_CODES.PAYMENT_ATTEMPTED,
    write: ERROR_CODES.EDIT_LIVE_PRICES,
    deploy: ERROR_CODES.PUBLISH_ATTEMPTED,
    "sku-write": ERROR_CODES.EDIT_LIVE_PRICES,
    "edit-prices": ERROR_CODES.EDIT_LIVE_PRICES,
  };
  return {
    ok: false,
    schema: RESULT_SCHEMA,
    status: "reject",
    code: map[flag] || ERROR_CODES.FORBIDDEN_CLAIM,
    message: `flag --${flag} is refused; this pack is a cold recorder, not a catalog writer`,
    reasons: [map[flag] || ERROR_CODES.FORBIDDEN_CLAIM],
    purchaseAuthority: false,
    liveSdsPricesUnchanged: true,
    honesty: honestyEnvelope(),
  };
}

export function runVerify(args, { cwd = process.cwd() } = {}) {
  for (const flag of FORBIDDEN_FLAGS) {
    if (args[flag] === true) return { payload: refuseFlag(flag), exitCode: 2 };
  }

  if (!args.pin || !args.observation) {
    return {
      payload: {
        ok: false,
        schema: RESULT_SCHEMA,
        status: "reject",
        code: ERROR_CODES.MISSING_REQUIRED_INPUTS,
        message: "verify requires --pin and --observation",
        reasons: [ERROR_CODES.MISSING_REQUIRED_INPUTS],
        purchaseAuthority: false,
        honesty: honestyEnvelope(),
      },
      exitCode: 2,
    };
  }

  if (looksLikeUrl(args.pin) || looksLikeUrl(args.observation)) {
    return {
      payload: refuseFlag("live"),
      exitCode: 2,
    };
  }

  let pin;
  let observation;
  try {
    pin = loadJson(resolveInputPath(args.pin, cwd));
    observation = loadJson(resolveInputPath(args.observation, cwd));
  } catch (err) {
    const code = err.code && Object.values(ERROR_CODES).includes(err.code) ? err.code : ERROR_CODES.INVALID_JSON;
    return {
      payload: {
        ok: false,
        schema: RESULT_SCHEMA,
        status: "reject",
        code,
        message: err.message,
        reasons: [code],
        purchaseAuthority: false,
        honesty: honestyEnvelope(),
      },
      exitCode: 2,
    };
  }

  const verdict = verifyDocuments({
    pin,
    observation,
    flags: args,
    paths: { pin: args.pin, observation: args.observation },
  });
  const usageCodes = new Set([
    ERROR_CODES.MISSING_REQUIRED_INPUTS,
    ERROR_CODES.LIVE_HTTP_REFUSED,
    ERROR_CODES.PUBLISH_ATTEMPTED,
    ERROR_CODES.CHECKOUT_ATTEMPTED,
    ERROR_CODES.PAYMENT_ATTEMPTED,
  ]);
  const exitCode = verdict.ok ? 0 : usageCodes.has(verdict.code) ? 2 : 1;
  return { payload: verdict, exitCode };
}

export function runCli(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (args.help === true || cmd === "help" || cmd == null) {
    stdout.write(`${usage()}\n`);
    return args.help === true || cmd === "help" ? 0 : 2;
  }

  if (cmd === "status") {
    stdout.write(`${JSON.stringify(statusPayload(), null, 2)}\n`);
    return 0;
  }

  if (cmd === "doctor") {
    const payload = doctorPayload();
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload.ok ? 0 : 1;
  }

  if (cmd !== "verify") {
    stdout.write(`${usage()}\n`);
    return 2;
  }

  const { payload, exitCode } = runVerify(args, { cwd });
  stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return exitCode;
}
