import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { comparePageChange } from "../lib/compare.mjs";
import { PACKAGE_ROOT, runCli } from "../lib/cli.mjs";
import { localHashTermsVersion } from "../lib/hash-terms.mjs";

const fixtures = join(PACKAGE_ROOT, "fixtures");
const customer = join(fixtures, "customer-job");

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write(chunk) { stdout.push(chunk); } },
    stderr: { write(chunk) { stderr.push(chunk); } },
    err() { return stderr.join(""); },
  };
}

test("seeded: live fetch URL input is refused", async () => {
  const io = capture();
  const result = await runCli([
    "compare",
    "--before", "https://example.com/before.json",
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--clock", "2026-09-08T12:00:00.000Z",
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-live-")),
  ], io);
  assert.equal(result.exitCode, 2);
  assert.match(io.err(), /live_fetch_url/);

  const job = await runCli([
    "job",
    "--job", join(fixtures, "reject/live-fetch-url.job.json"),
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-livejob-")),
  ], capture());
  assert.equal(job.exitCode, 2);
  assert.equal(job.error.code, "live_fetch_url");

  const flag = await runCli(["compare", "--live-url", "https://example.com/"], capture());
  assert.equal(flag.exitCode, 2);
  assert.equal(flag.error.code, "live_fetch_url");
});

test("seeded: payment retry is refused", async () => {
  const io = capture();
  const retryFlag = await runCli([
    "compare",
    "--before", join(customer, "before.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--clock", "2026-09-08T12:00:00.000Z",
    "--retry-payment",
  ], io);
  assert.equal(retryFlag.exitCode, 2);
  assert.match(io.err(), /payment_retry/);

  const job = await runCli([
    "job",
    "--job", join(fixtures, "reject/payment-retry.job.json"),
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-pay-")),
  ], capture());
  assert.equal(job.exitCode, 2);
  assert.equal(job.error.code, "payment_retry");
});

test("seeded: extract quote is not success", async () => {
  const io = capture();
  const result = await runCli([
    "compare",
    "--before", join(fixtures, "quote/quote-only.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--clock", "2026-09-08T12:00:00.000Z",
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-quote-")),
  ], io);
  assert.equal(result.exitCode, 2);
  assert.match(io.err(), /quote_as_success/);

  const flag = await runCli([
    "compare",
    "--before", join(customer, "before.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--clock", "2026-09-08T12:00:00.000Z",
    "--treat-quote-as-success",
  ], capture());
  assert.equal(flag.exitCode, 2);
  assert.equal(flag.error.code, "quote_as_success");

  await assert.rejects(
    () => comparePageChange({
      beforePath: join(customer, "before.json"),
      afterPath: join(customer, "after.json"),
      fields: ["title"],
      clock: "2026-09-08T12:00:00.000Z",
      treatQuoteAsSuccess: true,
    }),
    (error) => error.code === "quote_as_success",
  );
});

test("seeded: SAMPLE is not a delivered watch", async () => {
  const io = capture();
  const example = await runCli([
    "compare",
    "--before", join(customer, "before.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--clock", "2026-09-08T12:00:00.000Z",
    "--example",
  ], io);
  assert.equal(example.exitCode, 2);
  assert.match(io.err(), /sample_as_delivered_watch/);

  const job = await runCli([
    "job",
    "--job", join(fixtures, "reject/sample-as-delivered.job.json"),
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-sample-")),
  ], capture());
  assert.equal(job.exitCode, 2);
  assert.equal(job.error.code, "sample_as_delivered_watch");
});

test("I01: integer termsVersion is rejected", async () => {
  const job = await runCli([
    "job",
    "--job", join(fixtures, "reject/integer-terms.job.json"),
    "--out-dir", mkdtempSync(join(tmpdir(), "pc-terms-")),
  ], capture());
  assert.equal(job.exitCode, 2);
  assert.equal(job.error.code, "integer_terms_version");
});

test("I01 hasher format is sha256 plus 64 hex and ignores integer dual-key", () => {
  const hash = localHashTermsVersion({
    schema: "samedaydesk.page-change-offline-job.terms.v0",
    schemaVersion: 1,
    fields: ["title"],
    clock: "2026-09-08T12:00:00.000Z",
    beforeSha256: "a",
    afterSha256: "b",
  });
  assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.throws(
    () => localHashTermsVersion({ schemaVersion: 1, termsVersion: 7 }),
    (error) => error.code === "integer_terms_version",
  );
});
