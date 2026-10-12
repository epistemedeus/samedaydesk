import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CALLER_PIN, STALE_CALLER_PIN, diagnoseCallerContract } from "../lib/caller-readiness.mjs";
import { PRICE_PATTERN, classifySchema, semanticResult } from "../lib/readiness-contract.mjs";
import { S14_PIN, STALE_NEO } from "../lib/pins.mjs";
import { MAX_BYTES, WORK_LIMIT_MS } from "../lib/supplied-bounds.mjs";

const here = new URL(".", import.meta.url);
const cli = new URL("../task-readiness-caller.mjs", here);
const contractUrl = new URL("../lib/readiness-contract.mjs", here);
const callerUrl = new URL("../lib/caller-readiness.mjs", here);
const boundsUrl = new URL("../lib/supplied-bounds.mjs", here);
const readinessUrl = new URL("../lib/task-readiness.mjs", here);
const NOW = Date.parse("2026-10-12T00:00:00.000Z");
const DEADLINE = "2099-01-01T00:00:00.000Z";

function quoteSchema(quote, required = ["quote"]) {
  return {
    type: "object",
    properties: {
      data: {
        type: "object",
        required,
        properties: { quote },
      },
    },
  };
}

function anchored(quote, dataRequired = ["quote"]) {
  return {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: dataRequired,
        properties: { quote },
      },
    },
  };
}

function input(overrides = {}) {
  return {
    method: "POST",
    path: "/price",
    schema: anchored({ type: "string", pattern: PRICE_PATTERN.source }),
    value: { data: { quote: "9" } },
    semantic: { pointer: "data.quote", pattern: PRICE_PATTERN.source },
    pin: CALLER_PIN,
    deadline: DEADLINE,
    ...overrides,
  };
}

function omit(key) {
  const body = input();
  delete body[key];
  return body;
}

function diagnose(body, options = {}) {
  return diagnoseCallerContract(body, { now: NOW, ...options });
}

function comparable(result) {
  const copy = { ...result };
  delete copy.elapsedMs;
  return copy;
}

function writeInput(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(body));
  return file;
}

function runCli(file) {
  return spawnSync(process.execPath, [cli.pathname, "--in", file], {
    encoding: "utf8",
    timeout: 5_000,
  });
}

test("caller pin is the maintained public checker pin", () => {
  assert.equal(CALLER_PIN, S14_PIN);
  assert.equal(STALE_CALLER_PIN, STALE_NEO);
});

test("pure modules import nothing and do not mention express", () => {
  for (const url of [contractUrl, boundsUrl]) {
    const source = readFileSync(url, "utf8");
    assert.equal(source.includes("import "), false);
    assert.equal(source.includes("express"), false);
    assert.equal(source.includes("server/app.js"), false);
  }
  const caller = readFileSync(callerUrl, "utf8");
  assert.equal(caller.includes("express"), false);
  assert.equal(caller.includes("server/app.js"), false);
  assert.equal(caller.includes("task-readiness.mjs"), false);
  assert.equal(caller.includes("public-adapter"), false);
  assert.equal(caller.includes("new RegExp"), false);
  assert.equal(caller.includes("Date.parse"), false);
  assert.equal(caller.includes("fetch("), false);
  assert.equal(caller.includes("spawn"), false);
  assert.equal(caller.includes("node:http"), false);
  assert.equal(caller.includes("node:net"), false);
});

test("owned decimal results stay on the pure module", () => {
  const soon = semanticResult({ data: { quote: "soon" } });
  assert.equal(soon.shape, "string");
  assert.equal(soon.state, "fail");
  assert.equal(soon.code, "value_mismatch");
  assert.equal(semanticResult({ data: { quote: "1.25" } }).state, "pass");
  assert.equal(semanticResult({ data: { quote: 1.25 } }).shape, "number");
  assert.equal(semanticResult({ data: { quote: null } }).shape, "object");
  assert.equal(classifySchema(quoteSchema({ type: ["string", "null"] }), ["data.quote"]).state, "pass");
  assert.equal(classifySchema(anchored({ type: ["string", "null"] }), ["data.quote"]).state, "pass");
  assert.equal(classifySchema({
    type: "object",
    properties: {
      data: {
        type: "object",
        required: ["quote"],
        properties: { quote: { type: "string", pattern: PRICE_PATTERN.source } },
      },
    },
  }, ["data.quote"]).state, "pass");
  assert.deepEqual(classifySchema(null, ["data.quote"]), {
    state: "fail",
    code: "seller_response_contract_absent",
  });
});

