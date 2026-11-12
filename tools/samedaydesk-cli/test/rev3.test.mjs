// CLI plan revision 3 (pilot@e597252f): task manifest, local preview versus
// remote quote, recovery before dispatch, no overclaims, nonsecret handbacks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { COMMANDS, TASKS, RECOVERY_CLASSES, commandById } from "../src/manifest.mjs";
import { EXIT } from "../src/errors.mjs";
import { json, run, tempDir, REPORT } from "./helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUOTE = { schema: "neomorphic.machine-gateway.quote.v1", quoteId: "00000000-0000-4000-8000-000000000000", routeId: "lockfile.delta", tenantBound: false, executable: false, price: { amount: 0, unit: "usd-micros" } };
const input = () => Readable.from([Buffer.from('{"before":"a","after":"b"}')]);

test("task manifest maps each task to real commands and their exact wire operation ids", async () => {
  assert.ok(TASKS.length >= 5);
  for (const task of TASKS) {
    assert.match(task.id, /^task\.[a-z_]+$/);
    for (const step of task.wire) {
      const command = commandById(step.command);
      assert.ok(command, `${task.id}: ${step.command}`);
      assert.deepEqual(step.operations, (command.http ?? []).map(item => item.operationId));
    }
  }
  const { out } = await run(["commands"]);
  assert.deepEqual(out[0].result.tasks.map(task => task.id), TASKS.map(task => task.id));
  for (const command of COMMANDS) {
    assert.ok(Object.hasOwn(RECOVERY_CLASSES, command.recoveryClass), `${command.id} recovery class`);
    if (command.http) assert.ok(command.schemaRefs.length > 0, `${command.id} references an authoritative schema`);
  }
});

test("--dry-run is a local preview that sends nothing; gateway quote is a remote quote", async () => {
  const local = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-", "--dry-run"], { stdin: input() });
  assert.equal(local.calls.length, 0);
  assert.equal(local.out[0].result.kind, "local_preview");
  assert.equal(local.out[0].result.sent, false);
  assert.ok(local.out[0].result.liveUnknown.length > 0);
  const remote = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-"], { stdin: input(), answers: [json(200, QUOTE)] });
  assert.equal(remote.out[0].result.kind, "remote_quote");
  assert.equal(commandById("gateway.quote").effect, "remote_quote");
});

test("recovery record is persisted before a vulnerable POST and survives a failure after sending", async () => {
  const dir = tempDir();
  const file = join(dir, "attempt.json");
  let presentAtDispatch = null;
  const lost = () => { presentAtDispatch = existsSync(file); throw new TypeError("socket closed"); };
  const failed = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-", "--recovery-file", file], { stdin: input(), answers: [lost] });
  assert.equal(presentAtDispatch, true, "record existed when the request was dispatched");
  assert.equal(failed.calls.length, 1, "sent once, never retried");
  assert.equal(failed.exit, EXIT.transport);
  assert.ok(existsSync(file));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const record = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(record.schema, "samedaydesk.cli.recovery-record.v1");
  assert.equal(record.operationId, "quoteRoute");
  assert.equal(record.recoveryClass, "unresolved_post_no_key");
  assert.match(record.inputDigest, /^[a-f0-9]{64}$|^sha256:/);
  assert.match(record.meaning, /does not show whether the server applied it/);
  assert.ok(!JSON.stringify(record).match(/bearer|authorization|cookie|password|secret/i));
});

test("if the recovery record cannot be written, nothing is sent", async () => {
  const dir = tempDir();
  const file = join(dir, "exists.json");
  writeFileSync(file, "{}", { mode: 0o600 });
  for (const path of [file, "relative.json"]) {
    const { exit, out, calls } = await run(["gateway", "test", "--route", "lockfile.delta", "--recovery-file", path], { answers: [json(200, {})] });
    assert.equal(calls.length, 0);
    assert.equal(exit, EXIT.input);
    assert.equal(out[0].error.code, "recovery_record_failed");
  }
});

const SECRET_KEY = /token|bearer|authorization|cookie|password|secret|session|api.?key|private/i;
function keys(value, found = []) {
  if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { found.push(key); keys(inner, found); }
  return found;
}

test("handbacks carry nonsecret native references and required authority only", async () => {
  const dir = tempDir();
  const readiness = await run(["readiness", "check", "--host", "example.com", "--out", join(dir, "r.json")], { answers: [json(200, REPORT)] });
  const quote = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-"], { stdin: input(), answers: [json(200, QUOTE)] });
  for (const value of [readiness.out[0].result.handback, quote.out[0].result.handback]) {
    assert.equal(value.schema, "samedaydesk.cli.handback.v1");
    assert.equal(value.credentialsIncluded, false);
    assert.ok(value.observedAt && value.contract && value.operationId && value.origin);
    assert.deepEqual(keys(value).filter(key => SECRET_KEY.test(key)), []);
  }
  assert.match(quote.out[0].result.handback.requiredNextAuthority.execute, /tenantBearer/);
  assert.equal(readiness.out[0].result.handback.requiredNextAuthority, null);
});

test("no exactly-once or lost-storage survival claim in docs, help, skill or generated files", async () => {
  const CLAIM = /exactly[- ]once|survives? (a )?(lost|host|storage|disk)|guarantee[sd]? (delivery|recovery|execution)|never lost|lossless recovery/i;
  const files = ["README.md", ...readdirSync(join(root, "generated")).map(name => `generated/${name}`), ...(existsSync(join(root, "docs")) ? readdirSync(join(root, "docs")).map(name => `docs/${name}`) : [])];
  for (const path of files) assert.doesNotMatch(readFileSync(join(root, path), "utf8"), CLAIM, path);
  const { out } = await run(["commands"]);
  assert.doesNotMatch(JSON.stringify(out[0]), CLAIM);
});
