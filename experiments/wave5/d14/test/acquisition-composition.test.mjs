import assert from "node:assert/strict";
import http, { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createExecutionServer, listenExecutionServer } from "../../../../server/paid-useful-jobs/lib/http.mjs";
import { createStaticPrincipalAdapter, utcClock } from "../../../../server/paid-useful-jobs/lib/acquisition-http.mjs";
import { runPaidOffer } from "../../../../server/paid-useful-jobs/lib/wrapper.mjs";
import { createFileStore } from "../../../../tools/managed-useful-jobs-order/lib/store-file.mjs";
import { createPostgresStore } from "../../../../tools/managed-useful-jobs-order/lib/store-postgres.mjs";
import { createAcquisitionService, createForbiddenSeamSpies } from "../../../../tools/managed-useful-jobs-order/lib/acquisition.mjs";
import {
  postgresBinariesAvailable,
  startDisposablePostgres,
} from "../../../../tools/managed-useful-jobs-order/lib/pg-cluster.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  fileService,
} from "../../../../tools/managed-useful-jobs-order/test/acquisition-helpers.mjs";
import { FROZEN_REQUEST_HASH_VERSION } from "../../../../tools/managed-useful-jobs-order/lib/acquisition-constants.mjs";
import {
  digestNamedOutputs,
  hashHttpRequestAcquisitionV1,
  hashPublicationIdentityV1,
  publicationFieldsFromBody,
} from "../../../../tools/managed-useful-jobs-order/lib/acquisition-identity.mjs";
import { encodeExecuteRequest } from "../lib/encode-inputs.mjs";
import {
  createTicket,
  updateTicketAfterPost,
  writeTicketAtomic,
} from "../lib/ticket.mjs";
import { verifyTicketBoundResult } from "../lib/verify.mjs";
import { acquireHttpArtifacts } from "../lib/acquire.mjs";
import { getArtifact, getResult, postExecute } from "../lib/client.mjs";
import { resultIdentityHash } from "../lib/digest-named.mjs";
import { JOB_EXPECTED_OUTPUTS } from "../lib/pins.mjs";
import { ConsumerRefuse } from "../lib/errors.mjs";
import { runCliAsync, tmpWork } from "./helpers.mjs";

const VENDOR_BEFORE = join(
  process.cwd(),
  "experiments/wave5/d14/fixtures/caller/vendor-budget-impact/before.json",
);
const VENDOR_AFTER = join(
  process.cwd(),
  "experiments/wave5/d14/fixtures/caller/vendor-budget-impact/after.json",
);
const LOCK_BEFORE = join(process.cwd(), "tools/lockfile-pin-delta/fixtures/v2/before.json");
const LOCK_AFTER = join(process.cwd(), "tools/lockfile-pin-delta/fixtures/v2/after.json");

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function stripFinalNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function writeJobInputs(jobId, { newline, multibyte }) {
  const work = tmpWork(`h32-${jobId}-`);
  const srcBefore = readFileSync(jobId === "lockfile-pin-delta" ? LOCK_BEFORE : VENDOR_BEFORE, "utf8");
  const srcAfter = readFileSync(jobId === "lockfile-pin-delta" ? LOCK_AFTER : VENDOR_AFTER, "utf8");
  let before = stripFinalNewline(srcBefore);
  let after = stripFinalNewline(srcAfter);
  if (multibyte && jobId === "vendor-budget-impact") {
    const parsed = JSON.parse(before);
    parsed.note = `${parsed.note || ""} café 日本語 🎵`;
    before = JSON.stringify(parsed);
    const parsedAfter = JSON.parse(after);
    parsedAfter.note = `${parsedAfter.note || ""} café 日本語 🎵`;
    after = JSON.stringify(parsedAfter);
  }
  if (newline) {
    before = `${before}\n`;
    after = `${after}\n`;
  }
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, before);
  writeFileSync(afterPath, after);
  return { work, beforePath, afterPath, before, after };
}

