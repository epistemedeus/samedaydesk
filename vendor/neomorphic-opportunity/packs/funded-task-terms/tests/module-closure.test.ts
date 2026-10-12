import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules/typescript/bin/tsc");
const goldenPath = join(root, "fixtures/golden/complete.terms.json");
const floatRewardPath = join(root, "fixtures/negatives/float-reward.json");

function run(command: string, args: string[], cwd = root) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function tscFlags(extra: string[]) {
  return [
    tsc,
    "--strict",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--noEmit",
    "--pretty",
    "false",
    ...extra,
  ];
}

test.before(() => {
  const built = run("npm", ["run", "build", "--silent"]);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
});

test("package exports keep the source entry and the hash.mjs runtime", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    exports: {
      ".": { types: string; import: string };
      "./hash": { types: string; import: string; default: string };
    };
    bin: { "funded-task-terms": string };
  };
  assert.equal(pkg.exports["."].types, "./src/index.ts");
  assert.equal(pkg.exports["."].import, "./src/index.ts");
  assert.equal(pkg.exports["./hash"].types, "./src/hash.d.ts");
  assert.equal(pkg.exports["./hash"].import, "./src/hash.mjs");
  assert.equal(pkg.exports["./hash"].default, "./src/hash.mjs");
  assert.equal(pkg.bin["funded-task-terms"], "./bin/validate.mjs");
});

test("NodeNext typechecks the .mjs imports only when the matching .d.mts files exist", () => {
  const resolved = run(process.execPath, tscFlags(["tests/mjs-resolution-probe.ts"]));
  assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);

  const missing = mkdtempSync(join(tmpdir(), "funded-mjs-types-"));
  try {
    cpSync(join(root, "src"), join(missing, "src"), {
      recursive: true,
      filter: (source) => !source.endsWith(".d.mts"),
    });
    cpSync(join(root, "package.json"), join(missing, "package.json"));
    cpSync(join(root, "tsconfig.json"), join(missing, "tsconfig.json"));
    symlinkSync(join(root, "node_modules"), join(missing, "node_modules"));
    const failed = run(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit", "--pretty", "false"], missing);
    const output = `${failed.stdout}\n${failed.stderr}`;
    assert.notEqual(failed.status, 0, output);
    assert.match(output, /TS7016[\s\S]*canonical\.mjs|canonical\.mjs[\s\S]*TS7016/);
    assert.match(output, /TS7016[\s\S]*hash\.mjs|hash\.mjs[\s\S]*TS7016/);
    assert.equal(output.includes("hash.d.ts"), false);
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }
});

