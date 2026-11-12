#!/usr/bin/env node
/**
 * Build the importable Make blueprint, the importable n8n workflow and the synthetic
 * period requests for the changed-period recipe. Deterministic; the tests and
 * --check verify that the committed files equal this output.
 *
 *   node scripts/build-artifacts.mjs           write the files
 *   node scripts/build-artifacts.mjs --check   exit 1 if a committed file differs
 *
 * Both artifacts: webhook trigger only, no credentials, no schedule, not active,
 * client endpoint https://client.example.invalid/... until an operator sets their own.
 * The declared mapping registry (config/mapping-registry.json) is embedded as JSON
 * text in one settings node or module, so adapting to a changed period is one
 * explicit edit there.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLIENT_ENDPOINT, REQUEST_KIND } from "../src/client-endpoint.mjs";
import { buildFixtures, mappingRegistry } from "../src/fixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MAKE_PATH = "make/changed-period.blueprint.json";
export const N8N_PATH = "n8n/changed-period.workflow.json";
export const NAME = "SameDayDesk changed period, record to accepted output (workflow-kits-n12-changed-period)";
export const WEBHOOK_PATH = "samedaydesk-changed-period";

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
      ca: "", qs: [], url: `${CLIENT_ENDPOINT}${path}`, gzip: true, method: "post", headers, timeout: "",
      useMtls: false, authPass: "", authUser: "", bodyType: "raw", contentType: "application/json", data,
      serializeUrl: false, shareCookies: false, parseResponse: true, followRedirect: true, useQuerystring: false,
      followAllRedirects: false, rejectUnauthorized: true,
    },
    metadata: { designer: { x, y, name } },
  };
}

function makeJson(id, name, object, x, y) {
  return { id, module: "json:TransformToJSON", version: 1, parameters: { space: "" }, mapper: { object }, metadata: { designer: { x, y, name } } };
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

const APPLY_DATA = (m) => `{"ledgerKey":"{{${m}.ledgerKey}}","idempotencyKey":"{{${m}.idempotencyKey}}","recordKey":"{{${m}.recordKey}}","periodId":"{{5.data.periodId}}"}`;

export function buildMakeBlueprint(registry = mappingRegistry()) {
  return {
    name: NAME,
    flow: [
      { id: 1, module: "gateway:CustomWebHook", version: 1, parameters: { hook: null, maxResults: 1 }, mapper: {}, metadata: { designer: { x: 0, y: 0, name: "Receive Changed Period" } } },
      {
        id: 2,
        module: "util:SetVariable2",
        version: 1,
        parameters: {},
        mapper: { name: "mappings", scope: "roundtrip", value: JSON.stringify(registry) },
        metadata: { designer: { x: 300, y: 0, name: "Period Mappings" } },
      },
      makeJson(3, "Period JSON", "{{1.period}}", 600, 0),
      makeJson(4, "Records JSON", "{{1.records}}", 900, 0),
      makeHttp(5, "Evaluate Records", {
        path: "/evaluate",
        data: `{"kind":"${REQUEST_KIND}","platform":"make","period":{{3.json}},"records":{{4.json}},"mappings":{{2.mappings}}}`,
        x: 1200,
        y: 0,
      }),
      makeJson(6, "Evaluation JSON", "{{5.data}}", 1500, 0),
      {
        id: 7,
        module: "builtin:BasicRouter",
        version: 1,
        mapper: null,
        metadata: { designer: { x: 1800, y: 0, name: "Config Valid?" } },
        routes: [
          {
            flow: [
              makeRespond(8, "Respond Config Errors", {
                status: 422,
                body: "{{6.json}}",
                x: 2100,
                y: 300,
                filter: { name: "Config invalid", conditions: [[{ a: "{{5.data.ok}}", b: "false", o: "boolean:equal" }]] },
              }),
            ],
          },
          {
            flow: [
              makeRespond(9, "Respond Evaluation", {
                status: 200,
                body: "{{6.json}}",
                x: 2100,
                y: 0,
                filter: { name: "Config valid", conditions: [[{ a: "{{5.data.ok}}", b: "true", o: "boolean:equal" }]] },
              }),
              { id: 10, module: "builtin:BasicFeeder", version: 1, parameters: {}, mapper: { array: "{{5.data.records}}" }, metadata: { designer: { x: 2400, y: 0, name: "One Bundle Per Record" } } },
              {
                id: 11,
                module: "builtin:BasicRouter",
                version: 1,
                mapper: null,
                metadata: { designer: { x: 2700, y: 0, name: "Route Record" } },
                routes: [
                  {
                    flow: [
                      makeHttp(12, "Apply Accepted Record", {
                        path: "/apply",
                        idempotencyKey: "{{10.ledgerKey}}",
                        data: APPLY_DATA(10),
                        x: 3000,
                        y: -300,
                        filter: { name: "Ready", conditions: [[{ a: "{{10.outcome}}", b: "ready", o: "text:equal" }]] },
                      }),
                    ],
                  },
                  {
                    flow: [
                      {
                        id: 13,
                        module: "util:FunctionSleep",
                        version: 1,
                        parameters: {},
                        filter: {
                          name: "Replayable",
                          conditions: [[
                            { a: "{{10.retryable}}", b: "true", o: "boolean:equal" },
                            { a: "{{10.sameIdempotencyKey}}", o: "exist" },
                          ]],
                        },
                        mapper: { duration: "60" },
                        metadata: { designer: { x: 3000, y: 0, name: "Wait Before Replay" } },
                      },
                      makeHttp(14, "Replay Same Key", {
                        path: "/replay",
                        idempotencyKey: "{{10.sameIdempotencyKey}}",
                        data: '{"idempotencyKey":"{{10.sameIdempotencyKey}}","recordKey":"{{10.recordKey}}"}',
                        x: 3300,
                        y: 0,
                      }),
                      makeHttp(15, "Apply Replayed Record", {
                        path: "/apply",
                        idempotencyKey: "{{14.data.record.ledgerKey}}",
                        data: '{"ledgerKey":"{{14.data.record.ledgerKey}}","idempotencyKey":"{{14.data.record.idempotencyKey}}","recordKey":"{{14.data.record.recordKey}}","periodId":"{{5.data.periodId}}"}',
                        x: 3600,
                        y: 0,
                        filter: { name: "Replay ready", conditions: [[{ a: "{{14.data.record.outcome}}", b: "ready", o: "text:equal" }]] },
                      }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    metadata: {
      instant: true,
      version: 1,
      scenario: {
        roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true, sequential: true,
        slots: null, confidential: false, dataloss: false, dlq: false, freshVariables: false,
      },
      designer: { orphans: [] },
      zone: "us2.make.com",
    },
  };
}

// ---------- n8n ----------

const uid = (n) => `5d2a7c10-3e4b-4f8a-9b1c-${String(n).padStart(12, "0")}`;
const ENDPOINT_EXPR = "$('Kit Settings').first().json.clientEndpoint";
const TRIGGER = "Receive Changed Period";

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
        conditions: [{ id: uid(100 + n), leftValue, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    },
  };
}

function n8nHttp(n, name, { route, idempotencyKey = null, jsonBody, position }) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    parameters: {
      method: "POST",
      url: `={{ ${ENDPOINT_EXPR} }}${route}`,
      sendHeaders: idempotencyKey !== null,
      ...(idempotencyKey !== null ? { headerParameters: { parameters: [{ name: "Idempotency-Key", value: idempotencyKey }] } } : {}),
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: {},
    },
  };
}

function n8nRespond(n, name, { code, position }) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position,
    parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseCode: code } },
  };
}

function n8nSet(n, name, assignments, position) {
  return {
    id: uid(n),
    name,
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position,
    parameters: {
      assignments: { assignments: assignments.map((a, i) => ({ id: uid(200 + n * 10 + i), name: a.name, value: a.value, type: "string" })) },
      includeOtherFields: true,
      options: {},
    },
  };
}

const applyBody = (prefix) =>
  `={{ JSON.stringify({ ledgerKey: ${prefix}.ledgerKey, idempotencyKey: ${prefix}.idempotencyKey, recordKey: ${prefix}.recordKey, periodId: $('Evaluate Records').first().json.periodId }) }}`;

export function buildN8nWorkflow(registry = mappingRegistry()) {
  const nodes = [
    {
      id: uid(1),
      name: TRIGGER,
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: uid(1001),
      parameters: { httpMethod: "POST", path: WEBHOOK_PATH, responseMode: "responseNode", options: {} },
    },
    n8nSet(2, "Kit Settings", [{ name: "clientEndpoint", value: CLIENT_ENDPOINT }], [220, 0]),
    n8nSet(3, "Period Mappings", [{ name: "mappingsJson", value: JSON.stringify(registry) }], [440, 0]),
    n8nHttp(4, "Evaluate Records", {
      route: "/evaluate",
      jsonBody: `={{ JSON.stringify({ kind: "${REQUEST_KIND}", platform: "n8n", period: $('${TRIGGER}').first().json.body.period, records: $('${TRIGGER}').first().json.body.records, mappings: JSON.parse($('Period Mappings').first().json.mappingsJson) }) }}`,
      position: [660, 0],
    }),
    n8nIf(5, "Config Valid?", "={{ $json.ok === true }}", [880, 0]),
    n8nRespond(6, "Respond Config Errors", { code: 422, position: [1100, 300] }),
    n8nRespond(7, "Respond Evaluation", { code: 200, position: [1100, 0] }),
    {
      id: uid(8),
      name: "One Item Per Record",
      type: "n8n-nodes-base.splitOut",
      typeVersion: 1,
      position: [1320, 0],
      parameters: { fieldToSplitOut: "records", options: {} },
    },
    n8nIf(9, "Ready To Apply?", "={{ $json.outcome === 'ready' }}", [1540, 0]),
    n8nHttp(10, "Apply Accepted Record", { route: "/apply", idempotencyKey: "={{ $json.ledgerKey }}", jsonBody: applyBody("$json"), position: [1760, -200] }),
    n8nIf(11, "Replayable?", "={{ $json.retryable === true && Boolean($json.sameIdempotencyKey) }}", [1760, 200]),
    {
      id: uid(12),
      name: "Wait Before Replay",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [1980, 200],
      webhookId: uid(1012),
      parameters: { amount: 60, unit: "seconds" },
    },
    n8nHttp(13, "Replay Same Key", {
      route: "/replay",
      idempotencyKey: "={{ $json.sameIdempotencyKey }}",
      jsonBody: "={{ JSON.stringify({ idempotencyKey: $json.sameIdempotencyKey, recordKey: $json.recordKey }) }}",
      position: [2200, 200],
    }),
    n8nIf(14, "Replay Ready?", "={{ $json.record.outcome === 'ready' }}", [2420, 200]),
    n8nHttp(15, "Apply Replayed Record", { route: "/apply", idempotencyKey: "={{ $json.record.ledgerKey }}", jsonBody: applyBody("$json.record"), position: [2640, 200] }),
  ];
  const link = (node) => ({ node, type: "main", index: 0 });
  const connections = {
    [TRIGGER]: { main: [[link("Kit Settings")]] },
    "Kit Settings": { main: [[link("Period Mappings")]] },
    "Period Mappings": { main: [[link("Evaluate Records")]] },
    "Evaluate Records": { main: [[link("Config Valid?")]] },
    "Config Valid?": { main: [[link("Respond Evaluation")], [link("Respond Config Errors")]] },
    "Respond Evaluation": { main: [[link("One Item Per Record")]] },
    "One Item Per Record": { main: [[link("Ready To Apply?")]] },
    "Ready To Apply?": { main: [[link("Apply Accepted Record")], [link("Replayable?")]] },
    "Replayable?": { main: [[link("Wait Before Replay")], []] },
    "Wait Before Replay": { main: [[link("Replay Same Key")]] },
    "Replay Same Key": { main: [[link("Replay Ready?")]] },
    "Replay Ready?": { main: [[link("Apply Replayed Record")], []] },
  };
  return {
    name: NAME,
    nodes,
    connections,
    settings: { executionOrder: "v1", saveDataSuccessExecution: "all", saveDataErrorExecution: "all", saveManualExecutions: true },
    pinData: {},
  };
}

export function buildAll({ registry = mappingRegistry() } = {}) {
  return {
    [MAKE_PATH]: buildMakeBlueprint(registry),
    [N8N_PATH]: buildN8nWorkflow(registry),
    ...buildFixtures(),
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
