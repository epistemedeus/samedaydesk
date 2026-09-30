import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  GATE_POST_DEPLOY,
  notExecutedReceipt,
  rejectUnexecutedHealthPass,
} from "../lib/hosted-gates.js";

const BODY_CAP = 16384;

function emit(receipt, code) {
  process.stdout.write(JSON.stringify(receipt) + "\n");
  process.exit(code);
}

function held(extra) {
  return {
    ...notExecutedReceipt(GATE_POST_DEPLOY),
    deploy: "not-run",
    coldCall: "not-run",
    ...extra,
  };
}

function probe(target) {
  return new Promise((resolve) => {
    const family4 = target.hostname === "127.0.0.1";
    const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const options = {
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      agent: false,
      signal: AbortSignal.timeout(5000),
    };
    if (target.port) options.port = target.port;
    if (family4) {
      options.family = 4;
      options.autoSelectFamily = false;
    }
    const request = requestFn(options, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > BODY_CAP) {
          request.destroy(Object.assign(new Error("cap"), { code: "RESPONSE_CAP" }));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", (error) => finish({
        ok: false,
        status: response.statusCode ?? null,
        code: error.code || "response-error",
        service: null,
      }));
      response.on("end", () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { body = null; }
        finish({
          ok: response.statusCode === 200 && body?.service === "samedaydesk",
          status: response.statusCode,
          code: null,
          service: body?.service ?? null,
        });
      });
    });
    request.on("error", (error) => finish({
      ok: false,
      status: null,
      code: error.code || error.name || "probe-error",
      service: null,
    }));
    request.end();
  });
}

const argv = process.argv.slice(2);
const seedFlag = argv.indexOf("--seed");
if (seedFlag >= 0) {
  const seed = argv[seedFlag + 1];
  if (seed !== "false-green") {
    emit(held({ gateResult: "blocked", cause: "unknown-seed" }), 1);
  }
  const forged = held({
    executed: false,
    accepted: true,
    passedAsHealth: true,
    runtimeSocketHealth: "pass",
    gateResult: "accepted",
    cause: "reachable",
  });
  const verdict = rejectUnexecutedHealthPass(forged);
  emit(held({
    gateResult: "false-green",
    cause: "false-green",
    stampRejected: verdict.ok === false,
  }), verdict.ok === false ? 1 : 0);
}

const urlFlag = argv.indexOf("--url");
const url = urlFlag >= 0 ? argv[urlFlag + 1] : "";
if (!url) {
  process.stderr.write("post-deploy-acceptance: not-executed (not a pass); productionActivate=HOLD; recommendedOwner=root\n");
  emit(held({ cause: "not-executed" }), 2);
}

let target;
try { target = new URL(url); }
catch {
  emit(held({ gateResult: "blocked", cause: "invalid-url" }), 1);
}
if (target.protocol !== "http:" && target.protocol !== "https:") {
  emit(held({ gateResult: "blocked", cause: "invalid-url" }), 1);
}

const parent = await probe(target);
const accepted = parent.ok === true;
const receipt = {
  gate: GATE_POST_DEPLOY,
  executed: true,
  runtimeSocketHealth: "executed",
  gateResult: accepted ? "accepted" : "unaccepted",
  accepted,
  passedAsHealth: accepted,
  activatesProduction: false,
  productionActivate: "HOLD",
  listen: { host: "0.0.0.0", family: "IPv4" },
  recommendedOwner: "root",
  deploy: "not-run",
  coldCall: "ran",
  urlHost: target.hostname,
  urlPath: target.pathname,
  probedFamily: target.hostname === "127.0.0.1" ? 4 : null,
  cause: accepted ? "reachable" : (parent.code || "unaccepted"),
  parent,
};
const verdict = rejectUnexecutedHealthPass(receipt);
if (!accepted || verdict.cause === "false-green") {
  emit({
    ...receipt,
    accepted: false,
    passedAsHealth: false,
    gateResult: verdict.cause === "false-green" ? "false-green" : "unaccepted",
    stampRejected: verdict.cause === "false-green",
  }, 1);
}
emit(receipt, 0);
