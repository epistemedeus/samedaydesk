import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { acquireArchive } from "./acquire.mjs";
import { resolveNamedTarget, targetById } from "./catalog.mjs";
import { runFirstCommands } from "./commands.mjs";
import { checkOutputContract } from "./contract.mjs";
import { AssessmentError } from "./errors.mjs";
import { extractArchive } from "./extract.mjs";
import { createFetcher } from "./fetch.mjs";
import { PACKAGE_ROOT, REPO_ROOT } from "./paths.mjs";
import { buildAssessment, writeAssessmentFiles } from "./report.mjs";
import { refuseSettleRequest } from "./settle-guard.mjs";

function resolveExisting(pathLike) {
  if (!pathLike) return null;
  const candidates = [];
  if (isAbsolute(pathLike)) candidates.push(pathLike);
  else {
    candidates.push(resolve(process.cwd(), pathLike));
    candidates.push(resolve(PACKAGE_ROOT, pathLike));
    candidates.push(resolve(REPO_ROOT, pathLike));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function parseArgs(argv) {
  const out = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--live") out.live = true;
    else if (a === "--settle" || a === "--pay" || a === "--live-settle") out.settle = true;
    else if (a === "--fixture-dir" || a === "--out" || a === "--target" || a === "--expected-bytes" || a === "--expected-sha256") {
      const n = argv[i + 1];
      if (!n || n.startsWith("--")) {
        throw new AssessmentError("missing_flag_value", `${a} requires a value`, 2);
      }
      const key =
        a === "--fixture-dir"
          ? "fixtureDir"
          : a === "--out"
            ? "out"
            : a === "--target"
              ? "target"
              : a === "--expected-bytes"
                ? "expectedBytes"
                : "expectedSha256";
      out[key] = n;
      i++;
    } else if (a.startsWith("--")) {
      throw new AssessmentError("unknown_flag", `unknown flag ${a}`, 2);
    } else {
      out.rest.push(a);
    }
  }
  if (out.live && out.fixtureDir) {
    throw new AssessmentError("bad_mode", "do not combine --live and --fixture-dir", 2);
  }
  return out;
}

export function helpText() {
  return `SameDayDesk proposed $5 cold-start assessment (fixture / non-settling).

Literal journey:
  node tools/cold-start-assessment/bin/assess.mjs --fixture-dir fixtures/ok --out /tmp/w2-06-out

Writes assessment.json + explanation.md. purchaseAuthority is false. fundingState is fixture.
Proposed price is 5.000000 USDC on network fixture (5000000 atomic) and cannot settle.
Existing extract $0.005 and seller-integrity-audit $0.01 stay unchanged.

Options:
  --target capability-preflight | useful-jobs | <archive path>
  --fixture-dir <dir>     local fixture origin (tests; no live DNS)
  --live                  optional public HTTPS acquire (not required for tests)
  --out <dir>             required output directory

No credentials. No payment headers. No GitHub host for the public archive path.
A usable reproduction is not actual_completion and is not a paid sale.
`;
}

function resolveTargetSpec(options) {
  const raw = options.target || "capability-preflight";
  const named = targetById(raw);
  if (named) return { kind: "named", target: named, archivePath: null };
  const archivePath = resolveExisting(raw);
  return { kind: "path", target: resolveNamedTarget("capability-preflight"), archivePath };
}

function expectedPins(target, fetcher, options, archivePath) {
  const url = archivePath
    ? archivePath.startsWith("/")
      ? archivePath
      : resolve(archivePath)
    : target.live.archive;
  const fromOrigin = fetcher.expectedFor?.(target.live.archive);
  let bytes = target.live.bytes;
  let sha256 = target.live.sha256;
  if (fromOrigin?.bytes) bytes = fromOrigin.bytes;
  if (fromOrigin?.sha256) sha256 = fromOrigin.sha256;
  if (options.expectedBytes) bytes = Number(options.expectedBytes);
  if (options.expectedSha256) sha256 = String(options.expectedSha256).toLowerCase();
  return {
    archiveUrl: archivePath || target.live.archive,
    bytes: Number(bytes),
    sha256: String(sha256).toLowerCase(),
    url,
  };
}

export async function runAssessment(options) {
  refuseSettleRequest(options);
  if (!options.out) {
    throw new AssessmentError("missing_out", "--out is required", 2);
  }
  if (options.live && options.fixtureDir) {
    throw new AssessmentError("bad_mode", "do not combine --live and --fixture-dir", 2);
  }
  if (!options.live && !options.fixtureDir && !options.target) {
    throw new AssessmentError(
      "missing_mode",
      "pass --fixture-dir fixtures/ok (tests) or --live (optional public HTTPS)",
      2,
    );
  }

  const spec = resolveTargetSpec(options);
  const target = spec.target;
  const outDir = resolve(options.out);
  const workDir = mkdtempSync(join(tmpdir(), "sds-csa-"));

  let mode = "fixture";
  if (options.live) mode = "live";
  else if (spec.archivePath && !options.fixtureDir) mode = "file";

  const fetcher = createFetcher({
    mode: mode === "file" ? "file" : options.live ? "live" : "fixture",
    fixtureDir: options.fixtureDir ? resolveExisting(options.fixtureDir) : null,
  });

  const expected = expectedPins(target, fetcher, options, spec.kind === "path" ? spec.archivePath : null);
  if (spec.kind === "path") {
    expected.archiveUrl = spec.archivePath.startsWith("file:")
      ? spec.archivePath
      : spec.archivePath;
  }

  try {
    const acquisition = await acquireArchive({
      fetchUrl: fetcher.fetchUrl,
      target,
      expected,
      workDir,
    });

    if (!acquisition.ok) {
      const assessment = buildAssessment({
        target,
        mode,
        acquisition: { ...acquisition, extracted: false, stoppedBeforeExtract: true },
        commands: [],
        contract: { ok: false, findings: [], honesty: { demo: true } },
      });
      const files = writeAssessmentFiles(outDir, assessment);
      return { exitCode: 1, assessment, files };
    }

    const extracted = extractArchive({
      archivePath: acquisition.archivePath,
      extractDir: join(workDir, "extract"),
      archiveRoot: target.archiveRoot,
      entry: target.entry,
    });
    if (!extracted.ok) {
      const assessment = buildAssessment({
        target,
        mode,
        acquisition: {
          ...acquisition,
          extracted: false,
          stoppedBeforeExtract: false,
          code: extracted.code,
          message: extracted.message,
        },
        commands: [],
        contract: { ok: false, findings: [], honesty: { demo: true } },
      });
      const files = writeAssessmentFiles(outDir, assessment);
      return { exitCode: 1, assessment, files };
    }

    const ran = runFirstCommands({ target, extractRoot: extracted.extractRoot });
    const contract = checkOutputContract({
      target,
      extractRoot: extracted.extractRoot,
      documents: ran.documents,
      commands: ran.commands,
    });
    const assessment = buildAssessment({
      target,
      mode,
      acquisition: { ...acquisition, extracted: true, stoppedBeforeExtract: false },
      commands: ran.commands,
      contract,
    });
    const files = writeAssessmentFiles(outDir, assessment);
    return { exitCode: assessment.ok ? 0 : 1, assessment, files };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export async function main(argv, io = process) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      io.stdout.write(helpText());
      return 0;
    }
    const result = await runAssessment(options);
    io.stdout.write(`${JSON.stringify({ ok: result.assessment.ok, out: options.out, files: result.files }, null, 2)}\n`);
    return result.exitCode;
  } catch (error) {
    const code = error instanceof AssessmentError ? error.exitCode : 1;
    const payload = {
      ok: false,
      error: {
        code: error.code || "assessment_failed",
        message: error.message,
      },
      purchaseAuthority: false,
      fundingState: "fixture",
      cannotSettle: true,
    };
    io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return code;
  }
}
