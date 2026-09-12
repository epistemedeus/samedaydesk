import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RECIPE_ROOT } from "../src/paths.mjs";
import { loadCustomerX402, materializePatchedCustomerX402 } from "../src/overlay.mjs";
import { normalizeLockfileAuthorization } from "../src/lockfile-authorization.mjs";

test("patched customer-x402 binds exact lockfile URL/method/body bytes", async (t) => {
  const dest = await mkdtemp(join(tmpdir(), "h04-lockfile-client-"));
  t.after(() => rm(dest, { recursive: true, force: true }));
  await materializePatchedCustomerX402(dest);
  const client = await loadCustomerX402(dest);
  const raw = JSON.parse(await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"));
  const auth = client.normalizeAuthorization(raw);
  assert.equal(auth.method, "POST");
  assert.equal(auth.url, "https://agents.samedaydesk.com/lockfile-pin-delta");
  assert.equal(auth.path, "/lockfile-pin-delta");
  assert.equal(auth.network, "eip155:8453");
  assert.equal(auth.asset, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(auth.recipient, "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee");
  assert.equal(auth.amountCapAtomic, "5000");
  assert.equal(auth.batch, null);
  assert.equal(auth.lockfile, true);
  assert.equal(auth.bodyRaw, JSON.stringify({ before: raw.body.before, after: raw.body.after }));
  assert.match(auth.bodyDigest, /^sha256:[0-9a-f]{64}$/);
  const local = normalizeLockfileAuthorization(raw);
  assert.equal(local.bodyRaw, auth.bodyRaw);
  assert.equal(local.bodyDigest, auth.bodyDigest);
});

test("patched client still refuses GET /extract mutation and batch path stays batch", async (t) => {
  const dest = await mkdtemp(join(tmpdir(), "h04-lockfile-client-batch-"));
  t.after(() => rm(dest, { recursive: true, force: true }));
  await materializePatchedCustomerX402(dest);
  const client = await loadCustomerX402(dest);
  const batch = client.normalizeAuthorization(client.constants.DEFAULT_BATCH_AUTHORIZATION);
  assert.equal(batch.path, "/extract/batch");
  assert.ok(batch.batch);
  const lockfile = JSON.parse(await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"));
  assert.throws(
    () => client.normalizeAuthorization({
      ...lockfile,
      url: "https://agents.samedaydesk.com/extract/batch",
    }),
    /authorization path must be \/extract\/batch|unexpected field/,
  );
});

test("mutated lockfile body bytes after approval are refused", async (t) => {
  const dest = await mkdtemp(join(tmpdir(), "h04-lockfile-client-mutate-"));
  t.after(() => rm(dest, { recursive: true, force: true }));
  await materializePatchedCustomerX402(dest);
  const client = await loadCustomerX402(dest);
  const raw = JSON.parse(await readFile(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"));
  const auth = client.normalizeAuthorization(raw);
  assert.throws(
    () => client.normalizeAuthorization({
      ...raw,
      bodyRaw: auth.bodyRaw.replace("mocha", "MOCHA"),
    }),
    client.AuthorizationRefusal,
  );
});
