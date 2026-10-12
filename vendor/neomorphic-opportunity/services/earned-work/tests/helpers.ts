import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import pg from "pg";
import { createApp, type AppOptions } from "../src/app.js";
import { quoteIdent, type ServiceConfig } from "../src/config.js";
import { hashToken } from "../src/crypto.js";
import { createPostgresStore, PostgresStore, type PostgresStoreOptions } from "../src/store/postgres.js";
import type { Clock } from "../src/types.js";

/** Explicit test provenance — not production, not a hosted exchange. */
export const TEST_PROVENANCE = "test" as const;
export const TEST_PROVENANCE_LABEL =
  "test provenance — S275 earned-work automated test, not production, not settlement";

export const OWNER_TOKEN = process.env.EARNED_WORK_OWNER_TOKEN ?? "dev-owner-token-s275";

export const HYPOTHESIS_REWARD = { amount: "0.10", asset: "USDC", network: "base" } as const;

const ARTIFACT_PREIMAGE = "s275-test-artifact\n";
export const TEST_ARTIFACT = {
  ref: "fixture:s275-test-not-fetched",
  digestSha256: createHash("sha256").update(ARTIFACT_PREIMAGE, "utf8").digest("hex"),
  mediaType: "text/plain",
  bytes: Buffer.byteLength(ARTIFACT_PREIMAGE),
};

export function databaseUrl(): string {
  const url = process.env.EARNED_WORK_DATABASE_URL;
  if (!url) {
    throw new Error("EARNED_WORK_DATABASE_URL is required for earned-work tests (disposable Postgres)");
  }
  return url;
}

export function uniqueSchema(): string {
  return `ewt_${randomBytes(8).toString("hex")}`;
}

export async function dropSchema(schema: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  } finally {
    await client.end();
  }
}

export function testConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    port: 0,
    listenHost: "127.0.0.1",
    shutdownTimeoutMs: 8000,
    ownerToken: OWNER_TOKEN,
    ownerTokenHash: hashToken(OWNER_TOKEN),
    databaseUrl: databaseUrl(),
    bodyLimitBytes: 32 * 1024,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 10_000,
    corsOrigins: ["https://neomorphic.io"],
    trustProxyHops: 0,
    pgSchema: "public",
    poolMax: 4,
    verifierMode: "default",
    reproduction: null,
    ...overrides,
  };
}

export async function openStore(
  options: {
    schema?: string;
    clock?: Clock;
    poolMax?: number;
    afterDurableWrite?: PostgresStoreOptions["afterDurableWrite"];
  } = {},
) {
  const schema = options.schema ?? uniqueSchema();
  const store = await createPostgresStore(databaseUrl(), {
    schema,
    clock: options.clock,
    poolMax: options.poolMax ?? 4,
    afterDurableWrite: options.afterDurableWrite,
  });
  return { store, schema };
}

export async function listen(
  store: PostgresStore,
  options: { config?: Partial<ServiceConfig>; app?: AppOptions; closeConnection?: boolean } = {},
): Promise<{ server: Server; baseUrl: string; port: number }> {
  const cfg = testConfig({ pgSchema: store.schema, ...options.config });
  const app = createApp(store, cfg, options.app);
  const server = createServer((request, response) => {
    if (options.closeConnection) response.setHeader("Connection", "close");
    app(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, port: address.port };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

export async function json(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text, headers: response.headers };
}

export function key(label: string): string {
  return `test-${label}-${randomBytes(8).toString("hex")}`;
}

export function createTaskPayload(overrides: Record<string, unknown> = {}) {
  const stamp = randomBytes(4).toString("hex");
  return {
    title: `Test task ${stamp}`.slice(0, 120),
    summary: TEST_PROVENANCE_LABEL,
    provenance: TEST_PROVENANCE,
    reward: { ...HYPOTHESIS_REWARD },
    budget: { ...HYPOTHESIS_REWARD },
    terms: {
      summary: TEST_PROVENANCE_LABEL,
      claimTtlSeconds: 3600,
      maxArtifactBytes: 1024,
      allowedMediaTypes: ["text/plain", "application/json"],
      slotLimit: 1,
    },
    correctionPolicy: { maxRevisions: 1 },
    ...overrides,
  };
}

export async function issueContributor(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
) {
  const publicId = `test-contrib-${randomBytes(4).toString("hex")}`;
  const created = await json(baseUrl, "/v1/contributor-tokens", {
    method: "POST",
    token: OWNER_TOKEN,
    body: JSON.stringify({
      contributorPublicId: publicId,
      payoutDestination: "test-payout-secret-do-not-leak",
      provenance: TEST_PROVENANCE,
      ...overrides,
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const body = created.body as { token: string; contributorPublicId: string };
  return { token: body.token, publicId: body.contributorPublicId };
}

export async function createReservedTask(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
) {
  const payload = createTaskPayload(overrides);
  const created = await json(baseUrl, "/v1/tasks", {
    method: "POST",
    token: OWNER_TOKEN,
    idempotencyKey: key("create"),
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const task = (created.body as { task: { id: string; termsVersion: string } }).task;
  assert.match(task.termsVersion, /^sha256:[0-9a-f]{64}$/);
  const reserved = await json(baseUrl, `/v1/tasks/${task.id}/funding/reserve`, {
    method: "POST",
    token: OWNER_TOKEN,
    idempotencyKey: key("reserve"),
    body: "{}",
  });
  assert.equal(reserved.status, 200, JSON.stringify(reserved.body));
  assert.equal((reserved.body as { task: { fundingState: string } }).task.fundingState, "reserved");
  return { taskId: task.id, termsVersion: task.termsVersion, payload };
}
