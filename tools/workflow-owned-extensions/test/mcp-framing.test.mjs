import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decodeMessages, encodeMessage } from "../src/mcp-framing.mjs";

const server = fileURLToPath(new URL("../runtime/mcp-stdio.mjs", import.meta.url));

test("MCP stdio round-trips Content-Length frames", () => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const framed = encodeMessage(body);
  assert.equal(framed.startsWith("Content-Length:"), true);
  assert.equal(framed.includes("\r\n\r\n"), true);
  assert.deepEqual(decodeMessages(framed), [body]);
});

test("newline-delimited JSON is not an MCP stdio frame", () => {
  const line = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
  assert.deepEqual(decodeMessages(line), []);
  const child = spawnSync(process.execPath, [server], { input: line, encoding: "utf8" });
  assert.notEqual(child.status, 0);
  const frames = decodeMessages(child.stdout || "");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].error.code, -32700);
  assert.match(frames[0].error.message, /Content-Length/);
});

test("empty MCP stdio input exits without a tool call", () => {
  const child = spawnSync(process.execPath, [server], { input: "", encoding: "utf8" });
  assert.equal(child.status, 0);
  assert.equal(child.stdout, "");
});
