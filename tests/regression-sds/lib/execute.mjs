import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { classifyResponse } from "./classify-http.mjs";

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
    json(body) {
      this.body = JSON.stringify(body);
      this.ended = true;
      if (!this.headers["content-type"]) this.headers["content-type"] = "application/json";
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
  const dist = mkdtempSync(join(tmpdir(), "sds-regression-spa-"));
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

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, port: server.address().port };
}

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const json = await response.json();
  return { status: response.status, json };
}

async function runKind(loaded, ctx) {
  const spec = loaded.spec;
  const kind = spec.execute.kind;

  if (kind === "spawn") {
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

  if (kind === "soft-404-capture") {
    const fixturePath = join(loaded.dir, spec.execute.fixture || "response.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const path = fixture.path || spec.execute.path || "";
    const body = String(fixture.body || "");
    const homepageLike =
      /SameDayDesk/i.test(body) && (/canonical/i.test(body) || /samedaydesk\.com\/["']/i.test(body));
    const isSoft404 = fixture.status === 200 && path !== "/" && homepageLike;
    return {
      exitCode: 0,
      json: {
        ok: !isSoft404,
        kind: isSoft404 ? "soft_404" : classifyResponse(fixture),
        status: fixture.status,
        path,
        homepageLike,
      },
      httpStatus: fixture.status,
      kind: isSoft404 ? "soft_404" : classifyResponse(fixture),
      body,
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

  if (kind === "pr18-unread") {
    const { inspectPr18Fixtures } = await import(
      join(ctx.root, "tools/lqtrack1/replay-pr18-disposition.mjs")
    );
    const pr18 = inspectPr18Fixtures();
    const defect =
      pr18.present === true &&
      pr18.inMemoryStore === true &&
      pr18.listingUnread === true &&
      pr18.runtimeImportCount === 0;
    return {
      exitCode: defect ? 1 : 0,
      json: {
        ok: !defect,
        present: pr18.present,
        inMemoryStore: pr18.inMemoryStore,
        listingAssigned: pr18.listingAssigned,
        listingReadCount: pr18.listingReadCount,
        listingUnread: pr18.listingUnread,
        runtimeImportCount: pr18.runtimeImportCount,
        ref: pr18.ref,
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "s125-canonicalize") {
    const { canonicalizeMcpToolCallsObservedFrom, MCP_TOOL_OBSERVED_FROM_WIRE_RE } = await import(
      join(ctx.root, "server/lib/pulse-store/schema.js")
    );
    const pgEcho = "2026-09-02T12:00:00+00:00";
    const wire = canonicalizeMcpToolCallsObservedFrom(pgEcho);
    const rawWouldFail = !MCP_TOOL_OBSERVED_FROM_WIRE_RE.test(pgEcho);
    const repaired = MCP_TOOL_OBSERVED_FROM_WIRE_RE.test(wire) && wire === "2026-09-02T12:00:00.000Z";
    return {
      exitCode: repaired ? 0 : 1,
      json: {
        ok: repaired,
        pgEcho,
        wire,
        rawWouldFail,
        repaired,
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "pulse-rpc-payload") {
    const { deltaToRpcPayload, containsRawRequestData, validateDelta, emptyDelta } = await import(
      join(ctx.root, "server/lib/pulse-store/schema.js")
    );
    const payload = deltaToRpcPayload(validateDelta(emptyDelta("2026-01-01T00:00:00.000Z")));
    const leak = "uniqueHumans" in payload || containsRawRequestData(payload);
    return {
      exitCode: leak ? 1 : 0,
      json: {
        ok: !leak,
        uniqueHumans: "uniqueHumans" in payload,
        rawRequestData: containsRawRequestData(payload),
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "source-canonical") {
    const page = readFileSync(join(ctx.root, "client/src/pages/AiReadiness.tsx"), "utf8");
    const index = readFileSync(join(ctx.root, "client/index.html"), "utf8");
    const setsCanonical = /rel=["']canonical["']/.test(page) || /property=["']og:url["']/.test(page);
    const homepageCanonicalHardcoded = /rel=["']canonical["'][^>]*href=["']https:\/\/samedaydesk\.com\/["']/.test(
      index,
    );
    const setsTitle = /document\.title\s*=/.test(page);
    const defect = setsTitle && !setsCanonical && homepageCanonicalHardcoded;
    return {
      exitCode: defect ? 1 : 0,
      json: {
        ok: !defect,
        setsTitle,
        setsCanonical,
        homepageCanonicalHardcoded,
        defect,
      },
      destExists: null,
      timedOut: false,
    };
  }

  if (kind === "correspondence-unconfigured") {
    const { inspectCorrespondenceEnv, mountCorrespondence } = await import(
      join(ctx.root, "server/lib/correspondence-mount.js")
    );
    const healthRouter = (await import(join(ctx.root, "server/routes/health.js"))).default;
    const requireRoot = createRequire(join(ctx.root, "package.json"));
    const express = requireRoot("express");
    const env = {
      NODE_ENV: "test",
    };
    const inspected = inspectCorrespondenceEnv(env);
    const app = express();
    const handle = mountCorrespondence(app, { env });
    app.use("/api", healthRouter);
    await handle.ready();
    const { server, port } = await listen(app);
    try {
      const health = await getJson(port, "/api/health");
      const ready = await getJson(port, "/api/correspondence/healthz");
      const ok =
        inspected.kind === "unconfigured" &&
        health.status === 200 &&
        health.json.ok === true &&
        health.json.service === "samedaydesk" &&
        ready.json.ok === false &&
        ready.json.enabled === false &&
        ready.json.reason === "unconfigured";
      return {
        exitCode: ok ? 0 : 1,
        json: {
          ok,
          inspectKind: inspected.kind,
          sdsHealth: health.status,
          sdsOk: health.json.ok,
          correspondenceEnabled: ready.json.enabled,
          correspondenceReason: ready.json.reason,
        },
        httpStatus: health.status,
        destExists: null,
        timedOut: false,
      };
    } finally {
      await handle.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }

  throw new Error(`unknown_execute_kind:${kind}`);
}

export async function executeCase(loaded, { root }) {
  const spec = loaded.spec;
  const kind = spec.execute.kind;
  const needsTmp = kind === "spawn";
  const tmp = needsTmp ? mkdtempSync(join(tmpdir(), `sds-regression-${process.pid}-${spec.id}-`)) : "";
  const ctx = {
    root,
    case: loaded.dir,
    tmp,
    node: process.execPath,
  };
  try {
    const observed = await runKind(loaded, ctx);
    return { ...observed, timedOut: Boolean(observed.timedOut) };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