async function startComposed({
  store,
  service,
  seams,
  maxActiveResponses = 8,
  responseTimeoutMs = 5_000,
  executeCalls,
} = {}) {
  const spies = seams || createForbiddenSeamSpies();
  const calls = executeCalls || { n: 0 };
  const bundle = createExecutionServer({
    execute: async (request) => {
      calls.n += 1;
      return runPaidOffer(request);
    },
    acquisition: {
      reader: service.reader,
      writer: service.writer,
      resolvePrincipal: createStaticPrincipalAdapter({
        "token-a": PRINCIPAL_A,
        "token-b": PRINCIPAL_B,
      }),
      clock: utcClock,
      forbiddenSeams: spies.spies,
      gate: service.maxConcurrentReads,
      maxActiveResponses,
      responseTimeoutMs,
      openTimeoutMs: 5_000,
    },
  });
  const addr = await listenExecutionServer(bundle.server, { host: "127.0.0.1", port: 0 });
  return {
    server: bundle.server,
    origin: addr.origin,
    acquisitionHandler: bundle.acquisitionHandler,
    seams: spies,
    executeCalls: calls,
    close: () => closeServer(bundle.server),
  };
}

async function reopenFileHost(dir, seams, executeCalls) {
  const store = createFileStore(dir);
  const service = createAcquisitionService({
    store,
    artifactRoot: store.artifactRoot,
    forbiddenSeams: seams.spies,
  });
  const host = await startComposed({ store, service, seams, executeCalls });
  return { store, service, host };
}

function listenProxy(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => closeServer(server),
      });
    });
  });
}

function proxyUpstream(req, upstreamOrigin, onResponse) {
  const upstream = new URL(upstreamOrigin);
  const up = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: upstream.host },
    },
    onResponse,
  );
  up.on("error", () => {
    try {
      req.socket?.destroy();
    } catch {
      /* already closed */
    }
  });
  req.pipe(up);
  return up;
}

async function startLostReplyProxy(upstreamOrigin) {
  return listenProxy((req, res) => {
    proxyUpstream(req, upstreamOrigin, (upRes) => {
      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        void Buffer.concat(chunks);
        if (!res.destroyed) res.destroy();
      });
      upRes.on("error", () => {
        if (!res.destroyed) res.destroy();
      });
    });
  });
}

async function startMutatingJsonProxy(upstreamOrigin, mutate) {
  return listenProxy((req, res) => {
    proxyUpstream(req, upstreamOrigin, (upRes) => {
      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        let body = Buffer.concat(chunks);
        const type = String(upRes.headers["content-type"] || "");
        if (type.includes("application/json")) {
          try {
            body = Buffer.from(`${JSON.stringify(mutate(JSON.parse(body.toString("utf8"))))}\n`);
          } catch {
            /* keep upstream bytes */
          }
        }
        const headers = { ...upRes.headers, "content-length": String(body.length) };
        delete headers["transfer-encoding"];
        if (!res.headersSent && !res.destroyed) {
          res.writeHead(upRes.statusCode, headers);
          res.end(body);
        }
      });
    });
  });
}

