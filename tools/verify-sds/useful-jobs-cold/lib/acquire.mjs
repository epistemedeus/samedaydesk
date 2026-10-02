/**
 * Cold acquire/verify useful-jobs pin via in-repo obtain-archive.
 * Patterns cited from PR148 tools/verify/lib/archive.mjs (remapRefuse).
 * Never writes catalog/public; dest always outside repo by default.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  USEFUL_JOBS_PIN,
  WRONG_SHA,
  WRONG_BYTES,
  SEEDED,
  SOURCES,
  W0B2_CITE,
  FEATURE,
} from "./pin.mjs";
import { envelope, failError } from "./envelope.mjs";
import { refuseLive, refusePayment } from "./refuse.mjs";
import {
  resolveRoot,
  kitPath,
  obtainArchiveBin,
  isInsideRepo,
  assertObtainPresent,
} from "./repo.mjs";

function clip(s, n = 1200) {
  if (s == null) return "";
  const t = String(s);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

export function parseJsonOutput(stdout) {
  const raw = String(stdout || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    const lines = raw.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* continue */
      }
    }
    return null;
  }
}

function filePin(path) {
  if (!existsSync(path)) return { exists: false, isFile: false, sha256: null, bytes: null };
  const st = statSync(path);
  if (!st.isFile()) return { exists: true, isFile: false, sha256: null, bytes: st.size };
  const buf = readFileSync(path);
  return {
    exists: true,
    isFile: true,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

function spawnEnv() {
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: process.env.HOME || "",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    LANG: process.env.LANG || "C",
    NO_COLOR: "1",
  };
}

export function obtainArgv({ root, from, sha, bytes, dest, extractDir }) {
  const argv = [
    process.execPath,
    obtainArchiveBin(root),
    "--from",
    from,
    "--expected-sha256",
    sha,
    "--expected-bytes",
    String(bytes),
    "--dest",
    dest,
  ];
  if (extractDir) argv.push("--extract-dir", extractDir);
  return argv;
}

/**
 * obtain-archive exits 0 even when ok:false (product refuse).
 * Remap to verifier failure when refused.
 */
export function remapRefuse(child, { expectedCode = null, seeded = false } = {}) {
  const json = parseJsonOutput(child.stdout);
  const productCode = json?.code || null;
  const refused = Boolean(json && json.ok === false);
  const childExit = child.status == null ? child.code : child.status;
  if (refused) {
    const remapped = childExit === 0;
    return {
      refused: true,
      remapped,
      childExit,
      productCode,
      json,
      seeded,
      matches: expectedCode ? productCode === expectedCode : true,
    };
  }
  return {
    refused: false,
    remapped: false,
    childExit,
    productCode,
    json,
    seeded,
    matches: false,
  };
}

function outsideDest(pin) {
  const dir = mkdtempSync(join(tmpdir(), `sds-uj-cold-${pin.version}-`));
  return join(dir, pin.archive);
}

function runObtain(argv, { cwd, timeoutMs = 60_000 } = {}) {
  const ran = spawnSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    cwd,
    env: spawnEnv(),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    code: ran.status == null ? (ran.signal ? 128 : 64) : ran.status,
    timedOut: Boolean(ran.error && ran.error.code === "ETIMEDOUT"),
    stdout: ran.stdout || "",
    stderr: ran.stderr || "",
    error: ran.error ? String(ran.error.message || ran.error) : null,
    status: ran.status == null ? (ran.signal ? 128 : 64) : ran.status,
  };
}

function resolveSeed(seededId) {
  if (!seededId) return null;
  const meta = SEEDED[seededId];
  if (!meta) return { unknown: true, id: seededId };
  const id = meta.aliasOf || meta.id;
  return { ...SEEDED[id], id };
}

/** kit | for-agents only. Unknown values must not silent-default to kit. */
export function resolveSource(raw) {
  if (raw == null || raw === "") return { source: "kit" };
  const s = String(raw).trim().toLowerCase();
  if (s === "kit") return { source: "kit" };
  if (s === "for-agents" || s === "public") return { source: "for-agents" };
  return { invalid: true, raw: String(raw), known: SOURCES };
}

/**
 * Cold acquire of pin to dest outside repo.
 * @param {{ root?: string, source?: "kit"|"for-agents", dest?: string, extract?: boolean, dryRun?: boolean, seededId?: string|null }} opts
 */
