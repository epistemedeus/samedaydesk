#!/usr/bin/env node
/**
 * Build the importable Make blueprint, the importable n8n workflow and the synthetic
 * export fixtures from vendored sources. Deterministic; the tests check that the
 * committed files equal this output.
 *
 *   node scripts/build-artifacts.mjs           write the files
 *   node scripts/build-artifacts.mjs --check   exit 1 if a committed file differs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  agentEntryCaller,
  periodNCapture,
  periodNPlus1Preview,
  periodNPlus1SchemaChange,
  termsInputFromCaller,
  workExchangeCaller,
} from "../vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs";
import { CHECKER_END, CHECKER_START, CONFIG_START, upstreamCodeNodeSource } from "../src/flowassert-bridge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CLIENT_ENDPOINT = "https://client.example.invalid/samedaydesk/workflow-kits";
const REQUEST_KIND = "samedaydesk.workflow-kits-n12.workflow-request.v1";
const COMPARISON_RECORD = '{"expected":"accepted-output","observed":"accepted-output"}';

// ---------- Make ----------

function makeHttp(id, name, { path, idempotencyKey = null, data, x, y, filter = null }) {
  const headers = [{ name: "Content-Type", value: "application/json" }];
  if (idempotencyKey) headers.push({ name: "Idempotency-Key", value: idempotencyKey });
  return {
    id,
    module: "http:ActionSendData",
    version: 3,
    parameters: { handleErrors: false, useNewZLibDeCompress: true },
    ...(filter ? { filter } : {}),
    mapper: {
      ca: "",
      qs: [],
      url: `${CLIENT_ENDPOINT}${path}`,
      gzip: true,
      method: "post",
      headers,
      timeout: "",
      useMtls: false,
      authPass: "",
      authUser: "",
      bodyType: "raw",
      contentType: "application/json",
      data,
      serializeUrl: false,
      shareCookies: false,
      parseResponse: true,
      followRedirect: true,
      useQuerystring: false,
      followAllRedirects: false,
      rejectUnauthorized: true,
    },
    metadata: { designer: { x, y, name } },
  };
}

function makeRespond(id, name, { status, body, x, y, filter = null }) {
  return {
    id,
    module: "gateway:WebhookRespond",
    version: 1,
    parameters: {},
    ...(filter ? { filter } : {}),
    mapper: { body, status: String(status), headers: [{ key: "Content-Type", value: "application/json" }] },
    metadata: { designer: { x, y, name } },
  };
}

const MAKE_EVALUATE_DATA = `{"kind":"${REQUEST_KIND}","platform":"make","committed":true,"period":{{3.json}},"workflowOutput":{{2.json}},"comparisonRecord":${COMPARISON_RECORD}}`;

export function buildMakeBlueprint() {
  return {
    name: "SameDayDesk record to accepted output (workflow-kits-n12)",
    flow: [
      {
        id: 1,
        module: "gateway:CustomWebHook",
        version: 1,
        parameters: { hook: null, maxResults: 1 },
        mapper: {},
        metadata: { designer: { x: 0, y: 0, name: "Receive Period Capture" } },
      },
      {
        id: 2,
        module: "json:TransformToJSON",
        version: 1,
        parameters: { space: "" },
        mapper: { object: "{{1.period.capture.payload}}" },
        metadata: { designer: { x: 300, y: 0, name: "Shape Capture Fields" } },
      },
      {
        id: 3,
        module: "json:TransformToJSON",
        version: 1,
        parameters: { space: "" },
        mapper: { object: "{{1.period}}" },
        metadata: { designer: { x: 600, y: 0, name: "Period Record JSON" } },
      },
      makeHttp(4, "Evaluate Period", { path: "/periods", data: MAKE_EVALUATE_DATA, x: 900, y: 0 }),
      {
        id: 5,
        module: "builtin:BasicRouter",
        version: 1,
        mapper: null,
        metadata: { designer: { x: 1200, y: 0, name: "Route On Period" } },
        routes: [
          {
            flow: [
              makeHttp(6, "Post Accepted Output", {
                path: "/periods/accepted",
                idempotencyKey: "{{4.data.period.idempotencyKey}}",
                data: '{"idempotencyKey":"{{4.data.period.idempotencyKey}}","taskId":"{{4.data.period.recordEvidence.taskId}}","captureId":"{{4.data.period.recordEvidence.captureId}}","termsVersion":"{{4.data.period.recordEvidence.termsVersion}}","output":{{2.json}}}',
                x: 1500,
                y: -300,
                filter: {
                  name: "Accepted",
                  conditions: [[
                    { a: "{{4.data.period.decision}}", b: "accept", o: "text:equal" },
                    { a: "{{4.data.period.exception}}", o: "notexist" },
                  ]],
                },
              }),
              makeRespond(7, "Respond Accepted", {
                status: 200,
                body: '{"decision":"{{4.data.period.decision}}","idempotencyKey":"{{4.data.period.idempotencyKey}}","duplicate":{{6.data.duplicate}}}',
                x: 1800,
                y: -300,
              }),
            ],
          },
          {
            flow: [
              {
                id: 8,
                module: "util:FunctionSleep",
                version: 1,
                parameters: {},
                filter: {
                  name: "Retryable",
                  conditions: [[{ a: "{{4.data.period.retry.retryable}}", b: "true", o: "boolean:equal" }]],
                },
                mapper: { duration: "60" },
                metadata: { designer: { x: 1500, y: 0, name: "Wait Before Replay" } },
              },
              makeHttp(9, "Replay Same Key", {
                path: "/periods",
                idempotencyKey: "{{4.data.period.retry.sameIdempotencyKey}}",
                data: MAKE_EVALUATE_DATA,
                x: 1800,
                y: 0,
              }),
              makeRespond(10, "Respond Replayed", {
                status: 202,
                body: '{"decision":"{{9.data.period.decision}}","code":"{{9.data.period.exception.code}}","idempotencyKey":"{{9.data.period.idempotencyKey}}"}',
                x: 2100,
                y: 0,
              }),
            ],
          },
          {
            flow: [
              makeRespond(11, "Respond Exception", {
                status: 422,
                body: '{"code":"{{4.data.period.exception.code}}","idempotencyKey":"{{4.data.period.idempotencyKey}}"}',
                x: 1500,
                y: 300,
                filter: {
                  name: "Not retryable",
                  conditions: [[
                    { a: "{{4.data.period.exception.code}}", o: "exist" },
                    { a: "{{4.data.period.retry.retryable}}", b: "false", o: "boolean:equal" },
                  ]],
                },
              }),
            ],
          },
        ],
      },
    ],
    metadata: {
      instant: true,
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: true,
        slots: null,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false,
      },
      designer: { orphans: [] },
      zone: "us2.make.com",
    },
  };
}

// ---------- n8n ----------

const uid = (n) => `9b6c3f40-5a2e-4d11-8c7a-${String(n).padStart(12, "0")}`;

function n8nIf(n, name, leftValue, position) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          { id: uid(100 + n), leftValue, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } },
        ],
        combinator: "and",
      },
      options: {},
    },
  };
}

function n8nHttp(n, name, { url, idempotencyKey = null, jsonBody, position }) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    parameters: {
      method: "POST",
      url,
      sendHeaders: idempotencyKey !== null,
      ...(idempotencyKey !== null ? { headerParameters: { parameters: [{ name: "Idempotency-Key", value: idempotencyKey }] } } : {}),
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: {},
    },
  };
}

function n8nRespond(n, name, { responseBody, code, position }) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position,
    parameters: { respondWith: "json", responseBody, options: { responseCode: code } },
  };
}

const ENDPOINT_EXPR = "$('Kit Settings').item.json.clientEndpoint";
const evaluateBody = (outputExpr) =>
  `={{ JSON.stringify({ kind: "${REQUEST_KIND}", platform: "n8n", committed: true, period: $('Receive Period Capture').item.json.body.period, workflowOutput: ${outputExpr}, comparisonRecord: { expected: "accepted-output", observed: "accepted-output" }, execution: { platform: "n8n", id: $execution.id, workflowId: $workflow.id } }) }}`;

export const N8N_FLOWASSERT_RUN = `// ===== Run the check. =====
// SameDayDesk workflow-kits-n12 input wiring (the only change from the upstream example):
// the two CSV files arrive as text in the webhook body, body.flowassert.sourceCsv and
// body.flowassert.destinationCsv, instead of from Read/Write Files nodes, which n8n Cloud
// does not offer. The checker call and the returned item are the upstream ones.
const items = $input.all();
const textOf = (field) => {
  const item = items.find((candidate) => candidate.json && candidate.json.body && candidate.json.body.flowassert
    && typeof candidate.json.body.flowassert[field] === "string");
  if (!item) throw new Error(\`FlowAssert: no input item has body.flowassert.\${field}\`);
  return item.json.body.flowassert[field];
};
const result = await FlowAssert.checkCsv({
  source: { name: SOURCE.name, content: textOf("sourceCsv"), encoding: SOURCE.encoding },
  destination: { name: DESTINATION.name, content: textOf("destinationCsv"), encoding: DESTINATION.encoding },
  config: CONFIG,
  sourceComplete: SOURCE_COMPLETE,
  destinationComplete: DESTINATION_COMPLETE,
  sourceCount: SOURCE_COUNT,
  destinationCount: DESTINATION_COUNT,
  allowIdenticalContent: ALLOW_IDENTICAL_CONTENT,
  origin: "n8n Code node",
});
return [{
  json: {
    state: result.state,
    exit: result.exit,
    counts: result.json === null ? null : JSON.parse(result.json).counts,
    summary: result.summary,
    message: result.message,
    flowassertVersion: FlowAssert.VERSION,
    reportJson: result.json,
  },
}];
`;

export function buildFlowAssertNodeCode() {
  const upstream = upstreamCodeNodeSource();
  const configAndChecker = upstream.slice(upstream.indexOf(CONFIG_START), upstream.indexOf(CHECKER_END));
  if (!configAndChecker.includes(CHECKER_START)) throw new Error("upstream checker marker missing");
  return configAndChecker + N8N_FLOWASSERT_RUN;
}

export function buildN8nWorkflow() {
  const nodes = [
    {
      id: uid(1),
      name: "Receive Period Capture",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: uid(1001),
      parameters: { httpMethod: "POST", path: "samedaydesk-record-to-accepted-output", responseMode: "responseNode", options: {} },
    },
    {
      id: uid(2),
      name: "Kit Settings",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [220, 0],
      parameters: {
        assignments: { assignments: [{ id: uid(102), name: "clientEndpoint", value: CLIENT_ENDPOINT, type: "string" }] },
        includeOtherFields: true,
        options: {},
      },
    },
    {
      id: uid(3),
      name: "Shape Capture Fields",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [440, 0],
      parameters: {
        mode: "runOnceForAllItems",
        language: "javaScript",
        jsCode: "// Pass the recorded payload through unchanged. No field is renamed or migrated here;\n// a changed schema reaches the client endpoint and is reported as schema_changed.\nreturn $('Receive Period Capture').all().map((item) => ({ json: item.json.body.period.capture.payload }));\n",
      },
    },
    n8nHttp(4, "Evaluate Period", { url: `={{ ${ENDPOINT_EXPR} }}/periods`, jsonBody: evaluateBody("$json"), position: [660, 0] }),
    n8nIf(5, "Accepted?", "={{ $json.period.exception === null && $json.period.decision === 'accept' }}", [880, 0]),
    n8nHttp(6, "Post Accepted Output", {
      url: `={{ ${ENDPOINT_EXPR} }}/periods/accepted`,
      idempotencyKey: "={{ $json.period.idempotencyKey }}",
      jsonBody: "={{ JSON.stringify({ idempotencyKey: $json.period.idempotencyKey, recordEvidence: $json.period.recordEvidence, output: $('Shape Capture Fields').item.json }) }}",
      position: [1100, -200],
    }),
    n8nRespond(7, "Respond Accepted", {
      responseBody: "={{ JSON.stringify({ period: $('Evaluate Period').item.json.period, delivery: $json }) }}",
      code: 200,
      position: [1320, -200],
    }),
    n8nIf(8, "Retryable?", "={{ $json.period.retry.retryable === true }}", [1100, 100]),
    {
      id: uid(9),
      name: "Wait Before Replay",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [1320, 0],
      webhookId: uid(1009),
      parameters: { amount: 60, unit: "seconds" },
    },
    n8nHttp(10, "Replay Same Key", {
      url: `={{ ${ENDPOINT_EXPR} }}/periods`,
      idempotencyKey: "={{ $('Evaluate Period').item.json.period.retry.sameIdempotencyKey || '' }}",
      jsonBody: evaluateBody("$('Shape Capture Fields').item.json"),
      position: [1540, 0],
    }),
    n8nRespond(11, "Respond Replayed", { responseBody: "={{ JSON.stringify({ period: $json.period }) }}", code: 202, position: [1760, 0] }),
    n8nRespond(12, "Respond Exception", { responseBody: "={{ JSON.stringify({ period: $json.period }) }}", code: 422, position: [1320, 250] }),
    n8nIf(13, "FlowAssert Inputs?", "={{ Boolean($json.body && $json.body.flowassert && $json.body.flowassert.sourceCsv && $json.body.flowassert.destinationCsv) }}", [440, 300]),
    {
      id: uid(14),
      name: "FlowAssert check",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [660, 300],
      parameters: { mode: "runOnceForAllItems", language: "javaScript", jsCode: buildFlowAssertNodeCode() },
    },
    n8nHttp(15, "Record FlowAssert Result", {
      url: `={{ ${ENDPOINT_EXPR} }}/periods/flowassert`,
      jsonBody: "={{ JSON.stringify({ captureId: $('Receive Period Capture').item.json.body.period.capture.captureId, flowassert: { state: $json.state, exit: $json.exit, counts: $json.counts, flowassertVersion: $json.flowassertVersion } }) }}",
      position: [880, 300],
    }),
  ];
  const link = (node, index = 0) => ({ node, type: "main", index });
  const connections = {
    "Receive Period Capture": { main: [[link("Kit Settings")]] },
    "Kit Settings": { main: [[link("Shape Capture Fields"), link("FlowAssert Inputs?")]] },
    "Shape Capture Fields": { main: [[link("Evaluate Period")]] },
    "Evaluate Period": { main: [[link("Accepted?")]] },
    "Accepted?": { main: [[link("Post Accepted Output")], [link("Retryable?")]] },
    "Post Accepted Output": { main: [[link("Respond Accepted")]] },
    "Retryable?": { main: [[link("Wait Before Replay")], [link("Respond Exception")]] },
    "Wait Before Replay": { main: [[link("Replay Same Key")]] },
    "Replay Same Key": { main: [[link("Respond Replayed")]] },
    "FlowAssert Inputs?": { main: [[link("FlowAssert check")], []] },
    "FlowAssert check": { main: [[link("Record FlowAssert Result")]] },
  };
  return {
    name: "SameDayDesk record to accepted output (workflow-kits-n12)",
    nodes,
    connections,
    settings: { executionOrder: "v1", saveDataSuccessExecution: "all", saveDataErrorExecution: "all", saveManualExecutions: true },
    pinData: {},
  };
}

// ---------- synthetic export fixtures ----------

export function periodNWebhookBody() {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  return {
    period: {
      periodId: "period-N",
      taskId: caller.periodNTaskId,
      contextId: caller.contextId,
      followsTaskId: null,
      termsInput: termsInputFromCaller(caller),
      capture: periodNCapture(),
      caller: { correlationId: entry.correlationId, step: entry.step, tool: entry.tool, measurement: entry.measurement },
    },
  };
}

export function schemaChangeWebhookBody({ schemaAdapter = null } = {}) {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  return {
    period: {
      periodId: "period-N+1",
      taskId: caller.periodNPlus1TaskId,
      contextId: caller.contextId,
      followsTaskId: caller.periodNTaskId,
      termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
      capture: periodNPlus1SchemaChange(),
      caller: { correlationId: entry.correlationId, step: 1, tool: entry.tool, measurement: entry.measurement },
      ...(schemaAdapter ? { schemaAdapter } : {}),
    },
  };
}

const NOTICE = "Synthetic export built by scripts/build-artifacts.mjs from vendored synthetic fixtures. Not a live Make or n8n run.";

export function makeExecutionFixture(body, { id, status = "success" } = {}) {
  return {
    synthetic: true,
    notice: NOTICE,
    execution: { id, status },
    modules: {
      1: { module: "gateway:CustomWebHook", name: "Receive Period Capture", output: [body] },
      2: {
        module: "json:TransformToJSON",
        name: "Shape Capture Fields",
        output: body.period.capture ? [{ json: JSON.stringify(body.period.capture.payload ?? null) }] : [],
      },
    },
  };
}

export function n8nExecutionFixture(body, { id, status = "success" } = {}) {
  const start = Date.parse("2026-11-12T10:29:00.000Z");
  const run = (json, offset) => [{ startTime: start + offset, executionTime: 3, source: [], executionStatus: status === "success" ? "success" : "error", data: { main: [[{ json }]] } }];
  return {
    synthetic: true,
    notice: NOTICE,
    id,
    finished: status === "success",
    mode: "webhook",
    status,
    workflowId: "synthetic-samedaydesk-wk-n12",
    startedAt: new Date(start).toISOString(),
    stoppedAt: new Date(start + 50).toISOString(),
    data: {
      resultData: {
        runData: {
          "Receive Period Capture": run({ headers: {}, params: {}, query: {}, body }, 0),
          "Kit Settings": run({ headers: {}, params: {}, query: {}, body, clientEndpoint: CLIENT_ENDPOINT }, 5),
          ...(body.period.capture?.payload ? { "Shape Capture Fields": run(body.period.capture.payload, 10) } : {}),
        },
      },
    },
  };
}

export function buildAll() {
  return {
    "make/record-to-accepted-output.blueprint.json": buildMakeBlueprint(),
    "n8n/record-to-accepted-output.workflow.json": buildN8nWorkflow(),
    "fixtures/make/execution-period-n.json": makeExecutionFixture(periodNWebhookBody(), { id: "synthetic-make-exec-period-n" }),
    "fixtures/make/execution-period-n-incomplete.json": makeExecutionFixture(periodNWebhookBody(), { id: "synthetic-make-exec-incomplete", status: "incomplete" }),
    "fixtures/make/execution-schema-change.json": makeExecutionFixture(schemaChangeWebhookBody(), { id: "synthetic-make-exec-schema-change" }),
    "fixtures/n8n/execution-period-n.json": n8nExecutionFixture(periodNWebhookBody(), { id: "synthetic-n8n-exec-period-n" }),
    "fixtures/n8n/execution-period-n-error.json": n8nExecutionFixture(periodNWebhookBody(), { id: "synthetic-n8n-exec-error", status: "error" }),
    "fixtures/n8n/execution-schema-change.json": n8nExecutionFixture(schemaChangeWebhookBody(), { id: "synthetic-n8n-exec-schema-change" }),
  };
}

export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [rel, value] of Object.entries(buildAll())) {
    const target = join(root, rel);
    const text = serialize(value);
    if (check) {
      let current = null;
      try { current = readFileSync(target, "utf8"); } catch { current = null; }
      if (current !== text) { stale += 1; process.stderr.write(`stale: ${rel}\n`); }
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
  if (stale) process.exit(1);
  process.stdout.write(check ? "artifacts up to date\n" : "artifacts written\n");
}
