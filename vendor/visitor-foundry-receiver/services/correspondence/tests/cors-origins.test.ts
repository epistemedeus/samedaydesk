import assert from "node:assert/strict";
import test from "node:test";
import {
  allowCorsOrigin,
  canonicalizeCorsOrigin,
  DEFAULT_CORS_ORIGIN,
  loadConfig,
  parseCorsOrigins,
} from "../src/config.js";

const ADMIN = "test-admin-token-please-change-now";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    ...overrides,
  };
}

test("unset CORS allowlist is the documented HTTPS site origin only", () => {
  assert.deepEqual(parseCorsOrigins(undefined), [DEFAULT_CORS_ORIGIN]);
  assert.equal(DEFAULT_CORS_ORIGIN, "https://neomorphic.io");
  assert.deepEqual(loadConfig(env()).corsOrigins, ["https://neomorphic.io"]);
  assert.deepEqual(parseCorsOrigins(""), []);
});

test("CORS origins must be canonical http(s) origins", () => {
  assert.equal(canonicalizeCorsOrigin("https://neomorphic.io/"), "https://neomorphic.io");
  assert.equal(canonicalizeCorsOrigin("http://127.0.0.1:4321"), "http://127.0.0.1:4321");
  assert.throws(() => canonicalizeCorsOrigin("null"));
  assert.throws(() => canonicalizeCorsOrigin("https://neomorphic.io/path"));
  assert.throws(() => canonicalizeCorsOrigin("https://user:pass@neomorphic.io"));
  assert.throws(() => canonicalizeCorsOrigin("https://neomorphic.io/?q=1"));
  assert.throws(() => canonicalizeCorsOrigin("https://neomorphic.io/#frag"));
  assert.throws(() => canonicalizeCorsOrigin("ftp://neomorphic.io"));
  assert.throws(() => canonicalizeCorsOrigin("not a url"));
  assert.throws(() => loadConfig(env({ CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io/workbench" })));
  assert.throws(() => loadConfig(env({ CORRESPONDENCE_CORS_ORIGINS: "https://user:pass@example.com" })));
});

test("allowCorsOrigin never implies loopback and rejects null or path origins", () => {
  assert.equal(allowCorsOrigin("http://127.0.0.1:4321", []), null);
  assert.equal(allowCorsOrigin("http://localhost:8787", ["https://neomorphic.io"]), null);
  assert.equal(
    allowCorsOrigin("http://127.0.0.1:4321", ["http://127.0.0.1:4321"]),
    "http://127.0.0.1:4321",
  );
  assert.equal(allowCorsOrigin("https://neomorphic.io", ["https://neomorphic.io"]), "https://neomorphic.io");
  assert.equal(allowCorsOrigin("null", ["https://neomorphic.io"]), null);
  assert.equal(allowCorsOrigin("https://neomorphic.io/secret", ["https://neomorphic.io"]), null);
  assert.equal(allowCorsOrigin("https://user:pass@neomorphic.io", ["https://neomorphic.io"]), null);
  assert.equal(allowCorsOrigin(undefined, ["https://neomorphic.io"]), null);
});
