import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.mjs";

export function sink() {
  const chunks = [];
  return {
    chunks,
    write(chunk, callback) { chunks.push(String(chunk)); callback?.(); return true; },
    on() {},
    lines() { return chunks.join("").split("\n").filter(Boolean).map(line => JSON.parse(line)); },
  };
}

export function json(status, value, headers = { "content-type": "application/json; charset=utf-8" }) {
  return new Response(typeof value === "string" ? value : JSON.stringify(value), { status, headers });
}

// Injected fetch: each entry answers one call in order, and every call is recorded.
export function fakeFetch(answers) {
  const calls = [];
  const queue = [...answers];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body), redirect: init.redirect });
    const next = queue.shift();
    if (!next) throw new TypeError("fetch failed");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
  return { fetch, calls };
}

export async function run(argv, { answers = [], stdin, now, clientIo, signal } = {}) {
  const original = globalThis.fetch;
  const { fetch, calls } = fakeFetch(answers);
  globalThis.fetch = fetch;
  const stdout = sink();
  const stderr = sink();
  const sleeps = [];
  try {
    const exit = await main(argv, { stdout, stderr, stdin, clientIo, signal, sleep: async ms => { sleeps.push(ms); }, now: now ?? (() => new Date("2026-11-12T10:00:00.000Z")) });
    return { exit, out: stdout.lines(), err: stderr.lines(), calls, sleeps };
  } finally {
    globalThis.fetch = original;
  }
}

export function tempDir() {
  return mkdtempSync(join(tmpdir(), "sds-cli-test-"));
}

export const REPORT = Object.freeze({ schema: "agent-readiness.report.v1", host: "example.com", free: true, score: 71, checks: [{ id: "llms-txt", status: "pass" }], topFixes: [] });
