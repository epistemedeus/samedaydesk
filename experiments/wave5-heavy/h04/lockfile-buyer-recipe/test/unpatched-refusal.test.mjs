import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CUSTOMER_X402_ROOT, RECIPE_ROOT } from "../src/paths.mjs";

const authorization = JSON.parse(
  readFileSync(join(RECIPE_ROOT, "authorization/authorization-lockfile.json"), "utf8"),
);

test("unpatched customer-x402 POST authorization refuses /lockfile-pin-delta", async () => {
  const { normalizeAuthorization, AuthorizationRefusal } = await import(
    pathToFileURL(join(CUSTOMER_X402_ROOT, "src/authorization.mjs")).href
  );
  assert.throws(
    () => normalizeAuthorization(authorization),
    (error) => {
      assert.equal(error instanceof AuthorizationRefusal, true);
      assert.match(error.message, /authorization path must be \/extract\/batch/);
      return true;
    },
  );
});

test("unpatched POST still binds /extract/batch (other client behavior preserved)", async () => {
  const { normalizeAuthorization } = await import(
    pathToFileURL(join(CUSTOMER_X402_ROOT, "src/authorization.mjs")).href
  );
  const { DEFAULT_BATCH_AUTHORIZATION } = await import(
    pathToFileURL(join(CUSTOMER_X402_ROOT, "src/constants.mjs")).href
  );
  const auth = normalizeAuthorization(DEFAULT_BATCH_AUTHORIZATION);
  assert.equal(auth.path, "/extract/batch");
  assert.equal(auth.method, "POST");
  assert.ok(auth.batch);
});