test("independently varied inputs change diagnosis and next action", () => {
  const cases = [
    ["conforming", input(), "diagnosed", "decimal_match", "pass", "string"],
    ["semantic-wrong", input({ value: { data: { quote: "later" } } }), "diagnosed", "value_mismatch:data.quote:string", "fail", "string"],
    ["missing-path", input({ schema: anchored({ type: "string" }, ["id"]) }), "diagnosed", "seller_response_required_path_missing:data.quote", "pass", "string"],
    ["nullable", input({ schema: anchored({ type: ["string", "null"] }) }), "diagnosed", "type_not_guaranteed:data.quote", "pass", "string"],
    ["enum", input({ schema: anchored({ type: "string", enum: ["9", "later"] }) }), "diagnosed", "enum_not_guaranteed:data.quote", "pass", "string"],
    ["malformed", input({ value: { data: { quote: 9 } } }), "diagnosed", "type_mismatch:data.quote", "fail", "number"],
    ["unsupported", input({
      schema: {
        oneOf: [{ type: "object" }],
        ...quoteSchema({ type: "string" }),
      },
    }), "no_fit", "schema_unsupported", "pass", "string"],
  ];
  const actions = cases.map((item) => {
    const result = diagnose(item[1]);
    assert.equal(result.fit, item[2], item[0]);
    assert.equal(result.nextAction, item[3], item[0]);
    assert.equal(result.semantic.state, item[4], item[0]);
    assert.equal(result.semantic.shape, item[5], item[0]);
    assert.equal(result.faithfulInvocation, false);
    assert.equal(result.completedUserTask, false);
    assert.equal(result.outsideAcceptance, "not_observed");
    assert.equal(result.quoteGenerated, false);
    assert.equal(result.paymentSent, false);
    assert.equal(result.repairPosted, false);
    assert.equal(result.coldStartExecuted, false);
    assert.equal(result.routeFetched, false);
    assert.equal(result.savingsClaim, false);
    assert.equal(result.directPathRetained, true);
    assert.equal(result.cost.amount, null);
    assert.equal(result.cost.currency, null);
    assert.equal(result.cost.state, "unknown");
    return result.nextAction;
  });
  assert.equal(new Set(actions).size, actions.length);
  const otherDecimal = diagnose(input({
    method: "GET",
    path: "/estimate",
    value: { data: { quote: "4.50" } },
  }));
  assert.equal(otherDecimal.nextAction, "decimal_match");
  assert.equal(otherDecimal.guarantee.state, "proved");
  assert.notEqual(otherDecimal.path, "/quote");
  const constDecimal = diagnose(input({
    method: "POST",
    path: "/desk",
    schema: anchored({ type: "string", const: "10" }),
    value: { data: { quote: "10" } },
  }));
  assert.equal(constDecimal.nextAction, "decimal_match");
  assert.equal(constDecimal.schema.state, "pass");
  assert.equal(constDecimal.semantic.state, "pass");
});

