import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decodeMessages, encodeMessage } from "../src/mcp-framing.mjs";

const server = fileURLToPath(new URL("../runtime/mcp-stdio.mjs", import.meta.url));

function initializeMessage(id = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "framing-test", version: "0" },
    },
  };
}

function spawnServer() {
  const child = spawn(process.execPath, [server], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return {
    child,
    text: () => ({ stdout, stderr }),
  };
}

function waitForLines(child, text, count) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${count} stdout lines: ${JSON.stringify(text())}`));
    }, 3000);
    const check = () => {
      const lines = text().stdout.split("\n").filter((line) => line.trim() !== "");
      if (lines.length < count) return;
      clearTimeout(timer);
      child.stdout.off("data", check);
      resolve(lines.slice(0, count).map((line) => JSON.parse(line)));
    };
    child.stdout.on("data", check);
    check();
  });
}

test("MCP stdio round-trips one JSON object per line", () => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const framed = encodeMessage(body);
  assert.equal(framed.endsWith("\n"), true);
  assert.equal(framed.includes("Content-Length"), false);
  assert.equal(framed.includes("\r\n\r\n"), false);
  assert.deepEqual(decodeMessages(framed), [body]);
  assert.deepEqual(decodeMessages(framed + framed), [body, body]);
});

test("fragmented and coalesced stdin answers before EOF", async () => {
  const { child, text } = spawnServer();
  try {
    const first = encodeMessage(initializeMessage(1));
    child.stdin.write(first.slice(0, 7));
    child.stdin.write(first.slice(7));
    const opened = await waitForLines(child, text, 1);
    assert.equal(opened[0].id, 1);
    assert.equal(opened[0].result.protocolVersion, "2025-11-25");
    assert.equal(opened[0].result.serverInfo.name, "samedaydesk-result-reuse");

    const coalesced = encodeMessage({ jsonrpc: "2.0", method: "notifications/initialized" })
      + encodeMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" })
      + encodeMessage({ jsonrpc: "2.0", id: 3, method: "ping" });
    child.stdin.write(coalesced);
    const rest = await waitForLines(child, text, 3);
    assert.equal(rest[1].id, 2);
    assert.deepEqual(rest[1].result.tools.map((tool) => tool.name), [
      "preview_reuse",
      "export_reuse",
      "decide_or_reuse",
    ]);
    assert.equal(rest[2].id, 3);
    assert.deepEqual(rest[2].result, {});
    assert.equal(text().stdout.includes("listening on stdio"), false);
    assert.match(text().stderr, /listening on stdio/);
    child.stdin.end();
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
  } finally {
    if (child.exitCode == null) child.kill();
  }
});

test("a Content-Length frame is not an MCP stdio success", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const { child, text } = spawnServer();
  child.stdin.end(frame);
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  const messages = decodeMessages(text().stdout);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].error.code, -32700);
  assert.match(messages[0].error.message, /newline-delimited JSON/);
  assert.equal(text().stdout.includes("preview_reuse"), false);
});

test("malformed JSON returns a parse error and exits", async () => {
  const { child, text } = spawnServer();
  child.stdin.end("{not-json\n");
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  const messages = decodeMessages(text().stdout);
  assert.equal(messages[0].error.code, -32700);
  assert.equal(messages[0].id, null);
});

test("an unsupported modern version is refused without leaving the legacy handshake", async () => {
  const { child, text } = spawnServer();
  try {
    const modern = {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "1900-01-01",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    child.stdin.write(encodeMessage(modern));
    const refused = await waitForLines(child, text, 1);
    assert.equal(refused[0].id, 9);
    assert.equal(refused[0].error.code, -32022);
    assert.deepEqual(refused[0].error.data.supported, ["2026-07-28"]);
    assert.equal(refused[0].error.data.requested, "1900-01-01");
    child.stdin.write(encodeMessage(initializeMessage(4)));
    const opened = await waitForLines(child, text, 2);
    assert.equal(opened[1].id, 4);
    assert.equal(opened[1].result.protocolVersion, "2025-11-25");
    child.stdin.end();
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
  } finally {
    if (child.exitCode == null) child.kill();
  }
});

test("clean EOF exits without a tool call", async () => {
  const { child, text } = spawnServer();
  child.stdin.end();
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.equal(text().stdout, "");
  assert.match(text().stderr, /listening on stdio/);
});