describe("H32 D14 submit → HA1 publish → restart → hosted fetch", { timeout: 180_000 }, () => {
  it("vendor-budget-impact: no-newline multibyte submit, pre-POST ticket survives an unpersisted successful response, file restart, second directory", async () => {
    const { service, store, seams, dir } = await fileService({ maxConcurrentReads: 4 });
    const executeCalls = { n: 0 };
    let host = await startComposed({ store, service, seams, executeCalls });
    const destA = join(tmpWork("h32-dest-a-"), "acquired");
    const destB = join(tmpWork("h32-dest-b-"), "acquired");
    try {
      const inputs = writeJobInputs("vendor-budget-impact", { newline: false, multibyte: true });
      const encoded = encodeExecuteRequest({
        jobId: "vendor-budget-impact",
        files: { before: inputs.beforePath, after: inputs.afterPath },
      });
      const writerHash = hashHttpRequestAcquisitionV1("vendor-budget-impact", encoded.request.inputs);
      const ticket = createTicket({
        origin: host.origin,
        request: encoded.request,
        submitted: encoded.submitted,
        frozen: encoded.frozen,
      });
      assert.equal(ticket.requestHash, writerHash);
      assert.notEqual(encoded.submitted.before.sha256, encoded.submitted.before.materializedSha256);
      const ticketPath = join(inputs.work, "ticket.json");
      writeTicketAtomic(ticketPath, ticket);
      const posted = await postExecute(host.origin, encoded.request, {
        authorization: "Bearer token-a",
        timeoutMs: 120_000,
      });
      assert.equal(posted.status, 200, JSON.stringify(posted));
      assert.equal(posted.body.ok, true, JSON.stringify(posted.body));
      assert.ok(posted.body.publicationIdentitySha256);
      assert.equal(posted.body.requestHash, ticket.requestHash);
      assert.notEqual(posted.bodySha256, null);
      const dropped = JSON.parse(readFileSync(ticketPath, "utf8"));
      assert.equal(dropped.commitStatus, "unsent");
      assert.equal(dropped.postIdentity, null);

      const beforeGet = { ...seams.calls, execute: executeCalls.n };
      await host.close();
      const reopened = await reopenFileHost(dir, seams, executeCalls);
      host = reopened.host;
      ticket.origin = host.origin;
      writeTicketAtomic(ticketPath, ticket);

      const meta = await getResult(host.origin, ticket.executionId, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": ticket.requestHash,
          "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
        },
      });
      assert.equal(meta.status, 200, JSON.stringify(meta));
      assert.equal(meta.classify.kind, "available-result");
      const verified = verifyTicketBoundResult(ticket, meta.body, { retrieval: meta.retrieval });
      assert.equal(verified.ok, true, JSON.stringify(verified.failures));
      assert.notEqual(resultIdentityHash(posted.body), resultIdentityHash(meta.body));
      assert.equal(
        hashPublicationIdentityV1(publicationFieldsFromBody(posted.body)),
        hashPublicationIdentityV1(publicationFieldsFromBody(meta.body)),
      );

      const acquisition = await acquireHttpArtifacts({
        origin: host.origin,
        executionId: ticket.executionId,
        requestHash: ticket.requestHash,
        expectedNames: JOB_EXPECTED_OUTPUTS["vendor-budget-impact"],
        destDir: destA,
        authorization: "Bearer token-a",
        manifest: meta.body,
      });
      assert.equal(acquisition.code, "http-acquired");
      for (const name of JOB_EXPECTED_OUTPUTS["vendor-budget-impact"]) {
        assert.equal(existsSync(join(destA, name)), true, name);
      }
      assert.equal(destA.startsWith(reopened.store.artifactRoot), false);
      assert.equal(seams.calls.enqueue, beforeGet.enqueue);
      assert.equal(seams.calls.settlePayment, beforeGet.settlePayment);
      assert.equal(seams.calls.runPaidOffer, beforeGet.runPaidOffer);
      assert.equal(executeCalls.n, beforeGet.execute);

      const cliOut = join(inputs.work, "cli-out.json");
      const cliDest = destB;
      const proc = await runCliAsync(
        [
          "fetch",
          "--ticket",
          ticketPath,
          "--out",
          cliOut,
          "--acquire-to",
          cliDest,
          "--authorization",
          "token-a",
        ],
        { env: { D14_TIMEOUT_MS: "30000" } },
      );
      assert.equal(proc.status, 0, `${proc.stdout}\n${proc.stderr}`);
      const cliBody = JSON.parse(proc.stdout);
      assert.equal(cliBody.acquisition.code, "http-acquired");
      assert.equal(cliBody.purchaseAuthority, false);
      assert.equal(executeCalls.n, beforeGet.execute);
    } finally {
      await host.close();
    }
  });

  it("CLI submit through a proxy that drops the downstream 200 after HA1 commit; restart then CLI fetch --acquire-to without a second execute", async () => {
    const { service, store, seams, dir } = await fileService({ maxConcurrentReads: 4 });
    const executeCalls = { n: 0 };
    let host = await startComposed({ store, service, seams, executeCalls });
    let proxy;
    try {
      const inputs = writeJobInputs("vendor-budget-impact", { newline: false, multibyte: true });
      proxy = await startLostReplyProxy(host.origin);
      const ticketPath = join(inputs.work, "ticket.json");
      const submit = await runCliAsync(
        [
          "submit",
          "--base",
          proxy.origin,
          "--job",
          "vendor-budget-impact",
          "--before",
          inputs.beforePath,
          "--after",
          inputs.afterPath,
          "--ticket",
          ticketPath,
          "--authorization",
          "token-a",
        ],
        { timeout: 180_000, env: { D14_TIMEOUT_MS: "120000" } },
      );
      assert.notEqual(submit.status, 0, `${submit.stdout}\n${submit.stderr}`);
      const dropped = JSON.parse(readFileSync(ticketPath, "utf8"));
      assert.ok(dropped.requestHash);
      assert.equal(dropped.executionId, dropped.request.executionId);
      assert.equal(dropped.commitStatus === "accepted", false);
      assert.equal(executeCalls.n, 1);
      const beforeFetch = { ...seams.calls, execute: executeCalls.n };

      await proxy.close();
      proxy = null;
      await host.close();
      const reopened = await reopenFileHost(dir, seams, executeCalls);
      host = reopened.host;
      dropped.origin = host.origin;
      writeTicketAtomic(ticketPath, dropped);

      const dest = join(inputs.work, "cli-lost-reply-acquired");
      const cliOut = join(inputs.work, "cli-lost-reply-out.json");
      const fetchProc = await runCliAsync(
        [
          "fetch",
          "--ticket",
          ticketPath,
          "--out",
          cliOut,
          "--acquire-to",
          dest,
          "--authorization",
          "token-a",
        ],
        { env: { D14_TIMEOUT_MS: "30000" } },
      );
      assert.equal(fetchProc.status, 0, `${fetchProc.stdout}\n${fetchProc.stderr}`);
      const cliBody = JSON.parse(fetchProc.stdout);
      assert.equal(cliBody.acquisition.code, "http-acquired");
      assert.equal(cliBody.purchaseAuthority, false);
      for (const name of JOB_EXPECTED_OUTPUTS["vendor-budget-impact"]) {
        assert.equal(existsSync(join(dest, name)), true, name);
      }
      assert.equal(executeCalls.n, beforeFetch.execute);
      assert.equal(seams.calls.enqueue, beforeFetch.enqueue);
      assert.equal(seams.calls.settlePayment, beforeFetch.settlePayment);
      assert.equal(seams.calls.runPaidOffer, beforeFetch.runPaidOffer);
    } finally {
      if (proxy) await proxy.close();
      await host.close();
    }
  });

  it("CLI metadata fetch refuses a GET that keeps the pinned publication hash after substituting output tuples", async () => {
    const { service, store, seams } = await fileService({ maxConcurrentReads: 4 });
    const host = await startComposed({ store, service, seams });
    let proxy;
    try {
      const inputs = writeJobInputs("lockfile-pin-delta", { newline: true, multibyte: false });
      const encoded = encodeExecuteRequest({
        jobId: "lockfile-pin-delta",
        files: { before: inputs.beforePath, after: inputs.afterPath },
      });
      const ticket = createTicket({
        origin: host.origin,
        request: encoded.request,
        submitted: encoded.submitted,
        frozen: encoded.frozen,
      });
      const ticketPath = join(inputs.work, "ticket.json");
      const posted = await postExecute(host.origin, encoded.request, {
        authorization: "Bearer token-a",
        timeoutMs: 120_000,
      });
      assert.equal(posted.status, 200, JSON.stringify(posted.body));
      const next = updateTicketAfterPost(ticket, posted);
      writeTicketAtomic(ticketPath, next);
      assert.ok(next.publicationIdentitySha256);
      const pinned = next.publicationIdentitySha256;
      proxy = await startMutatingJsonProxy(host.origin, (body) => {
        if (!body || body.state !== "available") return body;
        const outputs = [
          { name: "pin-delta.json", kind: "file", bytes: 9, sha256: "e".repeat(64) },
          { name: "pin-delta.md", kind: "file", bytes: 9, sha256: "f".repeat(64) },
        ];
        return {
          ...body,
          outputs,
          outputsDigest: digestNamedOutputs(outputs),
          publicationIdentitySha256: pinned,
        };
      });
      next.origin = proxy.origin;
      writeTicketAtomic(ticketPath, next);
      const cliOut = join(inputs.work, "cli-mutated-meta.json");
      const proc = await runCliAsync(
        ["fetch", "--ticket", ticketPath, "--out", cliOut, "--authorization", "token-a"],
        { env: { D14_TIMEOUT_MS: "15000" } },
      );
      assert.notEqual(proc.status, 0, proc.stdout);
      const cliBody = JSON.parse(proc.stdout);
      assert.equal(cliBody.classify?.code || cliBody.verified?.failures?.[0]?.code, "publication-identity-mismatch");
      const local = verifyTicketBoundResult(next, {
        ...posted.body,
        state: "available",
        outputs: [
          { name: "pin-delta.json", kind: "file", bytes: 9, sha256: "e".repeat(64) },
          { name: "pin-delta.md", kind: "file", bytes: 9, sha256: "f".repeat(64) },
        ],
        outputsDigest: digestNamedOutputs([
          { name: "pin-delta.json", kind: "file", bytes: 9, sha256: "e".repeat(64) },
          { name: "pin-delta.md", kind: "file", bytes: 9, sha256: "f".repeat(64) },
        ]),
        publicationIdentitySha256: pinned,
      });
      assert.equal(local.ok, false);
      assert.ok(local.failures.some((row) => row.code === "publication-identity-mismatch"));
      const derived = hashPublicationIdentityV1(publicationFieldsFromBody(posted.body));
      assert.equal(pinned, derived);
    } finally {
      if (proxy) await proxy.close();
      await host.close();
    }
  });

  it("lockfile-pin-delta: successful POST pins publicationIdentityV1; restart fetch matches", async () => {
    const { service, store, seams, dir } = await fileService({ maxConcurrentReads: 4 });
    const executeCalls = { n: 0 };
    let host = await startComposed({ store, service, seams, executeCalls });
    try {
      const inputs = writeJobInputs("lockfile-pin-delta", { newline: false, multibyte: false });
      const encoded = encodeExecuteRequest({
        jobId: "lockfile-pin-delta",
        files: { before: inputs.beforePath, after: inputs.afterPath },
      });
      const ticket = createTicket({
        origin: host.origin,
        request: encoded.request,
        submitted: encoded.submitted,
        frozen: encoded.frozen,
      });
      const ticketPath = join(inputs.work, "ticket.json");
      writeTicketAtomic(ticketPath, ticket);
      const posted = await postExecute(host.origin, encoded.request, {
        authorization: "Bearer token-a",
        timeoutMs: 120_000,
      });
      assert.equal(posted.status, 200, JSON.stringify(posted.body));
      assert.equal(posted.body.ok, true, posted.body?.error || JSON.stringify(posted.body));
      const next = updateTicketAfterPost(ticket, posted);
      writeTicketAtomic(ticketPath, next);
      assert.ok(next.postIdentity.publicationIdentitySha256);
      await host.close();
      const reopened = await reopenFileHost(dir, seams, executeCalls);
      host = reopened.host;
      next.origin = host.origin;
      writeTicketAtomic(ticketPath, next);

      const meta = await getResult(host.origin, next.executionId, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": next.requestHash,
          "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
        },
      });
      assert.equal(meta.status, 200, JSON.stringify(meta));
      const verified = verifyTicketBoundResult(next, meta.body, { retrieval: meta.retrieval });
      assert.equal(verified.ok, true, JSON.stringify(verified.failures));
      assert.equal(verified.postIdentityMatch, true);
      const dest = join(inputs.work, "acquired");
      const acquisition = await acquireHttpArtifacts({
        origin: host.origin,
        executionId: next.executionId,
        requestHash: next.requestHash,
        expectedNames: JOB_EXPECTED_OUTPUTS["lockfile-pin-delta"],
        destDir: dest,
        authorization: "Bearer token-a",
        manifest: meta.body,
      });
      assert.equal(acquisition.code, "http-acquired");
      for (const name of JOB_EXPECTED_OUTPUTS["lockfile-pin-delta"]) {
        const listed = meta.body.outputs.find((row) => row.name === name);
        assert.equal(readFileSync(join(dest, name)).length, listed.bytes);
      }
    } finally {
      await host.close();
    }
  });

  it("cross-principal, hash/version, substituted/missing manifest, oversize stream, and no second GET", async () => {
    const { service, store, seams } = await fileService({ maxConcurrentReads: 4 });
    const host = await startComposed({ store, service, seams });
    try {
      const inputs = writeJobInputs("vendor-budget-impact", { newline: true, multibyte: false });
      const encoded = encodeExecuteRequest({
        jobId: "vendor-budget-impact",
        files: { before: inputs.beforePath, after: inputs.afterPath },
      });
      const ticket = createTicket({
        origin: host.origin,
        request: encoded.request,
        submitted: encoded.submitted,
      });
      const posted = await postExecute(host.origin, encoded.request, {
        authorization: "Bearer token-a",
        timeoutMs: 120_000,
      });
      assert.equal(posted.status, 200, JSON.stringify(posted.body));
      const next = updateTicketAfterPost(ticket, posted);
      const hdrs = {
        authorization: "Bearer token-a",
        "x-request-sha256": next.requestHash,
        "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
      };
      const other = await getResult(host.origin, next.executionId, {
        headers: { ...hdrs, authorization: "Bearer token-b" },
      });
      assert.equal(other.status, 404);
      const wrongHash = await getResult(host.origin, next.executionId, {
        headers: { ...hdrs, "x-request-sha256": "a".repeat(64) },
      });
      assert.equal(wrongHash.status, 409);
      const wrongVersion = await getResult(host.origin, next.executionId, {
        headers: { ...hdrs, "x-request-hash-version": "samedaydesk.http-frozen-request.v1" },
      });
      assert.equal(wrongVersion.status, 409);

      const good = await getResult(host.origin, next.executionId, { headers: hdrs });
      assert.equal(good.status, 200);
      let metadataGets = 0;
      const countingFetch = async (url, opts) => {
        if (String(url).includes("/artifacts/")) return fetch(url, opts);
        metadataGets += 1;
        return fetch(url, opts);
      };
      await acquireHttpArtifacts({
        origin: host.origin,
        executionId: next.executionId,
        requestHash: next.requestHash,
        expectedNames: next.expectedOutputs,
        destDir: join(inputs.work, "acq-manifest"),
        authorization: "Bearer token-a",
        fetchImpl: countingFetch,
        manifest: good.body,
      });
      assert.equal(metadataGets, 0);

      const substituted = {
        ...good.body,
        jobId: "lockfile-pin-delta",
        outputs: [
          { name: "pin-delta.json", kind: "file", bytes: 1, sha256: "e".repeat(64) },
          { name: "pin-delta.md", kind: "file", bytes: 1, sha256: "f".repeat(64) },
        ],
      };
      await assert.rejects(
        () =>
          acquireHttpArtifacts({
            origin: host.origin,
            executionId: next.executionId,
            requestHash: next.requestHash,
            expectedNames: next.expectedOutputs,
            destDir: join(inputs.work, "acq-sub"),
            authorization: "Bearer token-a",
            manifest: substituted,
          }),
        (err) => err instanceof ConsumerRefuse,
      );
      const missing = { ...good.body };
      delete missing.requestHash;
      await assert.rejects(
        () =>
          acquireHttpArtifacts({
            origin: host.origin,
            executionId: next.executionId,
            requestHash: next.requestHash,
            expectedNames: next.expectedOutputs,
            destDir: join(inputs.work, "acq-miss"),
            authorization: "Bearer token-a",
            manifest: missing,
          }),
        (err) => err instanceof ConsumerRefuse && err.code === "missing-request-hash",
      );

      const oversize = await new Promise((resolve) => {
        const server = createServer((req, res) => {
          res.writeHead(200, { "content-type": "application/octet-stream", "transfer-encoding": "chunked" });
          res.write("a".repeat(40));
          setTimeout(() => {
            res.write("b".repeat(40));
            res.end();
          }, 20);
        });
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          resolve({ server, origin: `http://127.0.0.1:${addr.port}` });
        });
      });
      try {
        const got = await getArtifact(oversize.origin, next.executionId, "budget-impact.json", {
          maxBodyBytes: 64,
        });
        assert.equal(got.bytes, null);
        assert.equal(got.classify.code, "response-too-large");
      } finally {
        await closeServer(oversize.server);
      }
    } finally {
      await host.close();
    }
  });
});