test("missing, absent, array, and irrelevant contracts stay distinct", () => {
  const missing = diagnose(omit("value"));
  assert.equal(missing.fit, "missing_input");
  assert.equal(missing.nextAction, "missing_input:value");
  assert.equal(missing.semantic.state, "not_invoked");
  const absent = diagnose(input({ schema: null, value: { data: { quote: "4.50" } } }));
  assert.equal(absent.nextAction, "seller_response_contract_absent");
  assert.equal(absent.semantic.state, "pass");
  const arraySchema = diagnose(input({
    schema: anchored({ type: "array" }),
    value: { data: { quote: ["9"] } },
  }));
  assert.equal(arraySchema.nextAction, "type_not_guaranteed:data.quote:array");
  assert.equal(arraySchema.semantic.state, "fail");
  const arrayValue = diagnose(input({ value: { data: { quote: ["9"] } } }));
  assert.equal(arrayValue.nextAction, "type_mismatch:data.quote");
  assert.equal(arrayValue.schema.state, "fail");
  assert.equal(arrayValue.semantic.shape, "object");
  assert.equal(arrayValue.semantic.state, "fail");
  const currency = diagnose(input({
    semantic: { pointer: "data.total", pattern: "^[A-Z]{3}$" },
  }));
  assert.equal(currency.fit, "no_fit");
  assert.equal(currency.nextAction, "no_fit:semantic_contract");
  assert.equal(currency.semantic.state, "not_invoked");
  assert.equal(currency.cost.amount, null);
  const method = diagnose(input({ method: "PUT" }));
  assert.equal(method.nextAction, "no_fit:method");
});

test("a matching sample does not prove an unsupported schema", () => {
  const sample = { data: { quote: "4.50" } };
  const owned = { type: "string", pattern: PRICE_PATTERN.source };
  const optionalData = {
    type: "object",
    properties: {
      data: { type: "object", required: ["quote"], properties: { quote: owned } },
    },
  };
  const nullableData = {
    type: "object",
    required: ["data"],
    properties: {
      data: { type: ["object", "null"], required: ["quote"], properties: { quote: owned } },
    },
  };
  const missingQuote = {
    type: "object",
    required: ["data"],
    properties: { data: { type: "object", required: ["quote"], properties: {} } },
  };
  const untypedQuote = anchored({});
  const untypedRoot = {
    required: ["data"],
    properties: { data: { type: "object", required: ["quote"], properties: { quote: owned } } },
  };
  const cases = [
    ["optional-data", input({ schema: optionalData, value: sample }), "diagnosed", "required_not_guaranteed:data", "unproved", "pass"],
    ["nullable-data", input({ schema: nullableData, value: sample }), "diagnosed", "type_not_guaranteed:data", "unproved", "pass"],
    ["missing-quote-schema", input({ schema: missingQuote, value: sample }), "diagnosed", "quote_schema_absent:data.quote", "unproved", "pass"],
    ["untyped-quote", input({ schema: untypedQuote, value: sample }), "diagnosed", "type_not_guaranteed:data.quote", "unproved", "pass"],
    ["string-without-restriction", input({ schema: anchored({ type: "string" }), value: sample }), "diagnosed", "guarantee_unproved:data.quote", "unproved", "pass"],
    ["const-conflict", input({ schema: anchored({ type: "string", const: "soon" }), value: sample }), "no_fit", "const_not_decimal:data.quote", "unsupported", "pass"],
    ["const-sample", input({ schema: anchored({ type: "string", const: "4.50" }), value: { data: { quote: "9" } } }), "diagnosed", "const_mismatch:data.quote", "proved", "pass"],
    ["foreign-pattern", input({ schema: anchored({ type: "string", pattern: "^[a-z]+$" }), value: sample }), "no_fit", "pattern_unsupported:data.quote", "unsupported", "pass"],
    ["length", input({ schema: anchored({ type: "string", pattern: PRICE_PATTERN.source, minLength: 8 }), value: sample }), "diagnosed", "length_mismatch:data.quote", "proved", "pass"],
    ["untyped-root", input({ schema: untypedRoot, value: sample }), "diagnosed", "type_not_guaranteed", "unproved", "pass"],
    ["malformed-length", input({ schema: anchored({ type: "string", minLength: "8" }), value: sample }), "no_fit", "schema_malformed", "unsupported", "pass"],
    ["allOf", input({ schema: { allOf: [anchored(owned)], ...anchored(owned) }, value: sample }), "no_fit", "schema_unsupported", "unsupported", "pass"],
    ["format", input({ schema: anchored({ type: "string", format: "date" }), value: sample }), "no_fit", "schema_unsupported:format", "unsupported", "pass"],
    ["decimal-enum", input({ schema: anchored({ type: "string", enum: ["4.50", "9"] }), value: { data: { quote: "9" } } }), "diagnosed", "decimal_match", "proved", "pass"],
    ["enum-sample", input({ schema: anchored({ type: "string", enum: ["4.50", "9"] }), value: { data: { quote: "2" } } }), "diagnosed", "enum_mismatch:data.quote", "proved", "pass"],
    ["annotation", input({
      schema: {
        ...anchored(owned),
        title: "Quote",
        description: "A decimal string quote.",
      },
      value: sample,
    }), "diagnosed", "decimal_match", "proved", "pass"],
  ];
  for (const [name, body, fit, nextAction, guarantee, semantic] of cases) {
    const result = diagnose(body);
    assert.equal(result.fit, fit, name);
    assert.equal(result.nextAction, nextAction, name);
    assert.equal(result.guarantee.state, guarantee, name);
    assert.equal(result.semantic.state, semantic, name);
    assert.equal(result.quoteGenerated, false, name);
    assert.equal(result.paymentSent, false, name);
    assert.equal(result.repairPosted, false, name);
    assert.equal(result.routeFetched, false, name);
    assert.equal(result.coldStartExecuted, false, name);
    assert.equal(result.cost.amount, null, name);
  }
  const nonMatch = cases.filter((item) => item[3] !== "decimal_match").map((item) => item[3]);
  assert.equal(new Set(nonMatch).size, nonMatch.length);
  const proved = diagnose(cases.find((item) => item[0] === "decimal-enum")[1]);
  assert.equal(proved.schema.state, "pass");
  assert.equal(proved.semantic.state, "pass");
  assert.equal(proved.guarantee.state, "proved");
});

