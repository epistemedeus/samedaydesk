import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "./helpers.mjs";
import { COMMANDS } from "../src/manifest.mjs";
import { EXIT, ERROR_CODES, describe, CliError } from "../src/errors.mjs";

test("help lists every command by group without network", async () => {
  const { exit, out, err, calls } = await run(["help"]);
  assert.equal(exit, 0);
  assert.equal(calls.length, 0);
  assert.equal(err.length, 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].schema, "samedaydesk.cli.result.v1");
  const listed = out[0].result.groups.flatMap(group => group.commands).sort();
  assert.deepEqual(listed, COMMANDS.map(command => command.id).sort());
});

test("no arguments is help", async () => {
  const { exit, out } = await run([]);
  assert.equal(exit, 0);
  assert.equal(out[0].command, "help");
});

test("every manifest command declares effect, auth, output, retry and recovery", () => {
  for (const command of COMMANDS) {
    for (const key of ["id", "argv", "group", "summary", "effect", "auth", "output", "retry", "recovery"]) assert.ok(command[key] !== undefined, `${command.id} lacks ${key}`);
    assert.ok(["none", "read", "fixture", "remote_quote"].includes(command.effect), command.id);
    assert.equal(command.auth, "none", command.id);
    if (command.effect !== "none") assert.ok(Array.isArray(command.http) && command.http.length > 0, command.id);
  }
});

test("commands returns the versioned manifest and filters by group", async () => {
  const all = await run(["commands"]);
  assert.equal(all.out[0].result.schema, "samedaydesk.cli.manifest.v1");
  const gateway = await run(["commands", "--group", "gateway"]);
  assert.ok(gateway.out[0].result.commands.every(command => command.group === "gateway"));
  const bad = await run(["commands", "--group", "nope"]);
  assert.equal(bad.exit, EXIT.input);
  assert.equal(bad.out[0].error.code, "invalid_input");
});

test("schema returns one command and refuses an unknown id", async () => {
  const ok = await run(["schema", "readiness.check"]);
  assert.equal(ok.out[0].result.command.id, "readiness.check");
  assert.equal(ok.out[0].result.command.http[0].operationId, "check_agent_readiness");
  const unknown = await run(["schema", "readiness.nope"]);
  assert.equal(unknown.exit, EXIT.input);
  assert.equal(unknown.out[0].error.code, "unknown_command");
});

test("secret-named flags are refused before any work", async () => {
  for (const flag of ["--token", "--password=x", "--bearer", "--license"]) {
    const { exit, out, err, calls } = await run(["readiness", "check", "--host", "example.com", flag, "x"]);
    assert.equal(exit, EXIT.input);
    assert.equal(out[0].error.code, "secret_in_argv_refused");
    assert.equal(err[0].code, "secret_in_argv_refused");
    assert.equal(calls.length, 0);
    assert.ok(!JSON.stringify(out).includes("\"x\""));
  }
});

test("bad arguments are typed input errors with exit 1", async () => {
  const unknownFlag = await run(["readiness", "check", "--host", "example.com", "--format", "html"]);
  assert.equal(unknownFlag.out[0].error.code, "invalid_arguments");
  const missing = await run(["readiness", "check"]);
  assert.equal(missing.out[0].error.code, "input_required");
  assert.deepEqual(missing.out[0].error.evidence, { flag: "host" });
  const badHost = await run(["readiness", "check", "--host", "http://example.com/x"]);
  assert.equal(badHost.out[0].error.code, "invalid_input");
  const badLimit = await run(["market", "discover", "--limit", "500"]);
  assert.equal(badLimit.out[0].error.code, "invalid_input");
  const unknown = await run(["teleport"]);
  assert.equal(unknown.out[0].error.code, "unknown_command");
  for (const result of [unknownFlag, missing, badHost, badLimit, unknown]) {
    assert.equal(result.exit, 1);
    assert.equal(result.calls.length, 0);
    assert.equal(result.out[0].schema, "samedaydesk.cli.error.v1");
  }
});

test("every error code maps to a declared exit category", () => {
  for (const code of ERROR_CODES) {
    const described = describe(new CliError(code));
    assert.ok(Object.values(EXIT).includes(described.exit), code);
  }
  assert.equal(describe(new Error("boom")).code, "internal");
});

test("the installed bin prints version JSON with no network", () => {
  const bin = fileURLToPath(new URL("../bin/samedaydesk.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [bin, "version"], { encoding: "utf8" });
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  const value = JSON.parse(child.stdout);
  assert.equal(value.result.name, "@samedaydesk/cli");
  const bad = spawnSync(process.execPath, [bin, "readiness", "check", "--cookie", "c"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).error.code, "secret_in_argv_refused");
  assert.equal(JSON.parse(bad.stderr).code, "secret_in_argv_refused");
});
