import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseReceipt } from "../src/consumers/release-gate.mjs";

export const packageRoot = fileURLToPath(new URL("..", import.meta.url));
export const cliPath = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
export const NOW = "2026-09-30T12:00:00.000Z";
export const LATER = "2026-10-30T00:00:00.000Z";
export const BINDING = "a".repeat(64);

export const routeLockDescriptor = {
  schema: "route-lock.release.v1",
  releaseId: "route-lock-0.1.0",
  version: "0.1.0",
  subject: "route-lock",
  surfaces: [
    { id: "source", layer: "source_publish", required: true, absence: "fail" },
    { id: "origin", layer: "source_publish", required: true, absence: "fail" },
  ],
};

export function heldRelease(generatedAt = NOW) {
  return releaseReceipt({
    descriptor: routeLockDescriptor,
    evidence: { observations: { source: { status: "mismatch" }, origin: { status: "absent" } } },
    generatedAt,
  });
}

export function acceptedRelease(generatedAt = "2026-09-30T12:30:00.000Z") {
  return releaseReceipt({
    descriptor: routeLockDescriptor,
    evidence: {
      observations: {
        source: { status: "match", evidence: { commit: "abc" } },
        origin: { status: "match", liveReadback: true },
      },
    },
    generatedAt,
  });
}

export function handReceipt(verdict, generatedAt, extras = {}) {
  const accepted = verdict === "accepted";
  return {
    schema: "release-gate.receipt.v1",
    product: "release-gate",
    qualification: "route-lock-release",
    launched: extras.launched ?? accepted,
    substitutesForRouteLockRelease: false,
    readonly: true,
    ownerPayment: false,
    releaseId: "route-lock-0.1.0",
    version: "0.1.0",
    subject: "route-lock",
    generatedAt,
    verdict,
    accepted,
    code: verdict,
    reason: extras.reason ?? "prose",
    originProof: {
      status: accepted ? "matched" : "awaiting_publication",
      liveReadback: accepted,
      awaiting: extras.awaiting ?? (accepted ? null : "waiting"),
    },
    summary: extras.summary ?? {
      pass: accepted ? 1 : 0,
      hold: accepted ? 0 : 1,
      gate: 0,
      wait: 0,
      unavailable_ok: 0,
    },
    surfaces: [
      {
        id: "source",
        layer: "source_publish",
        kind: "source_publish",
        state: accepted ? "match" : "mismatch",
        acceptance: accepted ? "pass" : "hold",
        required: true,
        reason: extras.surfaceReason ?? "surface prose",
      },
    ],
  };
}

const DIMENSIONS = [
  "discovery",
  "challenge_validity",
  "request_constructibility",
  "declared_output_contract",
  "payment_term_stability",
  "endpoint_availability",
];

export function routeDecision({
  binding = BINDING,
  decision = "lockable",
  at = NOW,
  fresh = true,
  present = true,
  observedAt = NOW,
  status = 402,
  digest = "digest-a",
} = {}) {
  const lockable = decision === "lockable";
  return {
    schemaVersion: "route-lock.decision.v1",
    evaluatedAt: at,
    decision,
    code: lockable ? "six_dimension_settlement_ready" : "terms_changed",
    reason: "prose that is not a capability field",
    findings: lockable ? [] : ["drifted:recipient"],
    dimensions: DIMENSIONS.map((id) => ({
      id,
      status: lockable ? "pass" : "fail",
      code: lockable ? "pass" : "fail",
      findings: [],
    })),
    identity: { bindingDigest: binding },
    terms: {
      matched: lockable ? ["amountAtomic"] : [],
      drifted: lockable ? [] : ["recipient"],
      unknown: [],
    },
    evidence: {
      present,
      fresh,
      digest,
      bindingDigest: binding,
      observedAt,
      validityWindowMs: 300000,
    },
    availability: { consulted: true, status },
    profile: { method: "GET" },
    nextAction: lockable ? "eligible_for_separate_authorization" : "do_not_lock_this_route",
    boundary: {
      reservesFunds: false,
      walletAccessed: false,
      paymentSigned: false,
      paymentSent: false,
      settlementAttempted: false,
      statement: "Stops before payment.",
    },
  };
}

export function projectionDocument({
  value = 4,
  fetchedAt = NOW,
  availability = "ok",
  coverage = { status: "complete", comparable: true, window: "point" },
  providerTimestamp = "2026-09-30T11:00:00.000Z",
  providerTimestampState = "ok",
} = {}) {
  const readable = availability === "ok";
  return {
    schemaVersion: "pilot.external-observatory.v1",
    fetchedAt,
    totalAgentEconomy: 999999,
    observations: [
      {
        schemaVersion: "pilot.external-observatory.v1",
        sourceId: "moltjobs",
        sourceKind: "work_market",
        availability,
        coverage,
        fetchedAt,
        providerTimestamp,
        providerTimestampState,
        metrics: [
          {
            key: "jobCount",
            value,
            state: readable ? "ok" : "missing",
            unit: "count",
            population: "listed_jobs",
            window: "point",
          },
        ],
      },
    ],
  };
}

export function releaseSubscription(id = "rg-route-lock") {
  return {
    subscriptionId: id,
    owner: "example-owner",
    source: { kind: "release-gate", scope: "release-gate:route-lock@0.1.0" },
    comparison: { policy: "material-fields" },
    destination: { receiverId: "local-vm" },
    budget: { maxUsefulEvents: 20 },
    expiresAt: LATER,
  };
}

export async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return {
    dir,
    file: path.join(dir, "state.json"),
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function startLocalReceiver() {
  const events = new Map();
  let mode = "ok";
  const server = createServer((request, response) => {
    request.on("error", () => {});
    response.on("error", () => {});
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname.startsWith("/events/")) {
      const key = decodeURIComponent(url.pathname.slice("/events/".length));
      const found = events.get(key);
      if (!found) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ found: false }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ found: true, idempotencyKey: key, event: found }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/deliver") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ accepted: false, error: "invalid_json" }));
          return;
        }
        const header = request.headers["idempotency-key"];
        const key = typeof header === "string" ? header : body.idempotencyKey;
        if (!key || key !== body.idempotencyKey) {
          response.writeHead(422, { "content-type": "application/json" });
          response.end(JSON.stringify({ accepted: false, error: "idempotency_mismatch" }));
          return;
        }
        const behavior = mode;
        mode = "ok";
        if (behavior === "drop") {
          request.socket.destroy();
          return;
        }
        if (behavior === "fail") {
          response.writeHead(422, { "content-type": "application/json" });
          response.end(JSON.stringify({ accepted: false, idempotencyKey: key, error: "rejected" }));
          return;
        }
        const duplicate = events.has(key);
        events.set(key, body.event);
        if (behavior === "lose") {
          request.socket.destroy();
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: true, duplicate, idempotencyKey: key }));
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.on("clientError", (_error, socket) => {
    socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        events,
        setMode(next) {
          mode = next;
        },
        close() {
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}