test("unsafe pin, deadline, and catalog instructions refuse", () => {
  assert.throws(() => diagnose(input({ pin: STALE_CALLER_PIN })), (error) => error.code === "stale_pin");
  assert.throws(() => diagnose(input({ pin: "de9c23b5d19de30874e432e7ef1193d0d02d6702" })), (error) => error.code === "pin_mismatch");
  assert.throws(() => diagnose(omit("pin")), (error) => error.code === "pin_required");
  assert.throws(() => diagnose(omit("deadline")), (error) => error.code === "deadline_required");
  assert.throws(() => diagnose(input({ deadline: "tomorrow" })), (error) => error.code === "deadline_invalid");
  assert.throws(() => diagnose(input({ deadline: "2020-01-01T00:00:00.000Z" })), (error) => error.code === "deadline_passed");
  assert.throws(() => diagnose(input({ deadline: "2026-10-12T00:00:00.000Z" })), (error) => error.code === "deadline_passed");
  assert.equal(Number.isNaN(Date.parse("2099-02-30T00:00:00.000Z")), false);
  assert.throws(() => diagnose(input({ deadline: "2099-02-30T00:00:00.000Z" })), (error) => error.code === "deadline_invalid");
  assert.throws(() => diagnose(input({ deadline: "2099-02-29T00:00:00.000Z" })), (error) => error.code === "deadline_invalid");
  assert.throws(() => diagnose(input({ deadline: "2099-04-31T00:00:00.000Z" })), (error) => error.code === "deadline_invalid");
  assert.equal(diagnose(input({ deadline: "2096-02-29T00:00:00.000Z" })).nextAction, "decimal_match");
  assert.throws(() => diagnose(input({ coldStart: "npm test" })), (error) => error.code === "hostile_input");
  assert.throws(() => diagnose(input({ schema: { $ref: "#/x" } })), (error) => error.code === "hostile_input");
  assert.throws(() => diagnose(input({ path: "/../secret" })), (error) => error.code === "hostile_input");
  assert.throws(() => diagnose({ ...input(), shell: "sh" }), (error) => error.code === "hostile_input");
  let ticks = 0;
  assert.throws(() => diagnose(input(), {
    clock: () => (ticks++ === 0 ? 0 : WORK_LIMIT_MS + 1),
  }), (error) => error.code === "work_limit");
});

