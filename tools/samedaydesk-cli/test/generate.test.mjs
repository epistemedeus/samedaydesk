import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { GENERATED, helpFor } from "../src/generate.mjs";
import { COMMANDS, GROUPS } from "../src/manifest.mjs";
import { EXIT } from "../src/errors.mjs";
import { run } from "./helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const file = path => readFileSync(join(root, path), "utf8");

test("checked-in generated files match the manifest (run scripts/generate.mjs on drift)", () => {
  for (const [path, build] of Object.entries(GENERATED)) assert.equal(file(path), build(version), path);
});

test("every command and every flag appears in each completion, the man page and SKILL.md", () => {
  for (const path of Object.keys(GENERATED).filter(name => !/coverage/i.test(name))) {
    const text = file(path);
    for (const command of COMMANDS) {
      for (const word of command.argv) assert.ok(text.includes(path.endsWith(".1") ? word.replace(/-/g, "\\-") : word), `${path}: ${command.id} word ${word}`);
      for (const flag of Object.keys(command.flags)) {
        const needle = path.endsWith(".1") ? `\\-\\-${flag.replace(/-/g, "\\-")}` : path.endsWith(".fish") ? `-l ${flag}` : `--${flag}`;
        assert.ok(text.includes(needle), `${path}: ${command.id} flag ${flag}`);
      }
    }
    assert.ok(!text.includes("\u2014"), `${path} has an em dash`);
  }
  const man = file("generated/samedaydesk.1");
  for (const code of Object.values(EXIT)) assert.ok(man.includes(`.B ${code}\n`), `man exit ${code}`);
  const skill = file("generated/SKILL.md");
  assert.match(skill, /^---\nname: samedaydesk-cli\ndescription: .+\n---\n/);
  for (const command of COMMANDS) assert.ok(skill.includes(`| \`${command.id}\` |`), `skill row ${command.id}`);
});

test("bash completion is valid and completes groups, verbs and flags", { skip: spawnSync("bash", ["--version"]).status !== 0 }, () => {
  const script = join(root, "generated/samedaydesk.bash");
  execFileSync("bash", ["-n", script]);
  const complete = (...words) => execFileSync("bash", ["-c", `source "${script}"; COMP_WORDS=(${words.map(word => `'${word}'`).join(" ")}); COMP_CWORD=${words.length - 1}; _samedaydesk; printf '%s\\n' "\${COMPREPLY[@]}"`], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(complete("samedaydesk", "rea"), ["readiness"]);
  assert.deepEqual(complete("samedaydesk", "readiness", "").sort(), ["check"]);
  assert.ok(complete("samedaydesk", "readiness", "check", "--h").includes("--host"));
  assert.ok(complete("samedaydesk", "market", "discover", "--").includes("--cursor"));
});

test("completion command prints the generated script; unknown shell is a typed input error", async () => {
  for (const shell of ["bash", "zsh", "fish"]) {
    const out = execFileSync(process.execPath, [join(root, "bin/samedaydesk.mjs"), "completion", shell], { encoding: "utf8" });
    const path = { bash: "generated/samedaydesk.bash", zsh: "generated/_samedaydesk", fish: "generated/samedaydesk.fish" }[shell];
    assert.equal(out, file(path));
  }
  const bad = await run(["completion", "tcsh"]);
  assert.equal(bad.exit, EXIT.input);
  assert.equal(bad.out[0].error.code, "invalid_input");
});

test("help is progressive and derived from the manifest", async () => {
  const top = await run(["help"]);
  assert.equal(top.out[0].result.level, 0);
  assert.deepEqual(top.out[0].result.groups.map(group => group.id), GROUPS.map(group => group.id));
  assert.deepEqual(top.out[0].result.groups.flatMap(group => group.commands).sort(), COMMANDS.map(command => command.id).sort());
  for (const group of GROUPS) {
    const one = await run(["help", group.id]);
    assert.deepEqual(one.out[0].result, { schema: "samedaydesk.cli.help.v1", cliVersion: version, noninteractive: true, ...helpFor(group.id) });
    assert.deepEqual(one.out[0].result.commands.map(command => command.id), COMMANDS.filter(command => command.group === group.id).map(command => command.id));
  }
  const bad = await run(["help", "nope"]);
  assert.equal(bad.exit, EXIT.input);
});
