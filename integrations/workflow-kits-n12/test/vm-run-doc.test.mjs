import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import { root as PKG_ROOT, readJson, readText } from "./helpers.mjs";

const doc = readText("VM-RUN.md");
const blocks = [...doc.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
const required = blocks[0];
const workflow = readJson("n8n/record-to-accepted-output.workflow.json");

describe("VM-RUN.md required block", () => {
  test("sparse checkout precedes the first checkout, and no per-commit placeholder", () => {
    const sparse = required.indexOf("git sparse-checkout set integrations/workflow-kits-n12");
    const checkout = required.search(/^git checkout /m);
    assert.ok(sparse >= 0 && checkout > sparse, "sparse-checkout must come before checkout");
    assert.doesNotMatch(doc, /<HEAD_SHA>/);
    assert.match(required, /git rev-parse FETCH_HEAD/);
  });

  test("every script it runs exists", () => {
    for (const [, script] of required.matchAll(/^node (scripts\/[\w.-]+\.mjs)/gm)) {
      assert.ok(existsSync(join(PKG_ROOT, script)), script);
    }
  });
});

describe("VM-RUN.md optional n8n step resolves", () => {
  const n8nBlock = blocks.find((b) => b.includes("n8n@"));

  test("referenced files exist", () => {
    for (const f of ["bin/serve.mjs", "n8n/record-to-accepted-output.workflow.json"]) {
      assert.ok(n8nBlock.includes(f), `doc references ${f}`);
      assert.ok(existsSync(join(PKG_ROOT, f)), f);
    }
  });

  test("Kit Settings edit targets the clientEndpoint assignment", () => {
    assert.match(n8nBlock, /name === "Kit Settings"\)\.parameters\.assignments\.assignments\[0\]\.value/);
    const node = workflow.nodes.find((n) => n.name === "Kit Settings");
    assert.equal(node.parameters.assignments.assignments[0].name, "clientEndpoint");
  });

  test("webhook URL path matches the workflow's webhook node", () => {
    const [, path] = n8nBlock.match(/127\.0\.0\.1:5678\/webhook\/([\w-]+)/);
    const hook = workflow.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
    assert.equal(hook.parameters.path, path);
  });

  test("every named import in the doc's node snippets is a real export", async () => {
    const imports = [...n8nBlock.matchAll(/import \{([^}]+)\} from "\.\/([^"]+)"/g)];
    assert.ok(imports.length > 0);
    for (const [, names, rel] of imports) {
      const mod = await import(pathToFileURL(join(PKG_ROOT, rel)).href);
      for (const name of names.split(",").map((s) => s.trim()).filter(Boolean)) {
        assert.equal(typeof mod[name], "function", `${rel} exports ${name}`);
      }
    }
  });

  test("periodNWebhookBody yields the period the workflow posts", async () => {
    const { periodNWebhookBody } = await import(pathToFileURL(join(PKG_ROOT, "scripts/build-artifacts.mjs")).href);
    const body = periodNWebhookBody();
    for (const k of ["periodId", "taskId", "contextId", "termsInput", "capture", "caller"]) assert.ok(k in body.period, k);
    JSON.stringify(body);
  });
});

describe("IMPORTS.md receipts", () => {
  const imports = readText("IMPORTS.md");

  test("records the n8n Cloud QA import, readback and cleanup", () => {
    assert.match(imports, /n8n Cloud QA import, received/);
    assert.match(imports, /783f0841d56a44acd4dcce1b5a29a5060e04824b/);
    assert.match(imports, /n8n\/record-to-accepted-output\.workflow\.json/);
    assert.match(imports, /119262 bytes/);
    assert.match(imports, /4a7d556b9720a64637bb1811b48284035a37a2f063961d7351559bdba694362b/);
    assert.match(imports, /CREATE 200/);
    assert.match(imports, /2026-11-12T11:24:30\.213Z/);
    assert.match(imports, /0ouvpy0FyuZ1WkIe/);
    assert.match(imports, /GET 200/);
    assert.match(imports, /15 nodes/);
    assert.match(imports, /active` false/);
    assert.match(imports, /DELETE 200/);
    assert.match(imports, /GET 404/);
    assert.match(imports, /2026-11-12T11:24:34\.609Z/);
    assert.match(imports, /Nothing was executed/);
  });

  test("records that Make has no hosted import and that VM2 passed the kit tests", () => {
    assert.match(imports, /No hosted import yet/);
    assert.match(imports, /113\/113 node tests/);
    assert.match(imports, /n12-root-vm2-second-1124/);
  });

  test("states the meaning of import acceptance and has no go-ahead language", () => {
    assert.match(imports, /import acceptance means the workflow was imported, read back and deleted/i);
    assert.match(imports, /not an executed hosted workflow/);
    assert.match(imports, /not paid or commercial acceptance/);
    assert.doesNotMatch(imports, /go-ahead/i);
  });
});
