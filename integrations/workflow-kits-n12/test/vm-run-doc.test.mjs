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

describe("IMPORTS.md receipt template", () => {
  const imports = readText("IMPORTS.md");
  test("has the required fields and no filled values", () => {
    for (const f of ["Platform", "File sha256", "Import time", "Readback time", "Active", "Import warnings", "Cleanup time", "Confirmation"]) {
      assert.match(imports, new RegExp(`\\| ${f}`), f);
    }
    for (const label of ["Workflow id", "Scenario id", "Import time", "Cleanup time"]) {
      for (const row of imports.split("\n").filter((l) => l.startsWith(`| ${label} `))) assert.match(row, /\| TBD/, row);
    }
  });
});
