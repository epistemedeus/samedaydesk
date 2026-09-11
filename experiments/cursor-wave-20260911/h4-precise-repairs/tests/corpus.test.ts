import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { designCanary, invokeLiveSettle } from "../src/canary.ts";
import {
  CorpusRejectedError,
  DEFAULT_CORPUS_DIR,
  evaluateCorpus,
  loadCorpus,
  runCorpus,
} from "../src/corpus.ts";
import {
  CORPUS_DISPOSITIONS,
  REQUIRED_CORPUS_IDS,
  type CorpusFixture,
} from "../src/corpus-types.ts";
import { FIXTURE_BECOMES_SALE, LIVE_SETTLE_REFUSED } from "../src/failures.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(packRoot, "bin/repair.ts");
const realCorpusDir = join(packRoot, "fixtures/corpus");

function validFixture(overrides: Record<string, unknown> = {}): CorpusFixture {
  return {
    id: "M-F02-pr",
    title: "F02 PR create URL only",
    disposition: "noted",
    inSdsScope: false,
    saleState: "not_a_sale",
    provenance: "fixture",
    authorized: false,
    kind: "note",
    evaluator: "child-10",
    briefPath: null,
    notes: "Note only; not a sale.",
    facts: { source: "temp" },
    ...overrides,
  } as CorpusFixture;
}

function withTempCorpus(
  files: Record<string, unknown>,
  fn: (dir: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "h4r-corpus-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      const payload = typeof body === "string" ? body : JSON.stringify(body, null, 2);
      writeFileSync(join(dir, name), payload);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCli(args: string[], cwd = packRoot) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", bin, ...args],
    { encoding: "utf8", cwd },
  );
}

function jsonStdout(result: ReturnType<typeof runCli>) {
  assert.equal(result.error, undefined, result.stderr);
  const text = String(result.stdout || "").trim();
  assert.ok(text, `empty stdout stderr=${result.stderr}`);
  return JSON.parse(text);
}

test("loadCorpus reads a temp noted fixture with required fields", () => {
  withTempCorpus({ "M-F02-pr.json": validFixture() }, (dir) => {
    const fixtures = loadCorpus(dir);
    assert.equal(fixtures.length, 1);
    assert.equal(fixtures[0].id, "M-F02-pr");
    assert.equal(fixtures[0].disposition, "noted");
    assert.equal(fixtures[0].saleState, "not_a_sale");
    assert.equal(fixtures[0].provenance, "fixture");
    assert.equal(fixtures[0].authorized, false);
    assert.equal(fixtures[0].kind, "note");
    assert.equal(typeof fixtures[0].title, "string");
    assert.equal(typeof fixtures[0].evaluator, "string");
    assert.equal(typeof fixtures[0].notes, "string");
    assert.equal(typeof fixtures[0].inSdsScope, "boolean");
    assert.ok(fixtures[0].facts && typeof fixtures[0].facts === "object");

    const evaluation = evaluateCorpus(fixtures);
    assert.equal(evaluation.ok, true);
    assert.equal(evaluation.saleState, "not_a_sale");
    assert.equal(evaluation.canarySettled, false);
    assert.deepEqual(evaluation.rejected, []);
    assert.deepEqual(evaluation.results, [
      { id: "M-F02-pr", disposition: "noted", notes: "Note only; not a sale." },
    ]);
    assert.equal(evaluation.missingIds.includes("M-F02-pr"), false);
    for (const id of REQUIRED_CORPUS_IDS) {
      if (id !== "M-F02-pr") assert.equal(evaluation.missingIds.includes(id), true);
    }
  });
});

test("disposition notes maps to noted", () => {
  const evaluation = evaluateCorpus([validFixture({ disposition: "notes" })]);
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.results[0].disposition, "noted");
});

test("underscore-prefixed JSON is ignored even if it would be a sale", () => {
  withTempCorpus(
    {
      "M-F02-pr.json": validFixture(),
      "_customer.json": validFixture({ provenance: "customer" }),
    },
    (dir) => {
      const fixtures = loadCorpus(dir);
      assert.equal(fixtures.length, 1);
      assert.equal(fixtures[0].provenance, "fixture");
      const evaluation = runCorpus(dir);
      assert.equal(evaluation.ok, true);
    },
  );
});

