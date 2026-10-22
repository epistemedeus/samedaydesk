import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { rejectForbidden } from "../../../../../experiments/s185-distribution-repair-package/src/validate.mjs";
import { CORPUS_ROOT, REPO_ROOT } from "../root.mjs";
import { accept, reject } from "../result.mjs";
import { ensureUsefulJobsKit } from "../kit.mjs";
import { childEnv, parseJsonLoose, refuseFromJson, runNode } from "../spawn.mjs";

function runKit(args, { timeoutMs = 20_000 } = {}) {
  const kit = ensureUsefulJobsKit();
  const tmp = mkdtempSync(join(tmpdir(), "sds-corpus-kit-"));
  const argv = args.map((item) =>
    String(item)
      .replaceAll("{{kit}}", kit)
      .replaceAll("{{tmp}}", tmp)
      .replaceAll("{{corpus}}", CORPUS_ROOT),
  );
  try {
    const result = spawnSync(process.execPath, argv, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      env: childEnv(),
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    return {
      exitCode: timedOut ? 124 : result.status == null ? 64 : result.status,
      json: parseJsonLoose(result.stdout) || parseJsonLoose(result.stderr),
      stdout: result.stdout,
      stderr: result.stderr,
      destExists: null,
      timedOut,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function evaluatePack(id) {
  if (id === "pack.useful-jobs-missing-inputs") {
    const spawned = runKit(["{{kit}}/bin/useful-jobs.mjs", "run", "lockfile-pin-delta"]);
    const observed = refuseFromJson(spawned, "missing-required-inputs");
    if (observed.verdict === "accept" || spawned.json?.code !== "missing-required-inputs") {
      return accept("missing_inputs_ran", "useful-jobs lockfile-pin-delta ran without --before/--after.", {
        product: spawned.json,
        exitCode: spawned.exitCode,
      });
    }
    return reject("missing-required-inputs", "Mapped refuse for missing lockfile inputs is not a broken CLI.", {
      product: { ...spawned.json, exitCode: spawned.exitCode },
    });
  }

  if (id === "pack.useful-jobs-html-lockfile") {
    const spawned = runKit([
      "{{kit}}/bin/useful-jobs.mjs",
      "run",
      "lockfile-pin-delta",
      "--before",
      "{{corpus}}/fixtures/pack/not-a-lock.html",
      "--after",
      "{{corpus}}/fixtures/pack/not-a-lock.html",
      "--out-dir",
      "{{tmp}}/out-html",
    ]);
    if (spawned.json?.ok === true || spawned.json?.code !== "html-input") {
      return accept("html_lockfile_parsed", "HTML masquerading as package-lock.json was parsed as a lockfile.", {
        product: spawned.json,
        exitCode: spawned.exitCode,
      });
    }
    return reject("html-input", "lockfile-pin-delta refuses HTML challenge/error pages as lockfiles.", {
      product: { ...spawned.json, exitCode: spawned.exitCode },
    });
  }

  if (id === "pack.s185-missing-input") {
    const spawned = runNode(
      "experiments/s185-distribution-repair-package/bin/distribution-repair.mjs",
      ["diagnose", "{{tmp}}/does-not-exist-s185.json"],
      { timeoutMs: 15_000 },
    );
    const code = spawned.json?.error?.code || spawned.json?.code;
    if (spawned.json?.ok === true || code !== "missing-input") {
      return accept("missing_input_diagnosed", "s185 diagnose on a missing file looked complete.", {
        product: spawned.json,
        exitCode: spawned.exitCode,
      });
    }
    return reject("missing-input", "distribution-repair diagnose on a missing file is a refuse, even at exit 0.", {
      product: { ...spawned.json, exitCode: spawned.exitCode },
    });
  }

  if (id === "pack.s185-forbidden-claim") {
    try {
      rejectForbidden({ revenue: 1 });
      return accept("revenue_admitted", "Pack diagnosis admitted an invented revenue field.");
    } catch (err) {
      return reject(err.code || "forbidden_claim", err.message, {
        product: { field: err.details?.field || "revenue" },
      });
    }
  }

  if (id === "pack.missing-input-file") {
    const path = join(CORPUS_ROOT, "fixtures/pack/does-not-exist.json");
    if (existsSync(path)) {
      return accept("missing_input_present", "Seeded missing pack input unexpectedly exists.", { product: { path } });
    }
    return reject("input_not_found", "Pack --input path must fail closed when the file is absent.", {
      product: { path, exists: false },
    });
  }

  throw new Error(`unknown pack evaluator ${id}`);
}