test("hidden express still loads the pure module and still blocks the server module", () => {
  const root = mkdtempSync(join(tmpdir(), "l08-hide-express-"));
  const loader = join(root, "hide-express-loader.mjs");
  const register = join(root, "hide-express-register.mjs");
  writeFileSync(loader, [
    "export async function resolve(specifier, context, nextResolve) {",
    "  if (specifier === \"express\" || specifier.startsWith(\"express/\")) {",
    "    const error = new Error(\"Cannot find package 'express'\");",
    "    error.code = \"ERR_MODULE_NOT_FOUND\";",
    "    throw error;",
    "  }",
    "  return nextResolve(specifier, context);",
    "}",
    "",
  ].join("\n"));
  writeFileSync(register, "import { register } from \"node:module\";\nregister(new URL(\"./hide-express-loader.mjs\", import.meta.url));\n");
  const load = (url) => spawnSync(process.execPath, [
    "--import", register,
    "--input-type=module",
    "-e", `await import(${JSON.stringify(url)})`,
  ], { encoding: "utf8", timeout: 15_000 });
  try {
    const pure = load(pathToFileURL(contractUrl.pathname).href);
    assert.equal(pure.status, 0, pure.stderr);
    const caller = load(pathToFileURL(callerUrl.pathname).href);
    assert.equal(caller.status, 0, caller.stderr);
    const server = load(pathToFileURL(readinessUrl.pathname).href);
    assert.equal(server.status, 1);
    assert.match(server.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.match(server.stderr, /express/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the installed command and the direct function agree on variable input", () => {
  const root = mkdtempSync(join(tmpdir(), "l08-caller-cli-"));
  try {
    const good = writeInput(root, "good.json", input({ path: "/desk", value: { data: { quote: "4.50" } } }));
    const wrong = writeInput(root, "wrong.json", input({ value: { data: { quote: "later" } } }));
    const unfit = writeInput(root, "unfit.json", input({
      semantic: { pointer: "data.currency", pattern: "^[A-Z]{3}$" },
    }));
    for (const [file, body] of [[good, input({ path: "/desk", value: { data: { quote: "4.50" } } })], [wrong, input({ value: { data: { quote: "later" } } })], [unfit, input({ semantic: { pointer: "data.currency", pattern: "^[A-Z]{3}$" } })]]) {
      const ran = runCli(file);
      const parsed = JSON.parse(ran.stdout);
      const direct = diagnose(body);
      assert.deepEqual(comparable(parsed), comparable(direct));
      assert.equal(ran.status, direct.nextAction === "decimal_match" ? 0 : 1);
      assert.equal(parsed.savingsClaim, false);
      assert.equal(parsed.cost.amount, null);
    }
    const fifo = join(root, "pipe.json");
    const made = spawnSync("mkfifo", [fifo], { encoding: "utf8", timeout: 2_000 });
    assert.equal(made.status, 0, made.stderr);
    assert.equal(statSync(fifo).isFIFO(), true);
    const piped = runCli(fifo);
    assert.equal(piped.status, 2);
    assert.equal(JSON.parse(piped.stdout).code, "unsafe_source");
    const remote = runCli("http://127.0.0.1/quote");
    assert.equal(remote.status, 2);
    assert.equal(JSON.parse(remote.stdout).code, "unsafe_source");
    const broken = writeInput(root, "broken.json", input());
    writeFileSync(broken, "{");
    const malformed = runCli(broken);
    assert.equal(malformed.status, 2);
    assert.equal(JSON.parse(malformed.stdout).code, "malformed_json");
    const huge = join(root, "huge.json");
    writeFileSync(huge, `{"pad":"${"x".repeat(MAX_BYTES)}"}`);
    const oversized = runCli(huge);
    assert.equal(oversized.status, 2);
    assert.equal(JSON.parse(oversized.stdout).code, "oversized_input");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
