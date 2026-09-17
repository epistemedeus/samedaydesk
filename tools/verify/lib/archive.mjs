import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { USEFUL_JOBS_NEGATIVE, USEFUL_JOBS_PIN } from "./catalog.mjs";
import { kitPath, obtainArchiveBin } from "./repo.mjs";
import { clip, parseJsonOutput, runCommand } from "./spawn.mjs";

function findExtractedKit(extractDir, pin) {
  if (!extractDir) return null;
  const candidates = [
    extractDir,
    join(extractDir, pin.rootName),
    join(extractDir, pin.rootName, pin.rootName),
  ];
  for (const dir of candidates) {
    const cli = join(dir, pin.cli);
    const catalog = join(dir, "catalog.json");
    if (existsSync(cli)) {
      let version = null;
      if (existsSync(catalog)) {
        try {
          version = JSON.parse(readFileSync(catalog, "utf8")).version || null;
        } catch {
          version = null;
        }
      }
      return { cwd: dir, cli, catalog: existsSync(catalog) ? catalog : null, version };
    }
  }
  return null;
}

function pinFor(version) {
  if (version === USEFUL_JOBS_NEGATIVE.version) return USEFUL_JOBS_NEGATIVE;
  return USEFUL_JOBS_PIN;
}

function outsideDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function isInsideRepo(dest, root) {
  const rel = relative(resolve(root), resolve(dest));
  return rel === "" || !rel.startsWith("..");
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

function remapRefuse(child, { expectedCode = null, seeded = false } = {}) {
  const json = parseJsonOutput(child.stdout);
  const productCode = json?.code || null;
  const refused = json && json.ok === false;
  const childExit = child.code;
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
  return { refused: false, remapped: false, childExit, productCode, json, seeded, matches: false };
}

export async function runArchive(parsed, { root, dryRun = false } = {}) {
  const action = parsed.tokens[0] || "acquire";
  const seeded = Boolean(parsed.seededFailure);
  const version =
    parsed.flags.version ||
    (action === "negative-control" ? USEFUL_JOBS_NEGATIVE.version : USEFUL_JOBS_PIN.version);
  const pin = pinFor(version);
  const from = parsed.flags.from
    ? resolve(root, parsed.flags.from)
    : kitPath(root, { version: pin.version });
  const sha = seeded && action !== "negative-control"
    ? parsed.flags.expectedSha256 || "0".repeat(64)
    : parsed.flags.expectedSha256 || pin.sha256;
  const bytes = Number(parsed.flags.expectedBytes || pin.bytes);

  if (action !== "acquire" && action !== "negative-control") {
    return envelope({
      ok: false,
      command: "archive",
      status: "usage",
      error: failError("USAGE", "archive acquire | archive negative-control"),
    });
  }

  const destBase = parsed.flags.dest
    ? resolve(parsed.flags.dest)
    : join(outsideDir(`sds-uj-${pin.version}-`), `${pin.rootName}.tar.gz`);
  const extractDir = parsed.flags.extractDir
    ? resolve(parsed.flags.extractDir)
    : action === "negative-control" || parsed.flags.outside !== false
      ? dirname(destBase)
      : null;

  // Seeded SHA mismatch must not extract.
  const extract = seeded && action !== "negative-control" ? null : extractDir;
  const dest = destBase;
  const argv = obtainArgv({ root, from, sha, bytes, dest, extractDir: extract });
  const evidence = [
    { kind: "pin", version: pin.version, sha256: pin.sha256, bytes: pin.bytes },
    { kind: "argv", argv: argv.map((item, i) => (i === 0 ? "node" : item === process.execPath ? "node" : item)) },
    { kind: "outside-repo", dest, extractDir: extract, insideRepo: isInsideRepo(dest, root) },
  ];

  if (dryRun) {
    return envelope({
      ok: true,
      command: "archive",
      dryRun: true,
      feature: action === "negative-control" ? "archive-acquisition" : "archive-acquisition",
      evidence,
      result: { argv, version: pin.version, seeded },
    });
  }

  if (!existsSync(from)) {
    return envelope({
      ok: false,
      command: "archive",
      evidence,
      error: failError("HOST_BUILD", `archive source missing: ${from}`),
    });
  }

  const ran = await runCommand(argv, { cwd: root, timeoutMs: 60_000 });
  const json = parseJsonOutput(ran.stdout);
  evidence.push({
    kind: "spawn",
    code: ran.code,
    timedOut: ran.timedOut,
    stdout: clip(ran.stdout, 1200),
    stderr: clip(ran.stderr, 400),
    product: json,
  });

  if (seeded || sha !== pin.sha256) {
    const mapped = remapRefuse(ran, { expectedCode: "wrong-digest", seeded: true });
    const okFail =
      mapped.refused &&
      mapped.remapped &&
      mapped.productCode === "wrong-digest" &&
      mapped.json?.destExists !== true;
    return envelope({
      ok: false,
      command: "archive",
      feature: "archive-acquisition",
      evidence: [
        ...evidence,
        {
          kind: "remap",
          childExit: mapped.childExit,
          productCode: mapped.productCode,
          remappedFromChildExit0: mapped.remapped,
        },
      ],
      error: failError(
        "SEED_REJECT",
        okFail
          ? "SHA mismatch remapped from child exit 0"
          : "expected obtain-archive wrong-digest refuse with child exit 0",
        {
          childExit: mapped.childExit,
          productCode: mapped.productCode,
          destExists: mapped.json?.destExists,
        },
      ),
      result: {
        remappedFromChildExit0: mapped.remapped,
        childExit: mapped.childExit,
        productCode: mapped.productCode,
      },
    });
  }

  if (!json?.ok) {
    const mapped = remapRefuse(ran);
    return envelope({
      ok: false,
      command: "archive",
      feature: "archive-acquisition",
      evidence,
      error: failError(
        mapped.remapped ? "SEED_REJECT" : "HOST_BUILD",
        mapped.remapped
          ? `obtain-archive refused ${mapped.productCode} with child exit 0; remapped to nonzero`
          : `obtain-archive failed (${mapped.productCode || ran.code})`,
        { childExit: ran.code, product: json },
      ),
    });
  }

  const kit = findExtractedKit(extract, pin);

  if (action === "negative-control") {
    if (pin.version !== USEFUL_JOBS_NEGATIVE.version) {
      return envelope({
        ok: false,
        command: "archive",
        evidence,
        error: failError("HOST_BUILD", "negative-control must use 1.1.0"),
      });
    }
    if (!kit?.cli) {
      return envelope({
        ok: false,
        command: "archive",
        evidence,
        error: failError("HOST_BUILD", "1.1.0 extract missing bin/useful-jobs.mjs"),
      });
    }
    const listArgv = [process.execPath, kit.cli, "list", "--json"];
    const listed = await runCommand(listArgv, { cwd: kit.cwd, timeoutMs: 30_000 });
    evidence.push({
      kind: "negative-list",
      argv: listArgv,
      code: listed.code,
      stdout: clip(listed.stdout, 800),
      catalogVersion: kit.version,
    });
    const listedJson = parseJsonOutput(listed.stdout);
    const notCurrent = kit.version === USEFUL_JOBS_NEGATIVE.version && kit.version !== USEFUL_JOBS_PIN.version;
    if (listed.code !== 0 || !notCurrent) {
      return envelope({
        ok: false,
        command: "archive",
        feature: "archive-acquisition",
        evidence,
        error: failError("HOST_BUILD", "1.1.0 negative control did not extract as catalog 1.1.0", {
          catalogVersion: kit.version,
          listExit: listed.code,
        }),
      });
    }
    return envelope({
      ok: true,
      command: "archive",
      feature: "archive-acquisition",
      evidence,
      result: {
        version: USEFUL_JOBS_NEGATIVE.version,
        sha256: pin.sha256,
        bytes: pin.bytes,
        dest,
        extractDir: extract,
        outsideRepo: !isInsideRepo(dest, root),
        negativeControl: true,
        catalogVersion: kit.version,
        currentVersion: USEFUL_JOBS_PIN.version,
        list: listedJson,
      },
    });
  }

  const listCli = kit?.cli;
  let list = null;
  if (listCli) {
    const listArgv = [process.execPath, listCli, "list", "--json"];
    const listed = await runCommand(listArgv, { cwd: kit.cwd, timeoutMs: 30_000 });
    list = parseJsonOutput(listed.stdout);
    evidence.push({
      kind: "useful-jobs-list",
      argv: ["node", kit.cli, "list", "--json"],
      code: listed.code,
      stdout: clip(listed.stdout, 800),
      catalogVersion: kit.version,
      jobCount: Array.isArray(list?.jobs) ? list.jobs.length : null,
    });
    if (listed.code !== 0) {
      return envelope({
        ok: false,
        command: "archive",
        feature: "archive-acquisition",
        evidence,
        error: failError("HOST_BUILD", "bin/useful-jobs.mjs list failed after acquire"),
      });
    }
  }

  return envelope({
    ok: true,
    command: "archive",
    feature: "archive-acquisition",
    evidence,
    result: {
      version: pin.version,
      sha256: json.sha256 || pin.sha256,
      bytes: json.bytes || pin.bytes,
      dest: json.dest || dest,
      extractDir: json.extractDir || extract,
      outsideRepo: !isInsideRepo(dest, root),
      cli: listCli,
      catalogVersion: kit?.version || pin.version,
      list,
    },
  });
}

export { remapRefuse, pinFor };
