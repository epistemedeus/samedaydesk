#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  UNBOUND_CODE,
  bindClaimedHash,
  defaultGitDirs,
  evaluateFile,
  runSuite,
} from "./lib.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    hash: { type: "string" },
    claim: { type: "string" },
    suite: { type: "boolean", default: false },
    "expect-reject": { type: "string" },
    "git-dir": { type: "string", multiple: true },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`Contribution provenance: claimed SHA/signature must bind a git object.

Usage:
  node tools/contribution-provenance/cli.mjs --hash <sha>
  node tools/contribution-provenance/cli.mjs --claim <file.json>
  node tools/contribution-provenance/cli.mjs --suite
  node tools/contribution-provenance/cli.mjs --expect-reject ${UNBOUND_CODE} --hash <sha>
  node tools/contribution-provenance/cli.mjs --expect-reject <code> --claim <file.json>
  node tools/contribution-provenance/cli.mjs --git-dir <path> --hash <sha>

Runs local git cat-file -t only. No GitHub API, no remotes, no upstream mutation.
Default stores are the vendored object-store and this repository .git.
Inherited GIT_DIR / GIT_OBJECT_DIRECTORY do not expand the bind set.
Solution-shaped text is a lead. Commenter text is never adoption.
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;
const gitDirs = defaultGitDirs({ extraGitDirs: values["git-dir"] ?? [] });

function write(value, ok) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(ok ? 0 : 1);
}

const modeCount = [values.suite, Boolean(values.hash), Boolean(values.claim)].filter(Boolean).length;
if (modeCount !== 1 || positionals.length > 0) {
  process.stderr.write("Pass exactly one of --suite, --hash, or --claim.\n");
  process.exit(2);
}

if (values.suite) {
  if (values["expect-reject"]) {
    process.stderr.write("--suite does not take --expect-reject.\n");
    process.exit(2);
  }
  const report = runSuite({ gitDirs });
  write(
    {
      ok: report.ok,
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      results: report.results.map((item) => ({
        file: item.filePath,
        expect: item.expect,
        expectedCode: item.expectedCode ?? null,
        ok: item.ok,
        code: item.code ?? null,
        actorLabel: item.actorLabel ?? null,
        objectType: item.objectType ?? null,
        codes: item.errors.map((error) => error.code),
      })),
    },
    report.ok,
  );
}

const expectedCode = values["expect-reject"];

if (values.hash) {
  const result = bindClaimedHash(values.hash, gitDirs);
  const payload = {
    ok: result.ok,
    code: result.code,
    claimedHash: result.claimedHash,
    objectType: result.objectType,
    gitDir: result.gitDir,
    gitCatFileExit: result.gitCatFileExit,
    adoption: result.adoption,
    textIsLeadOnly: result.textIsLeadOnly,
    errors: result.errors,
  };
  if (expectedCode) {
    const ok = !result.ok && result.code === expectedCode;
    write({ ...payload, ok, expectReject: expectedCode }, ok);
  }
  write(payload, result.ok);
}

const result = evaluateFile(values.claim, { gitDirs });
if (expectedCode) {
  const codes = result.errors.map((error) => error.code);
  const ok = !result.ok && codes.includes(expectedCode);
  write(
    {
      ok,
      expectReject: expectedCode,
      file: result.filePath,
      code: result.code,
      actorLabel: result.actorLabel,
      objectType: result.objectType,
      gitCatFileExit: result.gitCatFileExit,
      codes,
      errors: result.errors,
    },
    ok,
  );
}

write(
  {
    ok: result.ok,
    code: result.code,
    file: result.filePath,
    claimId: result.claimId,
    actorLabel: result.actorLabel,
    adoption: result.adoption,
    claimedHash: result.claimedHash,
    objectType: result.objectType,
    gitDir: result.gitDir,
    gitCatFileExit: result.gitCatFileExit,
    textIsLeadOnly: result.textIsLeadOnly,
    errors: result.errors,
  },
  result.ok,
);