test("fixture with provenance customer is rejected and cannot become customer", () => {
  const customer = validFixture({ provenance: "customer" });
  const evaluation = evaluateCorpus([customer]);
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.results.length, 0);
  assert.equal(evaluation.rejected.length, 1);
  assert.deepEqual(evaluation.rejected[0].failure, FIXTURE_BECOMES_SALE);
  assert.equal(evaluation.saleState, "not_a_sale");
  assert.equal(evaluation.canarySettled, false);

  withTempCorpus({ "customer.json": customer }, (dir) => {
    assert.throws(
      () => loadCorpus(dir),
      (err: unknown) => {
        assert.ok(err instanceof CorpusRejectedError);
        assert.deepEqual(err.failure, FIXTURE_BECOMES_SALE);
        return true;
      },
    );
    const ran = runCorpus(dir);
    assert.equal(ran.ok, false);
    assert.deepEqual(ran.rejected[0].failure, FIXTURE_BECOMES_SALE);
    assert.equal(
      ran.results.some((row) => "provenance" in row && row.provenance === "customer"),
      false,
    );
  });
});

test("saleState other than not_a_sale is fixture-becomes-sale", () => {
  const evaluation = evaluateCorpus([validFixture({ saleState: "paid" })]);
  assert.equal(evaluation.ok, false);
  assert.deepEqual(evaluation.rejected[0].failure, FIXTURE_BECOMES_SALE);
});

test("authorized true / settle attempt does not settle", () => {
  const evaluation = evaluateCorpus([validFixture({ authorized: true })]);
  assert.equal(evaluation.ok, false);
  assert.deepEqual(evaluation.rejected[0].failure, LIVE_SETTLE_REFUSED);
  assert.equal(evaluation.canarySettled, false);
  assert.equal(evaluation.saleState, "not_a_sale");

  const settle = invokeLiveSettle(designCanary());
  assert.equal(settle.ok, false);
  assert.equal(settle.rejected, true);
  assert.deepEqual(settle.failure, LIVE_SETTLE_REFUSED);
  assert.equal(settle.failure.settleInvoked, false);

  withTempCorpus({ "authorized.json": validFixture({ authorized: true }) }, (dir) => {
    const ran = runCorpus(dir);
    assert.equal(ran.ok, false);
    assert.equal(ran.canarySettled, false);
    assert.deepEqual(ran.rejected[0].failure, LIVE_SETTLE_REFUSED);
  });
});

test("empty corpus dir is ok with missing required ids", () => {
  withTempCorpus({}, (dir) => {
    const fixtures = loadCorpus(dir);
    assert.deepEqual(fixtures, []);
    const evaluation = runCorpus(dir);
    assert.equal(evaluation.ok, true);
    assert.deepEqual(evaluation.results, []);
    assert.deepEqual(evaluation.missingIds, [...REQUIRED_CORPUS_IDS]);
    assert.equal(evaluation.canarySettled, false);
  });
});

test("real corpus dir includes every required id and missingIds is empty", () => {
  const evaluation = runCorpus(realCorpusDir);
  assert.equal(evaluation.ok, true);
  assert.deepEqual(evaluation.missingIds, []);
  assert.equal(evaluation.saleState, "not_a_sale");
  assert.equal(evaluation.canarySettled, false);
  const ids = evaluation.results.map((row) => row.id);
  for (const id of REQUIRED_CORPUS_IDS) {
    assert.equal(ids.includes(id), true, `missing required corpus id ${id}`);
  }
});