export function coldAcquire(opts = {}) {
  const root = resolveRoot(opts.root);
  const pin = USEFUL_JOBS_PIN;
  const sourced = resolveSource(opts.source);
  const seeded = resolveSeed(opts.seededId);
  const source = sourced.invalid ? null : sourced.source;
  const evidence = [
    {
      kind: "w0b2-cite",
      ...W0B2_CITE,
    },
    {
      kind: "pin",
      version: pin.version,
      sha256: pin.sha256,
      bytes: pin.bytes,
      source: source || String(opts.source || ""),
    },
  ];

  if (sourced.invalid) {
    return envelope({
      ok: false,
      command: "acquire",
      status: "usage",
      feature: FEATURE,
      evidence,
      error: failError(
        "USAGE",
        `unknown --source ${JSON.stringify(sourced.raw)} (want kit|for-agents)`,
        { known: sourced.known },
      ),
    });
  }

  if (seeded?.unknown) {
    return envelope({
      ok: false,
      command: "acquire",
      status: "usage",
      feature: FEATURE,
      evidence,
      error: failError("USAGE", `unknown seeded failure: ${seeded.id}`, {
        known: Object.keys(SEEDED),
      }),
    });
  }

  if (seeded?.id === "live") {
    return refuseLive({ flag: "--seeded-failure live" });
  }
  if (seeded?.id === "payment") {
    return refusePayment({ flag: "--seeded-failure payment" });
  }

  let from;
  try {
    assertObtainPresent(root);
    from = kitPath(root, { source, version: pin.version });
  } catch (err) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("HOST_BUILD", err.message || String(err)),
    });
  }

  if (!existsSync(from)) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("HOST_BUILD", `archive source missing: ${from}`),
    });
  }

  const userDest = Boolean(opts.dest);
  const dest = userDest ? resolve(opts.dest) : outsideDest(pin);
  if (isInsideRepo(dest, root)) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("DEST_INSIDE_REPO", "dest must be outside the repo checkout", { dest, root }),
    });
  }

  let expectedSha = pin.sha256;
  let expectedBytes = pin.bytes;
  let expectedCode = null;
  if (seeded) {
    if (seeded.id === "wrong-sha") {
      expectedSha = opts.expectedSha256 || WRONG_SHA;
      expectedCode = "wrong-digest";
    } else if (seeded.id === "wrong-bytes") {
      expectedBytes = Number(opts.expectedBytes || WRONG_BYTES);
      expectedCode = "wrong-size";
    }
  }

  // Seeded: never extract. User --dest: no dirname extract. Auto dest: extract in mkdtemp.
  const extractDir =
    seeded || opts.extract === false
      ? null
      : opts.extractDir
        ? resolve(opts.extractDir)
        : userDest
          ? null
          : dirname(dest);

  if (extractDir && isInsideRepo(extractDir, root)) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("DEST_INSIDE_REPO", "extractDir must be outside the repo checkout", {
        dest,
        extractDir,
        root,
      }),
    });
  }

  const argv = obtainArgv({
    root,
    from,
    sha: expectedSha,
    bytes: expectedBytes,
    dest,
    extractDir,
  });

  evidence.push({
    kind: "argv",
    argv: argv.map((item, i) => (i === 0 || item === process.execPath ? "node" : item)),
  });
  evidence.push({
    kind: "outside-repo",
    dest,
    extractDir,
    insideRepo: isInsideRepo(dest, root),
  });

  if (opts.dryRun) {
    return envelope({
      ok: true,
      command: seeded ? "seeded" : "acquire",
      dryRun: true,
      feature: FEATURE,
      evidence,
      result: {
        version: pin.version,
        sha256: pin.sha256,
        bytes: pin.bytes,
        expectedSha,
        expectedBytes,
        dest,
        seeded: seeded?.id || null,
        argv,
      },
    });
  }

  const ran = runObtain(argv, { cwd: root });
  const json = parseJsonOutput(ran.stdout);
  evidence.push({
    kind: "spawn",
    code: ran.code,
    timedOut: ran.timedOut,
    stdout: clip(ran.stdout, 1200),
    stderr: clip(ran.stderr, 400),
    product: json,
  });

  if (seeded) {
    const mapped = remapRefuse(ran, { expectedCode, seeded: true });
    const destOnDisk = existsSync(dest);
    const okFail =
      mapped.refused &&
      mapped.matches &&
      mapped.remapped &&
      mapped.json?.extracted !== true &&
      mapped.json?.destExists !== true &&
      destOnDisk !== true;

    if (!okFail) {
      return envelope({
        ok: false,
        command: "seeded",
        feature: FEATURE,
        evidence,
        error: failError(
          "SEED_EXPECT",
          `seeded ${seeded.id} did not refuse with ${expectedCode}`,
          { mapped, childExit: ran.code, product: json },
        ),
        result: { seed: seeded.id, mapped, product: json },
      });
    }

    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      evidence,
      error: failError(
        mapped.remapped ? "SEED_REJECT" : "PRODUCT_REFUSE",
        mapped.remapped
          ? `obtain-archive refused ${mapped.productCode} with child exit 0; remapped to nonzero`
          : `obtain-archive refused ${mapped.productCode}`,
        {
          childExit: mapped.childExit,
          productCode: mapped.productCode,
          remappedFromChildExit0: mapped.remapped,
          seed: seeded.id,
        },
      ),
      result: {
        seed: seeded.id,
        version: pin.version,
        expectedSha,
        expectedBytes,
        pinSha256: pin.sha256,
        pinBytes: pin.bytes,
        productCode: mapped.productCode,
        childExit: mapped.childExit,
        remappedFromChildExit0: mapped.remapped,
        destExists: mapped.json?.destExists === true,
        destOnDisk,
        extracted: false,
        refused: true,
        paymentSent: false,
      },
    });
  }

  if (ran.code !== 0 || !json || json.ok !== true) {
    const mapped = remapRefuse(ran);
    if (mapped.refused) {
      return envelope({
        ok: false,
        command: "acquire",
        feature: FEATURE,
        evidence,
        error: failError(
          mapped.remapped ? "PRODUCT_REFUSE" : "HOST_BUILD",
          mapped.remapped
            ? `obtain-archive refused ${mapped.productCode} with child exit 0; remapped to nonzero`
            : `obtain-archive failed (${mapped.productCode || ran.code})`,
          { childExit: ran.code, product: json },
        ),
      });
    }
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("HOST_BUILD", `obtain-archive failed exit ${ran.code}`, {
        stdout: clip(ran.stdout, 400),
        stderr: clip(ran.stderr, 400),
      }),
    });
  }

  const written = json.dest || dest;
  if (isInsideRepo(written, root) || (extractDir && isInsideRepo(extractDir, root))) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("DEST_INSIDE_REPO", "product wrote dest inside repo", {
        dest: written,
        extractDir,
      }),
    });
  }

  const disk = filePin(written);
  const gotSha = disk.sha256 || String(json.sha256 || "").toLowerCase();
  const gotBytes = disk.bytes ?? Number(json.bytes);
  if (
    !disk.exists ||
    disk.isFile !== true ||
    disk.sha256 !== pin.sha256 ||
    disk.bytes !== pin.bytes
  ) {
    return envelope({
      ok: false,
      command: "acquire",
      feature: FEATURE,
      evidence,
      error: failError("PIN_MISMATCH", "acquired archive does not match 1.4.7 pin", {
        gotSha,
        gotBytes,
        disk,
        pin,
      }),
    });
  }

  return envelope({
    ok: true,
    command: "acquire",
    feature: FEATURE,
    evidence,
    result: {
      version: pin.version,
      sha256: disk.sha256,
      bytes: disk.bytes,
      dest: written,
      extractDir: json.extractDir || extractDir,
      outsideRepo: true,
      source,
      from,
      obtainedVia: "obtain-archive.mjs",
      verifiedOnDisk: true,
      paymentSent: false,
      catalogWritten: false,
      publicWritten: false,
    },
  });
}