test("built dist executes the copied canonical.mjs and hash.mjs closure", async () => {
  const hashJs = readFileSync(join(root, "dist/hash.js"), "utf8");
  const canonicalJs = readFileSync(join(root, "dist/canonical.js"), "utf8");
  assert.match(hashJs, /from\s+["']\.\/hash\.mjs["']/);
  assert.match(canonicalJs, /from\s+["']\.\/canonical\.mjs["']/);

  const distHash = await import(pathToFileURL(join(root, "dist/hash.js")).href);
  const distCanonical = await import(pathToFileURL(join(root, "dist/canonical.js")).href);
  const srcHash = await import(pathToFileURL(join(root, "src/hash.mjs")).href);
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as unknown;
  const sample = { b: 1, a: "term" };

  assert.equal(distCanonical.canonicalize(sample), '{"a":"term","b":1}');
  assert.equal(distHash.hashTermsVersion(sample), srcHash.hashTermsVersion(sample));
  assert.equal(distHash.hashTermsVersion(golden), srcHash.hashTermsVersion(golden));
  assert.equal(distHash.isTermsVersionHash(distHash.hashTermsVersion(golden)), true);

  const typed = run(process.execPath, tscFlags(["tests/dist-closure-probe.ts"]));
  assert.equal(typed.status, 0, `${typed.stdout}\n${typed.stderr}`);

  const broken = mkdtempSync(join(tmpdir(), "funded-dist-open-"));
  try {
    cpSync(join(root, "dist"), join(broken, "dist"), { recursive: true });
    rmSync(join(broken, "dist/hash.mjs"));
    rmSync(join(broken, "dist/canonical.mjs"));
    const opened = run(process.execPath, [
      "--input-type=module",
      "-e",
      [
        "try {",
        "  await import(process.argv[1]);",
        "  console.error('imported');",
        "  process.exit(2);",
        "} catch (error) {",
        "  const code = error && error.code;",
        "  const message = error instanceof Error ? error.message : String(error);",
        "  if (code !== 'ERR_MODULE_NOT_FOUND' || !message.includes('hash.mjs')) {",
        "    console.error(code);",
        "    console.error(message);",
        "    process.exit(1);",
        "  }",
        "}",
      ].join("\n"),
      pathToFileURL(join(broken, "dist/hash.js")).href,
    ]);
    assert.equal(opened.status, 0, `${opened.stdout}\n${opened.stderr}`);
  } finally {
    rmSync(broken, { recursive: true, force: true });
  }
});

test("declared package path and CLI accept the golden terms and reject float reward", () => {
  const consumer = mkdtempSync(join(tmpdir(), "funded-consumer-"));
  try {
    mkdirSync(join(consumer, "node_modules/@neomorphic"), { recursive: true });
    symlinkSync(root, join(consumer, "node_modules/@neomorphic/funded-task-terms"));
    symlinkSync(join(root, "node_modules/tsx"), join(consumer, "node_modules/tsx"));
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ type: "module", private: true }));
    writeFileSync(
      join(consumer, "hash-consumer.ts"),
      [
        'import { TERMS_VERSION_PREFIX, hashTermsVersion, isTermsVersionHash } from "@neomorphic/funded-task-terms/hash";',
        "const digest: string = hashTermsVersion({ b: 1, a: 'term' });",
        "const prefix: 'sha256:' = TERMS_VERSION_PREFIX;",
        "const accepted: boolean = isTermsVersionHash(digest);",
        "export { accepted, digest, prefix };",
      ].join("\n"),
    );
    writeFileSync(
      join(consumer, "consumer.ts"),
      [
        'import { hashTermsVersion, isTermsVersionHash, TERMS_VERSION_PREFIX } from "@neomorphic/funded-task-terms/hash";',
        'import { canonicalize, hashTermsVersion as hashFromIndex, parseTerms } from "@neomorphic/funded-task-terms";',
        `const golden = ${readFileSync(goldenPath, "utf8")};`,
        "const viaHash = hashTermsVersion(golden);",
        "const viaIndex = hashFromIndex(golden);",
        "if (viaHash !== viaIndex) throw new Error('hash subpath diverged from package index');",
        "if (!isTermsVersionHash(viaHash)) throw new Error('hash subpath rejected its digest');",
        "if (TERMS_VERSION_PREFIX !== 'sha256:') throw new Error('prefix changed');",
        "const parsed = parseTerms(golden);",
        "if (!parsed.ok) throw new Error(parsed.message);",
        "if (canonicalize({ b: 1, a: 'term' }) !== '{\"a\":\"term\",\"b\":1}') throw new Error('canonical order changed');",
        "console.log(viaHash);",
      ].join("\n"),
    );
    const typed = run(process.execPath, tscFlags(["hash-consumer.ts"]), consumer);
    assert.equal(typed.status, 0, `${typed.stdout}\n${typed.stderr}`);
    const ran = run(process.execPath, ["--import", "tsx", "consumer.ts"], consumer);
    assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
    assert.match(ran.stdout.trim(), /^sha256:[0-9a-f]{64}$/);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }

  const accepted = run(process.execPath, [join(root, "bin/validate.mjs"), goldenPath]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const acceptedBody = JSON.parse(accepted.stdout) as { ok: boolean; termsVersion: string };
  assert.equal(acceptedBody.ok, true);
  assert.match(acceptedBody.termsVersion, /^sha256:[0-9a-f]{64}$/);

  const rejected = run(process.execPath, [join(root, "bin/validate.mjs"), floatRewardPath]);
  assert.equal(rejected.status, 1);
  const rejectedBody = JSON.parse(rejected.stderr) as { ok: boolean; code: string };
  assert.equal(rejectedBody.ok, false);
  assert.equal(typeof rejectedBody.code, "string");
});
