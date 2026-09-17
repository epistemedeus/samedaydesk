import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { classifyResponse } from "./classify-http.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function expand(value, ctx) {
  return String(value).replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
    if (ctx[key] == null) throw new Error(`unknown_placeholder:${key}`);
    return String(ctx[key]);
  });
}

function spawnArgv(argv, { cwd, timeoutMs }) {
  const [cmd, ...args] = argv;
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, PAYMENT_SENT: "false" },
  });
  const json = parseJsonLoose(result.stdout) || parseJsonLoose(result.stderr);
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    exitCode: timedOut ? 124 : result.status == null ? 64 : result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
    timedOut,
  };
}

function mockExpressRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    type(value) {
      this.headers["content-type"] = value.includes("/") ? value : `text/${value}`;
      return this;
    },
    send(body) {
      this.body = String(body);
      this.ended = true;
      return this;
    },
    sendFile(filePath, cb) {
      try {
        this.body = readFileSync(filePath, "utf8");
        this.ended = true;
        if (!this.headers["content-type"]) this.headers["content-type"] = "text/html";
        cb?.();
      } catch (err) {
        cb?.(err);
      }
      return this;
    },
  };
  return res;
}

async function runSpaUnknown(spec, ctx) {
  const { createSpaFallback } = await import(join(ctx.root, "server/lib/spa-fallback.js"));
  const { NOT_FOUND_SHELL, ROUTE_SHELL_DIR, shellFileName } = await import(
    join(ctx.root, "server/lib/spa-route-shells.js")
  );
  const dist = mkdtempSync(join(tmpdir(), "sds-corpus-spa-"));
  try {
    writeFileSync(
      join(dist, "index.html"),
      "<!doctype html><html><head><title>SameDayDesk: agent commerce, built and shipped</title></head><body>spa</body></html>\n",
    );
    mkdirSync(join(dist, ROUTE_SHELL_DIR), { recursive: true });
    const notFound = `<!doctype html><html><head><title>${NOT_FOUND_SHELL.title}</title></head><body>requested page does not exist</body></html>`;
    writeFileSync(join(dist, ROUTE_SHELL_DIR, shellFileName(NOT_FOUND_SHELL.path)), notFound);
    const fallback = createSpaFallback(dist);
    const path = spec.execute.path || "/this-path-does-not-exist-xyz";
    const res = mockExpressRes();
    await new Promise((resolve, reject) => {
      fallback({ method: "GET", path }, res, (err) => (err ? reject(err) : resolve()));
      if (res.ended) resolve();
    });
    return {
      exitCode: 0,
      json: {
        ok: res.statusCode === 200,
        status: res.statusCode,
        contentType: res.headers["content-type"] || "",
        body: res.body,
      },
      httpStatus: res.statusCode,
      kind: res.statusCode === 200 ? "ok" : "http_error",
      body: res.body,
      destExists: null,
      timedOut: false,
    };
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

async function runKind(loaded, ctx) {
  const spec = loaded.spec;
  const kind = spec.execute.kind;

  if (kind === "spawn" || kind === "kit-spawn") {
    if (kind === "kit-spawn") ctx.kit = ensureUsefulJobsKit(ctx.root);
    const argv = spec.execute.argv.map((item) => expand(item, ctx));
    const dest = spec.execute.dest ? expand(spec.execute.dest, ctx) : null;
    const spawned = spawnArgv(argv, {
      cwd: ctx.root,
      timeoutMs: spec.execute.timeoutMs || 30_000,
    });
    return {
      ...spawned,
      destExists: dest ? existsSync(dest) : null,
      argv,
    };
  }

  if (kind === "classify-http") {
    const fixturePath = join(loaded.dir, spec.execute.fixture || "response.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const kindName = classifyResponse(fixture);
    const ok = kindName === "ok";
    return {
      exitCode: 0,
      json: {
        ok,
        kind: kindName,
        status: fixture.status,
        body: fixture.body,
      },
      httpStatus: fixture.status,
      kind: kindName,
      body: fixture.body,
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "spa-unknown") {
    return runSpaUnknown(spec, ctx);
  }

  if (kind === "mcp-required-tools") {
    const { MCP_TOOL_NAMES } = await import(join(ctx.root, "server/lib/mcp-tool-inventory.js"));
    const required = [...MCP_TOOL_NAMES, ...(spec.execute.requiredExtra || [])];
    const missing = required.filter((name) => !MCP_TOOL_NAMES.includes(name));
    return {
      exitCode: missing.length === 0 ? 0 : 1,
      json: {
        ok: missing.length === 0,
        tools: [...MCP_TOOL_NAMES],
        required,
        missing,
        toolsCalled: false,
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "presence-offline") {
    const { resolveForAgentsColdRead } = await import(
      join(ctx.root, "tools/presence/for-agents-cold-read.mjs")
    );
    const result = await resolveForAgentsColdRead({
      preferFixture: true,
      fetchImpl: () => {
        throw new Error("network forbidden");
      },
    });
    const ok = result.outcome === "offline_fixture" && result.paid === false && result.liveObserved === false;
    return {
      exitCode: ok ? 0 : 1,
      json: {
        ok,
        outcome: result.outcome,
        paid: result.paid,
        liveObserved: result.liveObserved,
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "payment-replay") {
    const { inspectPaymentAuthority } = await import(
      join(ctx.root, "tools/recurring-job-recipes/lib/payment-guard.mjs")
    );
    const result = inspectPaymentAuthority(
      { payment: { attempted: true, receiptId: "corpus-receipt", charged: true } },
      { replayPayment: true },
    );
    return {
      exitCode: result.ok ? 0 : 1,
      json: {
        ok: result.ok,
        code: result.code,
        replayBlocked: result.replayBlocked,
        attempted: result.attempted,
      },
      destExists: null,
      timedOut: false,
    };
  }

  throw new Error(`unknown_execute_kind:${kind}`);
}

export async function executeCase(loaded, { root }) {
  const spec = loaded.spec;
  const kind = spec.execute.kind;
  const needsTmp = kind === "spawn" || kind === "kit-spawn";
  const tmp = needsTmp ? mkdtempSync(join(tmpdir(), `sds-corpus-${process.pid}-${spec.id}-`)) : "";
  const ctx = {
    root,
    case: loaded.dir,
    tmp,
    node: process.execPath,
    kit: "",
  };
  try {
    const observed = await runKind(loaded, ctx);
    return { ...observed, timedOut: Boolean(observed.timedOut) };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