export function runHarness(opts = {}) {
  const root = resolveRoot(opts.root);
  const steps = [];

  const cold = coldAcquire({ root, source: opts.source || "kit" });
  steps.push({
    step: "cold-acquire",
    ok: cold.ok === true,
    exit: cold.ok ? 0 : 1,
    version: cold.result?.version,
    sha256: cold.result?.sha256,
    bytes: cold.result?.bytes,
    code: cold.error?.code || null,
  });

  const wrongSha = coldAcquire({ root, seededId: "wrong-sha" });
  steps.push({
    step: "seeded:wrong-sha",
    ok: wrongSha.ok === false,
    exit: wrongSha.ok ? 0 : 1,
    code: wrongSha.error?.code || null,
    productCode: wrongSha.result?.productCode || null,
    remappedFromChildExit0: wrongSha.result?.remappedFromChildExit0 === true,
  });

  const wrongBytes = coldAcquire({ root, seededId: "wrong-bytes" });
  steps.push({
    step: "seeded:wrong-bytes",
    ok: wrongBytes.ok === false,
    exit: wrongBytes.ok ? 0 : 1,
    code: wrongBytes.error?.code || null,
    productCode: wrongBytes.result?.productCode || null,
    remappedFromChildExit0: wrongBytes.result?.remappedFromChildExit0 === true,
  });

  const coldOk = cold.ok === true;
  const seedsOk =
    wrongSha.ok === false &&
    wrongSha.error?.code === "SEED_REJECT" &&
    wrongSha.result?.productCode === "wrong-digest" &&
    wrongSha.result?.remappedFromChildExit0 === true &&
    wrongBytes.ok === false &&
    wrongBytes.error?.code === "SEED_REJECT" &&
    wrongBytes.result?.productCode === "wrong-size" &&
    wrongBytes.result?.remappedFromChildExit0 === true;

  const allOk = coldOk && seedsOk;
  return envelope({
    ok: allOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error: allOk
      ? null
      : failError("HARNESS_FAIL", "cold acquire or seeded refuses did not meet acceptance", {
          coldOk,
          seedsOk,
        }),
    result: {
      coldOk,
      seedsOk,
      pin: {
        version: USEFUL_JOBS_PIN.version,
        sha256: USEFUL_JOBS_PIN.sha256,
        bytes: USEFUL_JOBS_PIN.bytes,
      },
      cold: cold.result || null,
      steps,
      boundary: {
        paymentSent: false,
        catalogWritten: false,
        publicWritten: false,
        stripeOrX402: false,
      },
    },
  });
}

export { clip };
