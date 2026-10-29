import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolvePostgresBin } from "./fixtures/disposable-pg.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "sds-pg-resolver-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "postgresql", "999", "bin");
  const tools = path.join(root, "tools");
  mkdirSync(bin, { recursive: true });
  mkdirSync(tools);
  for (const name of ["initdb", "pg_ctl", "createdb", "postgres"]) {
    writeFileSync(path.join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  }
  const config = () => writeFileSync(path.join(tools, "pg_config"), `#!/bin/sh\nprintf '%s\\n' '${bin}'\n`, { mode: 0o700 });
  return { root, bin, tools, config };
}

test("explicit complete future-version path takes precedence", (t) => {
  const f = fixture(t);
  assert.equal(resolvePostgresBin({ PULSE_PG_BIN: f.bin, PATH: f.tools }), f.bin);
});
test("invalid explicit selection refuses instead of falling through", (t) => {
  const f = fixture(t); f.config();
  for (const value of ["", "relative/bin", path.join(f.root, "missing")]) {
    assert.throws(() => resolvePostgresBin({ PULSE_PG_BIN: value, PATH: f.tools }), { code: "postgres_bin_invalid" });
  }
});
test("pg_config selects an installed future-version directory", (t) => {
  const f = fixture(t); f.config();
  assert.equal(resolvePostgresBin({ PATH: f.tools }), f.bin);
});
test("complete PATH directory is supported without pg_config", (t) => {
  const f = fixture(t);
  assert.equal(resolvePostgresBin({ PATH: f.bin }), f.bin);
});
test("incomplete directory is refused", (t) => {
  const f = fixture(t); rmSync(path.join(f.bin, "createdb"));
  assert.throws(() => resolvePostgresBin({ PULSE_PG_BIN: f.bin, PATH: f.tools }), { code: "postgres_bin_invalid" });
});
test("non-executable member is refused", (t) => {
  const f = fixture(t); chmodSync(path.join(f.bin, "pg_ctl"), 0o600);
  assert.throws(() => resolvePostgresBin({ PULSE_PG_BIN: f.bin, PATH: f.tools }), { code: "postgres_bin_invalid" });
});
test("unavailable binaries have a distinct refusal", (t) => {
  const f = fixture(t);
  assert.throws(() => resolvePostgresBin({ PATH: f.tools }), { code: "postgres_bin_unavailable" });
});
