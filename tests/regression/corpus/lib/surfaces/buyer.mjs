import { join } from "node:path";
import { resolveForAgentsColdRead } from "../../../../../tools/presence/for-agents-cold-read.mjs";
import { CORPUS_ROOT, REPO_ROOT } from "../root.mjs";
import { accept, reject } from "../result.mjs";
import { refuseFromJson, runNode } from "../spawn.mjs";
import { USEFUL_JOBS_NEGATIVE_110, USEFUL_JOBS_PIN } from "../kit.mjs";

export async function evaluateBuyer(id) {
  if (id === "buyer.archive-wrong-digest") {
    const spawned = runNode(
      "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs",
      [
        "--from",
        join(CORPUS_ROOT, "fixtures/buyer/wrong-digest.bin"),
        "--expected-sha256",
        "0000000000000000000000000000000000000000000000000000000000000000",
        "--expected-bytes",
        "16",
        "--dest",
        "{{dest}}",
      ],
      { destName: "must-not-write.tgz", timeoutMs: 15_000 },
    );
    const observed = refuseFromJson(spawned, "wrong-digest");
    if (observed.verdict === "accept") return observed;
    if (spawned.json?.code !== "wrong-digest" || spawned.destExists !== false) {
      return accept("digest_mismatch_acquired", "SHA mismatch still looked like a successful acquire.", {
        product: spawned.json,
        destExists: spawned.destExists,
        exitCode: spawned.exitCode,
      });
    }
    return reject("wrong-digest", "obtain-archive SHA mismatch refuses extract even when the wrapper exits 0.", {
      product: { ...spawned.json, exitCode: spawned.exitCode, destExists: spawned.destExists },
    });
  }

  if (id === "buyer.archive-missing-args") {
    const spawned = runNode("experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs", [], {
      timeoutMs: 10_000,
    });
    const observed = refuseFromJson(spawned, "missing-args");
    if (observed.verdict === "accept" || spawned.json?.code !== "missing-args") {
      return accept("missing_args_acquired", "Missing obtain-archive args looked like acquire success.", {
        product: spawned.json,
        exitCode: spawned.exitCode,
      });
    }
    return reject("missing-args", "obtain-archive without --from/--dest is a refuse, not a completed acquire.", {
      product: { ...spawned.json, exitCode: spawned.exitCode },
    });
  }

  if (id === "buyer.result-reuse-missing-out") {
    const spawned = runNode(
      "tools/result-reuse/cli.mjs",
      [
        "export",
        "--input",
        join(REPO_ROOT, "tools/result-reuse/fixtures/accepted-page-change.json"),
        "--task-id",
        "corpus-reuse",
        "--subject",
        "corpus-reuse-result",
        "--sequence",
        "1",
        "--clock",
        "2026-09-09T10:00:00.000Z",
        "--opt-in",
      ],
      { timeoutMs: 10_000 },
    );
    const message = spawned.json?.message || "";
    if (spawned.exitCode === 0 || message !== "export requires --out") {
      return accept("export_without_out", "result-reuse export without --out was treated as written.", {
        product: spawned.json,
        exitCode: spawned.exitCode,
      });
    }
    return reject("export_requires_out", "Writing reuse evidence requires an explicit --out path.", {
      product: spawned.json,
      exitCode: spawned.exitCode,
    });
  }

  if (id === "buyer.presence-offline-unpaid") {
    const result = await resolveForAgentsColdRead({
      preferFixture: true,
      fetchImpl: () => {
        throw new Error("network forbidden");
      },
    });
    const unpaid = result.outcome === "offline_fixture" && result.paid === false && result.liveObserved === false;
    if (!unpaid) {
      return accept("fixture_as_live_paid", "Dated for-agents fixtures were treated as live paid observation.", {
        product: result,
      });
    }
    return accept("offline_fixture", "preferFixture stays unpaid offline_fixture with zero network.", {
      product: { outcome: result.outcome, paid: result.paid, liveObserved: result.liveObserved },
    });
  }

  if (id === "buyer.negative-control-1.1.0") {
    const spawned = runNode(
      "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs",
      [
        "--from",
        join(REPO_ROOT, USEFUL_JOBS_NEGATIVE_110.archive),
        "--expected-sha256",
        USEFUL_JOBS_PIN.sha256,
        "--expected-bytes",
        String(USEFUL_JOBS_NEGATIVE_110.bytes),
        "--dest",
        "{{dest}}",
      ],
      { destName: "must-not-write-110.tgz", timeoutMs: 20_000 },
    );
    if (spawned.json?.code !== "wrong-digest" || spawned.destExists !== false) {
      return accept("stale_archive_acquired", "useful-jobs 1.1.0 satisfied the live 1.4.7 digest.", {
        product: spawned.json,
        destExists: spawned.destExists,
        exitCode: spawned.exitCode,
      });
    }
    return reject("wrong-digest", "Immutable 1.1.0 must not satisfy the current 1.4.7 digest.", {
      product: { ...spawned.json, exitCode: spawned.exitCode, destExists: spawned.destExists },
    });
  }

  throw new Error(`unknown buyer evaluator ${id}`);
}
