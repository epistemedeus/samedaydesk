import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { careDatabaseOptions } from "../lib/care-store.js";

test("Care and diagnostic writers share the private socket and verified production TLS rules", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sds-db-config-"));
  const link = dir + "-link";
  t.after(() => { rmSync(link, { force: true }); rmSync(dir, { recursive: true, force: true }); });
  const base = "postgresql://fixture@127.0.0.1/postgres";
  const preview = (url) => ({ SDS_PRIVATE_PREVIEW: "1", SDS_CARE_DATABASE_URL: url });
  assert.equal(careDatabaseOptions(preview(base + `?host=${encodeURIComponent(dir)}&port=55491`)).ssl, false);
  assert.throws(() => careDatabaseOptions(preview(base + "?host=%2Ftmp")), /private directory/);
  symlinkSync(dir, link);
  assert.throws(() => careDatabaseOptions(preview(base + `?host=${encodeURIComponent(link)}`)), /private directory/);
  assert.throws(() => careDatabaseOptions(preview(base + `?host=${encodeURIComponent(dir)}&host=%2Ftmp`)), /URL option/);
  assert.throws(() => careDatabaseOptions(preview(base.replace("127.0.0.1", "db.example.test"))), /loopback/);
  assert.throws(() => careDatabaseOptions({ SDS_CARE_DATABASE_URL: base }), /verified TLS CA/);
  assert.throws(() => careDatabaseOptions({ SDS_CARE_DATABASE_URL: base + "?host=%2Ftmp", SDS_CARE_DATABASE_CA_BASE64: "Zml4dHVyZQ==" }), /URL option/);
  assert.throws(() => careDatabaseOptions(preview(base + "?sslmode=disable")), /TLS overrides/);
});