test("any present pack corpus fixtures match schema and stay not a sale", () => {
  if (!existsSync(realCorpusDir)) {
    const evaluation = runCorpus(realCorpusDir);
    assert.equal(evaluation.ok, true);
    assert.deepEqual(evaluation.missingIds, [...REQUIRED_CORPUS_IDS]);
    return;
  }
  const evaluation = runCorpus(realCorpusDir);
  assert.equal(evaluation.saleState, "not_a_sale");
  assert.equal(evaluation.canarySettled, false);
  assert.deepEqual(
    evaluation.rejected,
    [],
    `present corpus fixtures were rejected: ${JSON.stringify(evaluation.rejected, null, 2)}`,
  );
  assert.equal(evaluation.ok, true);
  for (const row of evaluation.results) {
    assert.equal(typeof row.id, "string");
    assert.equal(typeof row.notes, "string");
    assert.equal((CORPUS_DISPOSITIONS as readonly string[]).includes(row.disposition), true);
    assert.equal(evaluation.missingIds.includes(row.id), false);
  }
  for (const id of evaluation.missingIds) {
    assert.equal((REQUIRED_CORPUS_IDS as readonly string[]).includes(id), true);
  }
  const loaded = loadCorpus(realCorpusDir);
  assert.equal(loaded.length, evaluation.results.length);
  for (const fixture of loaded) {
    assert.equal(fixture.saleState, "not_a_sale");
    assert.equal(fixture.provenance, "fixture");
    assert.equal(fixture.authorized, false);
  }
});

test("CLI help does not throw", () => {
  const result = runCli(["help"]);
  assert.equal(result.status, 0, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.ok, true);
  assert.equal(body.command, "help");
  assert.equal(body.saleState, "not_a_sale");
  assert.equal(body.canarySettled, false);
});

test("CLI corpus on real fixtures dir does not throw", () => {
  const result = runCli(["corpus", "--fixtures", "fixtures/corpus/"]);
  assert.equal(result.error, undefined, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.command, "corpus");
  assert.equal(body.saleState, "not_a_sale");
  assert.equal(body.canarySettled, false);
  assert.ok(Array.isArray(body.results));
  assert.ok(Array.isArray(body.missingIds));
  assert.ok(Array.isArray(body.rejected));
  if (body.rejected.length > 0) {
    assert.equal(result.status, 2);
    assert.equal(body.ok, false);
  } else {
    assert.equal(result.status, 0);
    assert.equal(body.ok, true);
  }
  assert.equal(DEFAULT_CORPUS_DIR, realCorpusDir);
});

test("CLI repair corpus argv on a temp noted fixture exits 0", () => {
  withTempCorpus({ "M-F02-pr.json": validFixture() }, (dir) => {
    const result = runCli(["repair", "corpus", "--fixtures", dir]);
    assert.equal(result.status, 0, result.stderr);
    const body = jsonStdout(result);
    assert.equal(body.ok, true);
    assert.equal(body.command, "corpus");
    assert.equal(body.saleState, "not_a_sale");
    assert.equal(body.canarySettled, false);
    assert.equal(body.results[0].id, "M-F02-pr");
    assert.equal(body.results[0].disposition, "noted");
  });
});

test("CLI exits 2 when a fixture has provenance customer", () => {
  withTempCorpus(
    { "customer.json": validFixture({ provenance: "customer" }) },
    (dir) => {
      const result = runCli(["corpus", "--fixtures", dir]);
      assert.equal(result.status, 2, result.stderr);
      const body = jsonStdout(result);
      assert.equal(body.ok, false);
      assert.equal(body.command, "corpus");
      assert.equal(body.saleState, "not_a_sale");
      assert.equal(body.canarySettled, false);
      assert.equal(body.rejected[0].failure.code, "fixture-becomes-sale");
    },
  );
});

test("CLI exits 2 when authorized true and does not settle", () => {
  withTempCorpus(
    { "authorized.json": validFixture({ authorized: true }) },
    (dir) => {
      const result = runCli(["corpus", "--fixtures", dir]);
      assert.equal(result.status, 2, result.stderr);
      const body = jsonStdout(result);
      assert.equal(body.ok, false);
      assert.equal(body.canarySettled, false);
      assert.equal(body.rejected[0].failure.code, "live-settle-refused");
    },
  );
});
