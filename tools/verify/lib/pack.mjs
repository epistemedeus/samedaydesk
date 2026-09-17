import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { PACKS, USEFUL_JOBS_PIN } from "./catalog.mjs";
import { kitPath, obtainArchiveBin } from "./repo.mjs";
import { clip, parseJsonOutput, runCommand } from "./spawn.mjs";
import { obtainArgv } from "./archive.mjs";

export function packIds() {
  return Object.keys(PACKS);
}

async function ensureUsefulJobsExtract(root) {
  const dir = mkdtempSync(join(tmpdir(), "sds-uj-pack-"));
  const dest = join(dir, `${USEFUL_JOBS_PIN.rootName}.tar.gz`);
  const extractDir = dir;
  const argv = obtainArgv({
    root,
    from: kitPath(root),
    sha: USEFUL_JOBS_PIN.sha256,
    bytes: USEFUL_JOBS_PIN.bytes,
    dest,
    extractDir,
  });
  const ran = await runCommand(argv, { cwd: root, timeoutMs: 60_000 });
  const json = parseJsonOutput(ran.stdout);
  const cli = join(extractDir, USEFUL_JOBS_PIN.rootName, USEFUL_JOBS_PIN.cli);
  if (!existsSync(cli)) {
    const error = new Error("useful-jobs extract missing bin/useful-jobs.mjs");
    error.detail = { stdout: clip(ran.stdout, 400), dest, extractDir, json };
    throw error;
  }
  return { dir, dest, extractDir, cli, cwd: join(cli, "../.."), obtain: json };
}

