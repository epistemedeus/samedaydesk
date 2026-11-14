import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

import { readJson, readText, root } from "./helpers.mjs";

const pkg = readJson("package.json");
const walk = (dir) => readdirSync(dir).flatMap((name) => { const f = join(dir, name); return statSync(f).isDirectory() ? walk(f) : [f]; });
const own = walk(root).map((f) => relative(root, f)).filter((f) => !f.startsWith("vendor/") && !f.startsWith("node_modules/"));

describe("package", () => {
  test("installable, zero dependencies, own tests plus the vendored suites, cold install kept separate", () => {
    assert.equal(pkg.name, "@samedaydesk/workflow-kits-n12-changed-period");
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.type, "module");
    assert.equal(pkg.private, true);
    assert.deepEqual(pkg.dependencies, {});
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.scripts.test, "node --test test/*.test.mjs vendor/payment-rail/recurring-journey/*.test.mjs vendor/payment-rail/job-contract/*.test.mjs");
    assert.equal(pkg.scripts["test:install"], "node --test install-check/cold-install.mjs");
    assert.ok(!pkg.scripts.test.includes("install-check"));
  });

  test("files allowlist exists and excludes tests and the install check", () => {
    for (const entry of pkg.files) assert.ok(existsSync(join(root, entry)), entry);
    assert.ok(!pkg.files.some((f) => f.startsWith("test") || f.startsWith("install-check")));
  });

  test("shipped source imports stay inside the allowlist", () => {
    const allowed = (rel) => pkg.files.some((f) => (f.endsWith("/") ? rel.startsWith(f) : rel === f));
    const shipped = own.filter((f) => f.endsWith(".mjs") && allowed(f));
    assert.ok(shipped.length >= 12);
    for (const file of shipped) {
      for (const [, spec] of readText(file).matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
        const target = relative(root, join(root, file, "..", spec));
        assert.ok(allowed(target), `${file} imports ${target}`);
        assert.ok(existsSync(join(root, target)), `${file} imports missing ${target}`);
      }
      assert.ok(!/from "(?!node:|\.)/.test(readText(file)), `${file} imports a package`);
    }
  });

  test("no test imports the cold-install check (it packs and installs, VM only)", () => {
    for (const file of own.filter((f) => f.startsWith("test/"))) {
      const imports = [...readText(file).matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]);
      assert.ok(!imports.some((spec) => spec.includes("install-check/")), file);
    }
  });

  test("no em dash in any file this kit writes; no other identity in the docs", () => {
    for (const file of own) {
      if (/\.(mjs|json|md)$/.test(file)) assert.ok(!readText(file).includes("\u2014"), file);
    }
    for (const doc of ["README.md", "VM-RUN.md", "OBSERVATIONS.md", "LICENSE-NOTES.md", "OBSERVATIONS.json"]) {
      assert.ok(!/pilot/i.test(readText(doc)), doc);
    }
  });
});
