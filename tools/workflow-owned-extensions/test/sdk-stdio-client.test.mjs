import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { installConsumer } from "../src/acquire.mjs";
import { previewReuse } from "../../result-reuse/src/export.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const server = fileURLToPath(new URL("../runtime/mcp-stdio.mjs", import.meta.url));
const sdkPackage = JSON.parse(readFileSync(join(packageRoot, "node_modules/@modelcontextprotocol/client/package.json"), "utf8"));
const n45 = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/fitting-n45-page-change.json"), "utf8"));
const chat = JSON.parse(readFileSync(join(packageRoot, "fixtures/inputs/nonfitting-unrecognized-chat-task.json"), "utf8"));
const sourceCommit = "c60641e8ff2b94dd704307e57f5b6fe789ba0df7";
const previewOptions = {
  taskId: "n45-example-com",
  subject: "n45-example-com-result",
  sequence: 1,
  clock: "2026-09-09T08:00:00.000Z",
};

function prefix() {
  const store = mkdtempSync(join(tmpdir(), "woe-sdk-"));
  const acquired = installConsumer({
    consumer: "mcp",
    site: "ein-llc",
    store,
    sourceCommit,
    clock: "2026-11-06T12:00:00.000Z",
  });
  assert.equal(acquired.ok, true, acquired.message);
  return join(store, "mcp", "prefix");
}

function transport(prepared) {
  return new StdioClientTransport({
    command: process.execPath,
    args: [server, "--prefix", prepared],
    stderr: "pipe",
    env: { PATH: process.env.PATH || "" },
  });
}

function argumentsFor(input) {
  return {
    input_json: input,
    task_id: previewOptions.taskId,
    subject: previewOptions.subject,
    sequence: previewOptions.sequence,
    clock: previewOptions.clock,
  };
}

function bodyOf(result) {
  assert.equal(result.isError, false, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}

test("official SDK stdio client initializes, lists, and calls", { timeout: 20000 }, async () => {
  assert.equal(sdkPackage.version, "2.4.0");
  const prepared = prefix();
  const client = new Client({ name: "samedaydesk-sdk-conformance", version: sdkPackage.version });
  const pipe = transport(prepared);
  let stderr = "";
  pipe.stderr.setEncoding("utf8");
  pipe.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    await client.connect(pipe);
    assert.equal(client.getProtocolEra(), "legacy");
    assert.equal(client.getNegotiatedProtocolVersion(), "2025-11-25");
    assert.deepEqual(client.getServerVersion(), { name: "samedaydesk-result-reuse", version: "0.1.0" });
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), [
      "preview_reuse",
      "export_reuse",
      "decide_or_reuse",
    ]);
    const fitting = bodyOf(await client.callTool({ name: "preview_reuse", arguments: argumentsFor(n45) }));
    assert.equal(fitting.fitting, true);
    assert.equal(fitting.published, false);
    assert.deepEqual(fitting.observation, previewReuse(n45, previewOptions).observation);
    const nonfitting = bodyOf(await client.callTool({ name: "preview_reuse", arguments: argumentsFor(chat) }));
    assert.equal(nonfitting.fitting, false);
    assert.equal(nonfitting.observation, null);
    assert.equal(nonfitting.selectedRuntime.ran, true);
    assert.match(stderr, /listening on stdio/);
  } finally {
    await client.close();
  }
});

test("official SDK stdio client negotiates 2026-07-28", { timeout: 20000 }, async () => {
  const prepared = prefix();
  const client = new Client(
    { name: "samedaydesk-sdk-conformance", version: sdkPackage.version },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const pipe = transport(prepared);
  try {
    await client.connect(pipe);
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    assert.deepEqual(client.getServerVersion(), { name: "samedaydesk-result-reuse", version: "0.1.0" });
    assert.deepEqual(client.getDiscoverResult().supportedVersions, ["2026-07-28"]);
    const listed = await client.listTools();
    assert.equal(listed.tools.some((tool) => tool.name === "preview_reuse"), true);
    const fitting = bodyOf(await client.callTool({ name: "preview_reuse", arguments: argumentsFor(n45) }));
    assert.equal(fitting.fitting, true);
    assert.equal(fitting.published, false);
  } finally {
    await client.close();
  }
});