export async function runPack(parsed, { root, dryRun = false } = {}) {
  const action = parsed.tokens[0];
  if (!action || action === "list") {
    return envelope({
      ok: true,
      command: "pack",
      dryRun,
      evidence: [{ kind: "pack-ids", ids: packIds() }],
      result: { ids: packIds() },
    });
  }
  if (action !== "run") {
    return envelope({
      ok: false,
      command: "pack",
      status: "usage",
      error: failError("USAGE", "pack list | pack run <id> [-- argv]"),
    });
  }

  const id = parsed.tokens[1] || parsed.flags.id;
  const spec = PACKS[id];
  if (!spec) {
    return envelope({
      ok: false,
      command: "pack",
      status: "usage",
      error: failError("USAGE", `unknown pack id; known: ${packIds().join(", ")}`),
    });
  }

  const seeded = Boolean(parsed.seededFailure);
  const childArgv = parsed.childArgv.length
    ? parsed.childArgv
    : seeded && spec.seededArgv
      ? spec.seededArgv
      : spec.defaultArgv || [];

  if (spec.via === "extracted-cli") {
    const evidence = [
      { kind: "pack", id, via: "bin/useful-jobs.mjs" },
      { kind: "obtain-bin", argv: ["node", obtainArchiveBin(root)] },
    ];
    if (dryRun) {
      return envelope({
        ok: true,
        command: "pack",
        dryRun: true,
        feature: spec.feature,
        evidence: [...evidence, { kind: "argv", argv: ["node", "bin/useful-jobs.mjs", ...childArgv] }],
        result: { argv: ["node", "bin/useful-jobs.mjs", ...childArgv] },
      });
    }
    let extracted;
    try {
      if (parsed.flags.extractDir) {
        const cli = join(parsed.flags.extractDir, USEFUL_JOBS_PIN.cli);
        const nested = join(parsed.flags.extractDir, USEFUL_JOBS_PIN.rootName, USEFUL_JOBS_PIN.cli);
        const resolved = existsSync(cli) ? cli : nested;
        extracted = {
          cli: resolved,
          cwd: existsSync(cli) ? parsed.flags.extractDir : join(parsed.flags.extractDir, USEFUL_JOBS_PIN.rootName),
        };
      } else {
        extracted = await ensureUsefulJobsExtract(root);
      }
    } catch (error) {
      return envelope({
        ok: false,
        command: "pack",
        feature: spec.feature,
        evidence,
        error: failError("HOST_BUILD", error.message, error.detail),
      });
    }
    const argv = [process.execPath, extracted.cli, ...childArgv];
    evidence.push({ kind: "argv", argv: ["node", extracted.cli, ...childArgv] });
    const ran = await runCommand(argv, { cwd: extracted.cwd, timeoutMs: 60_000 });
    const json = parseJsonOutput(ran.stdout) || parseJsonOutput(ran.stderr);
    evidence.push({
      kind: "spawn",
      code: ran.code,
      stdout: clip(ran.stdout, 1500),
      stderr: clip(ran.stderr, 800),
    });

    const missingInputs =
      json?.code === "missing-required-inputs" ||
      /missing-required-inputs/.test(`${ran.stdout}\n${ran.stderr}`);

    if (parsed.flags.expectProductReject) {
      if (ran.code === 0) {
        return envelope({
          ok: false,
          command: "pack",
          feature: spec.feature,
          evidence,
          error: failError("SEED_REJECT", "expected useful-jobs to refuse; child exited 0"),
        });
      }
      return envelope({
        ok: true,
        command: "pack",
        feature: spec.feature,
        evidence,
        result: { observedReject: true, childExit: ran.code, product: json },
      });
    }

    if (seeded) {
      const observed =
        Boolean(missingInputs) &&
        ran.code !== 0 &&
        (json?.code === "missing-required-inputs" ||
          /missing-required-inputs/.test(`${ran.stdout}\n${ran.stderr}`));
      return envelope({
        ok: false,
        command: "pack",
        feature: spec.feature,
        evidence,
        error: failError(
          "SEED_REJECT",
          observed ? "missing-required-inputs" : "expected useful-jobs missing-required-inputs refuse",
          {
            childExit: ran.code,
            productCode: json?.code || null,
            observedRefuse: observed,
          },
        ),
        result: { childExit: ran.code, product: json, observedRefuse: observed },
      });
    }

    if (missingInputs && childArgv[0] === "run") {
      return envelope({
        ok: false,
        command: "pack",
        feature: spec.feature,
        evidence,
        error: failError("SEED_REJECT", "missing-required-inputs", {
          childExit: ran.code,
          productCode: json?.code || "missing-required-inputs",
        }),
        result: { childExit: ran.code, product: json },
      });
    }

    if (ran.code !== 0) {
      return envelope({
        ok: false,
        command: "pack",
        feature: spec.feature,
        evidence,
        error: failError("HOST_BUILD", `useful-jobs exited ${ran.code}`, {
          stdout: clip(ran.stdout, 400),
          stderr: clip(ran.stderr, 400),
        }),
      });
    }

    return envelope({
      ok: true,
      command: "pack",
      feature: spec.feature,
      evidence,
      result: { childExit: 0, json, cli: extracted.cli },
    });
  }

  const argv = [...spec.bin, ...childArgv];
  const evidence = [
    { kind: "pack", id },
    { kind: "argv", argv },
  ];
  if (dryRun) {
    return envelope({
      ok: true,
      command: "pack",
      dryRun: true,
      feature: spec.feature,
      evidence,
      result: { argv },
    });
  }

  const ran = await runCommand(argv, { cwd: root, timeoutMs: 60_000 });
  const json = parseJsonOutput(ran.stdout) || parseJsonOutput(ran.stderr);
  evidence.push({
    kind: "spawn",
    code: ran.code,
    stdout: clip(ran.stdout, 1500),
    stderr: clip(ran.stderr, 800),
  });

  if (parsed.flags.expectProductReject) {
    if (ran.code === 0 && json?.ok !== false) {
      return envelope({
        ok: false,
        command: "pack",
        feature: spec.feature,
        evidence,
        error: failError("SEED_REJECT", `expected ${id} to refuse`),
      });
    }
    return envelope({
      ok: true,
      command: "pack",
      feature: spec.feature,
      evidence,
      result: { observedReject: true, childExit: ran.code, product: json },
    });
  }

  if (seeded) {
    const dest = childArgv.includes("--out") ? childArgv[childArgv.indexOf("--out") + 1] : null;
    const destExists = dest ? existsSync(dest) : false;
    const observed = ran.code !== 0 && !destExists;
    return envelope({
      ok: false,
      command: "pack",
      feature: spec.feature,
      evidence,
      error: failError(
        "SEED_REJECT",
        observed ? `${id} seeded input rejected` : `expected ${id} seeded refuse`,
        {
          childExit: ran.code,
          product: json,
          destExists,
          observedRefuse: observed,
        },
      ),
      result: { childExit: ran.code, product: json, destExists, observedRefuse: observed },
    });
  }

  if (ran.code !== 0) {
    return envelope({
      ok: false,
      command: "pack",
      feature: spec.feature,
      evidence,
      error: failError("HOST_BUILD", `${id} exited ${ran.code}`, {
        stdout: clip(ran.stdout, 400),
        stderr: clip(ran.stderr, 400),
      }),
    });
  }

  return envelope({
    ok: true,
    command: "pack",
    feature: spec.feature,
    evidence,
    result: { childExit: 0, json },
  });
}