describe("H32 PostgreSQL composition restart", { timeout: 180_000 }, () => {
  it("file-equivalent PG submit reopens into a second directory", async () => {
    if (!postgresBinariesAvailable()) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "h32-pg-art-"));
    let store;
    let host;
    try {
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "h32_comp",
        artifactRoot: artifacts,
        statementTimeoutMs: 30_000,
      });
      const seams = createForbiddenSeamSpies();
      const service = createAcquisitionService({ store, artifactRoot: artifacts, forbiddenSeams: seams.spies });
      host = await startComposed({ store, service, seams });
      const inputs = writeJobInputs("vendor-budget-impact", { newline: false, multibyte: true });
      const encoded = encodeExecuteRequest({
        jobId: "vendor-budget-impact",
        files: { before: inputs.beforePath, after: inputs.afterPath },
      });
      const ticket = createTicket({
        origin: host.origin,
        request: encoded.request,
        submitted: encoded.submitted,
      });
      const posted = await postExecute(host.origin, encoded.request, {
        authorization: "Bearer token-a",
        timeoutMs: 120_000,
      });
      assert.equal(posted.status, 200, JSON.stringify(posted.body));
      const next = updateTicketAfterPost(ticket, posted);
      await host.close();
      await store.close();
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "h32_comp",
        artifactRoot: artifacts,
        statementTimeoutMs: 30_000,
      });
      const restarted = createAcquisitionService({ store, artifactRoot: artifacts, forbiddenSeams: seams.spies });
      host = await startComposed({ store, service: restarted, seams });
      next.origin = host.origin;
      const meta = await getResult(host.origin, next.executionId, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": next.requestHash,
          "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
        },
      });
      assert.equal(meta.status, 200, JSON.stringify(meta));
      const dest = join(inputs.work, "pg-acquired");
      const acquisition = await acquireHttpArtifacts({
        origin: host.origin,
        executionId: next.executionId,
        requestHash: next.requestHash,
        expectedNames: next.expectedOutputs,
        destDir: dest,
        authorization: "Bearer token-a",
        manifest: meta.body,
      });
      assert.equal(acquisition.code, "http-acquired");
      assert.equal(dest.startsWith(artifacts), false);
    } finally {
      if (host) await host.close();
      if (store) await store.close().catch(() => {});
      cluster.stop();
    }
  });
});
