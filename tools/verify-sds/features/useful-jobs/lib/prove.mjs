import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { envelope, failError, FEATURE, nodeInfo } from "./envelope.mjs";
import { loadMap } from "./map.mjs";
import { findRepoRoot, loadJson, repoPaths, SLICE_DIR } from "./paths.mjs";
import { clip, jobIdsFromList, parseJsonText, runCommand, sha256File } from "./util.mjs";

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function requireNode22() {
  const node = nodeInfo();
  if (node.major !== 22) {
    return envelope({
      ok: false,
      command: "prove",
      error: failError("NODE", `Node ${node.actual} is not 22.x`, node),
      result: { node },
    });
  }
  return null;
}

function bindSurfaces(root, map) {
  const paths = repoPaths(root, map);
  const missing = Object.entries(paths)
    .filter(([k, p]) => k !== "root" && !existsSync(p))
    .map(([k, p]) => ({ key: k, path: p }));
  if (missing.length) {
    return {
      ok: false,
      error: failError("PIN_MISMATCH", "committed useful-jobs surfaces missing", { missing }),
      paths,
    };
  }

  const publicBuf = readFileSync(paths.publicArchive);
  const kitBuf = readFileSync(paths.kitArchive);
  const publicSha = sha256File(paths.publicArchive);
  const kitSha = sha256File(paths.kitArchive);
  const pinFile = loadJson(paths.sha256Json);
  const discovery = loadJson(paths.discovery);
  const catalog = loadJson(paths.catalog);
  const outcomes = loadJson(paths.outcomes);
  const kitJson = loadJson(paths.kitJson);
  const mapIds = map.jobs.map((j) => j.id);
  const mismatches = [];

  if (publicBuf.length !== map.pin.bytes) mismatches.push(`public bytes ${publicBuf.length} != ${map.pin.bytes}`);
  if (kitBuf.length !== map.pin.bytes) mismatches.push(`kit bytes ${kitBuf.length} != ${map.pin.bytes}`);
  if (publicSha !== map.pin.sha256) mismatches.push("public sha256 != map.pin");
  if (kitSha !== map.pin.sha256) mismatches.push("kit sha256 != map.pin");
  if (pinFile.sha256 !== map.pin.sha256 || pinFile.bytes !== map.pin.bytes) {
    mismatches.push("sha256.json pin != map.pin");
  }
  if (discovery.sha256 !== map.pin.sha256 || discovery.bytes !== map.pin.bytes) {
    mismatches.push("discovery pin != map.pin");
  }
  if (kitJson.sha256 !== map.pin.sha256 || kitJson.bytes !== map.pin.bytes) {
    mismatches.push("usefulJobsKit.json pin != map.pin");
  }
  if (discovery.purchaseAuthority !== false || kitJson.purchaseAuthority !== false) {
    mismatches.push("purchaseAuthority is not false");
  }
  const catalogIds = (catalog.jobs || []).map((j) => j.id);
  const outcomeIds = (outcomes.jobs || []).map((j) => j.id);
  const kitIds = kitJson.jobs || [];
  if (JSON.stringify(catalogIds) !== JSON.stringify(mapIds)) mismatches.push("catalog job ids != map");
  if (JSON.stringify(outcomeIds) !== JSON.stringify(mapIds)) mismatches.push("outcomes job ids != map");
  if (JSON.stringify(kitIds) !== JSON.stringify(mapIds)) mismatches.push("kit job ids != map");
  if (JSON.stringify(discovery.jobs || []) !== JSON.stringify(mapIds)) {
    mismatches.push("discovery job ids != map");
  }

  if (mismatches.length) {
    return {
      ok: false,
      error: failError("PIN_MISMATCH", mismatches.join("; "), { mismatches }),
      paths,
    };
  }

  return {
    ok: true,
    paths,
    publicBytes: publicBuf.length,
    publicSha,
    kitSha,
    mapIds,
    catalogIds,
  };
}

function lockfilePair({ name, beforeVersion, afterVersion }) {
  const pkg = (version) => ({
    name: "caller-lockfile",
    version: "0.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "caller-lockfile", version: "0.0.0" },
      [`node_modules/${name}`]: {
        version,
        resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
        integrity: `sha512-${Buffer.from(`${name}@${version}`).toString("base64")}`,
      },
    },
  });
  return { before: pkg(beforeVersion), after: pkg(afterVersion) };
}

async function obtain({ paths, map, dest, extractDir, expectedSha, expectedBytes }) {
  const argv = [
    process.execPath,
    paths.obtainBin,
    "--from",
    paths.publicArchive,
    "--expected-sha256",
    expectedSha,
    "--expected-bytes",
    String(expectedBytes),
    "--dest",
    dest,
  ];
  if (extractDir) argv.push("--extract-dir", extractDir);
  const ran = await runCommand(argv, { cwd: paths.root, timeoutMs: 60_000 });
  const json = parseJsonText(ran.stdout) || parseJsonText(ran.stderr);
  return { argv, ran, json };
}

function remapObtainFailure(json, ran) {
  const okFalse = json?.ok === false;
  const childZero = ran.code === 0;
  return Boolean(okFalse && childZero);
}

export async function prove(parsed) {
  const nodeFail = requireNode22();
  if (nodeFail) return nodeFail;

  const loaded = loadMap();
  if (loaded.errors.length) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      error: failError("MAP_INVALID", loaded.errors.join("; "), { errors: loaded.errors }),
    });
  }
  const { map } = loaded;
  const root = findRepoRoot(parsed.flags.root);
  if (!root) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      status: "usage",
      error: failError("USAGE", "could not find samedaydesk repo root with useful-jobs 1.4.7 archive"),
    });
  }

  if (parsed.unknown?.length || parsed.missingValues?.length) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      status: "usage",
      error: failError(
        "USAGE",
        parsed.missingValues.length
          ? `missing value for ${parsed.missingValues.join(", ")}`
          : `unknown args: ${parsed.unknown.join(", ")}`,
      ),
    });
  }

  const bound = bindSurfaces(root, map);
  const bindEvidence = [
    { kind: "map", path: "tools/verify-sds/features/useful-jobs/map.json", jobs: loaded.ids },
    { kind: "pin", version: map.pin.version, sha256: map.pin.sha256, bytes: map.pin.bytes },
    { kind: "repo", root },
  ];

  if (parsed.command === "map" && !parsed.seededFailure) {
    if (!bound.ok) {
      return envelope({
        ok: false,
        command: "map",
        evidence: bindEvidence,
        error: bound.error,
      });
    }
    return envelope({
      ok: true,
      command: "map",
      dryRun: parsed.dryRun,
      evidence: [
        ...bindEvidence,
        { kind: "surfaces", publicSha: bound.publicSha, kitSha: bound.kitSha, bytes: bound.publicBytes },
      ],
      result: {
        feature: FEATURE,
        jobs: loaded.ids,
        pin: map.pin,
        surfaces: map.surfaces,
      },
    });
  }

  if (parsed.seededFailure && parsed.seededId === "silent-empty-success") {
    return rejectSilentEmpty(map, bindEvidence);
  }

  if (!bound.ok) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      evidence: bindEvidence,
      error: bound.error,
    });
  }

  if (parsed.seededFailure && parsed.seededId === "sha-mismatch") {
    return seededShaMismatch(parsed, map, bound, bindEvidence);
  }

  if (parsed.seededFailure && parsed.seededId === "missing-required-inputs") {
    return seededMissingInputs(parsed, map, bound, bindEvidence);
  }

  if (parsed.flags.expectProductReject) {
    return seededMissingInputs(parsed, map, bound, bindEvidence);
  }

  return coldProve(parsed, map, bound, bindEvidence);
}

function rejectSilentEmpty(map, bindEvidence) {
  const fixture = loadJson(join(SLICE_DIR, "fixtures/seeded/silent-empty-success.json"));
  const ids = jobIdsFromList(fixture.list);
  const emptyOk = fixture.list?.ok === true && ids.length === 0;
  return envelope({
    ok: false,
    command: "seeded-failure",
    evidence: [
      ...bindEvidence,
      { kind: "seed", id: "silent-empty-success", fixture: "fixtures/seeded/silent-empty-success.json" },
      { kind: "list", ok: fixture.list?.ok, ids },
    ],
    error: failError(
      "SEED_REJECT",
      emptyOk ? "silent-empty-success" : "expected silent-empty-success fixture",
      { observedEmptyOk: emptyOk, ids, wanted: map.jobs.length },
    ),
    result: { observedRefuse: emptyOk, ids },
  });
}

async function seededShaMismatch(parsed, map, bound, bindEvidence) {
  const fixture = loadJson(join(SLICE_DIR, "fixtures/seeded/sha-mismatch.json"));
  const work = mkdtempSync(join(tmpdir(), "sds-uj-sha-"));
  const dest = join(work, "useful-jobs-1.4.7.tar.gz");
  const extractDir = join(work, "extract");
  const argvPreview = [
    "node",
    map.surfaces.obtainBin,
    "--from",
    bound.paths.publicArchive,
    "--expected-sha256",
    fixture.expectedSha256,
    "--expected-bytes",
    String(map.pin.bytes),
    "--dest",
    dest,
    "--extract-dir",
    extractDir,
  ];
  if (parsed.dryRun) {
    return envelope({
      ok: true,
      command: "seeded-failure",
      dryRun: true,
      evidence: [...bindEvidence, { kind: "argv", argv: argvPreview }],
      result: { would: argvPreview, seed: "sha-mismatch" },
    });
  }
  mkdirSync(extractDir, { recursive: true });
  const obtained = await obtain({
    paths: bound.paths,
    map,
    dest,
    extractDir,
    expectedSha: fixture.expectedSha256,
    expectedBytes: map.pin.bytes,
  });
  const remapped = remapObtainFailure(obtained.json, obtained.ran);
  const observed =
    obtained.json?.ok === false &&
    obtained.json?.code === "wrong-digest" &&
    obtained.json?.extracted === false &&
    !existsSync(join(extractDir, map.pin.rootName, map.pin.cli));
  rmSync(work, { recursive: true, force: true });
  return envelope({
    ok: false,
    command: "seeded-failure",
    evidence: [
      ...bindEvidence,
      { kind: "seed", id: "sha-mismatch" },
      { kind: "obtain-bin", argv: obtained.argv },
      {
        kind: "spawn",
        code: obtained.ran.code,
        remappedFromChildZero: remapped,
        stdout: clip(obtained.ran.stdout, 800),
      },
    ],
    error: failError(
      "SEED_REJECT",
      observed ? "wrong-digest" : "expected obtain-archive wrong-digest refuse",
      {
        childExit: obtained.ran.code,
        productCode: obtained.json?.code || null,
        remappedFromChildZero: remapped,
        observedRefuse: observed,
      },
    ),
    result: {
      childExit: obtained.ran.code,
      product: obtained.json,
      remappedFromChildZero: remapped,
      observedRefuse: observed,
    },
  });
}

async function withExtract(parsed, map, bound, fn) {
  const work = parsed.flags.extractDir
    ? null
    : mkdtempSync(join(tmpdir(), "sds-uj-pack-"));
  const extractDir = parsed.flags.extractDir ? resolve(parsed.flags.extractDir) : work;
  mkdirSync(extractDir, { recursive: true });
  const dest = join(extractDir, `${map.pin.rootName}.tar.gz`);
  if (isInside(bound.paths.root, extractDir)) {
    if (work) rmSync(work, { recursive: true, force: true });
    return {
      fail: envelope({
        ok: false,
        command: parsed.command || "prove",
        error: failError("EXTRACT_INSIDE_TREE", "extract dir must be outside the git tree", {
          extractDir,
          root: bound.paths.root,
        }),
      }),
    };
  }
  const obtained = await obtain({
    paths: bound.paths,
    map,
    dest,
    extractDir,
    expectedSha: map.pin.sha256,
    expectedBytes: map.pin.bytes,
  });
  const cleanup = () => {
    if (work && !parsed.flags.keep) rmSync(work, { recursive: true, force: true });
  };
  if (obtained.json?.ok !== true) {
    const remapped = remapObtainFailure(obtained.json, obtained.ran);
    cleanup();
    return {
      fail: envelope({
        ok: false,
        command: parsed.command || "prove",
        error: failError("HOST_BUILD", "obtain-archive did not extract 1.4.7", {
          childExit: obtained.ran.code,
          remappedFromChildZero: remapped,
          product: obtained.json,
        }),
        result: { product: obtained.json, remappedFromChildZero: remapped },
      }),
    };
  }
  const kit = join(extractDir, map.pin.rootName);
  const cli = join(kit, map.pin.cli);
  if (!existsSync(cli)) {
    cleanup();
    return {
      fail: envelope({
        ok: false,
        command: parsed.command || "prove",
        error: failError("HOST_BUILD", "useful-jobs extract missing bin/useful-jobs.mjs", { kit }),
      }),
    };
  }
  if (isInside(bound.paths.root, kit)) {
    cleanup();
    return {
      fail: envelope({
        ok: false,
        command: parsed.command || "prove",
        error: failError("EXTRACT_INSIDE_TREE", "extract landed inside the git tree", { kit, root: bound.paths.root }),
      }),
    };
  }
  try {
    const result = await fn({ kit, cli, extractDir, obtained, work });
    if (work && !parsed.flags.keep) rmSync(work, { recursive: true, force: true });
    return { env: result };
  } catch (error) {
    if (work && !parsed.flags.keep) rmSync(work, { recursive: true, force: true });
    throw error;
  }
}

async function seededMissingInputs(parsed, map, bound, bindEvidence) {
  const seed = map.seededFailures["missing-required-inputs"];
  const argv = ["node", map.pin.cli, ...seed.argv];
  if (parsed.dryRun) {
    return envelope({
      ok: true,
      command: parsed.flags.expectProductReject ? "prove" : "seeded-failure",
      dryRun: true,
      evidence: [...bindEvidence, { kind: "argv", argv }],
      result: { would: ["obtain-archive", ...argv], seed: "missing-required-inputs" },
    });
  }
  const wrapped = await withExtract(parsed, map, bound, async ({ kit, cli, obtained }) => {
    const ran = await runCommand([process.execPath, cli, ...seed.argv], { cwd: kit, timeoutMs: 30_000 });
    const json = parseJsonText(ran.stdout) || parseJsonText(ran.stderr);
    const observed =
      ran.code !== 0 &&
      (json?.code === seed.productCode || /missing-required-inputs/.test(`${ran.stdout}\n${ran.stderr}`));
    const evidence = [
      ...bindEvidence,
      { kind: "seed", id: "missing-required-inputs" },
      { kind: "obtain", dest: obtained.json?.dest, sha256: obtained.json?.sha256, bytes: obtained.json?.bytes },
      { kind: "argv", argv: ["node", cli, ...seed.argv] },
      { kind: "spawn", code: ran.code, stdout: clip(ran.stdout, 800) },
    ];
    if (parsed.flags.expectProductReject) {
      if (!observed) {
        return envelope({
          ok: false,
          command: "prove",
          evidence,
          error: failError("SEED_REJECT", "expected useful-jobs to refuse; child did not", {
            childExit: ran.code,
            product: json,
          }),
        });
      }
      return envelope({
        ok: true,
        command: "prove",
        evidence,
        result: { observedReject: true, childExit: ran.code, product: json },
      });
    }
    return envelope({
      ok: false,
      command: "seeded-failure",
      evidence,
      error: failError(
        "SEED_REJECT",
        observed ? "missing-required-inputs" : "expected useful-jobs missing-required-inputs refuse",
        { childExit: ran.code, productCode: json?.code || null, observedRefuse: observed },
      ),
      result: { childExit: ran.code, product: json, observedRefuse: observed },
    });
  });
  if (wrapped.fail) return wrapped.fail;
  return wrapped.env;
}

async function coldProve(parsed, map, bound, bindEvidence) {
  const listArgv = ["node", map.pin.cli, "list", "--json"];
  if (parsed.dryRun) {
    return envelope({
      ok: true,
      command: "prove",
      dryRun: true,
      evidence: [
        ...bindEvidence,
        { kind: "argv", argv: ["node", map.surfaces.obtainBin, "..."] },
        { kind: "argv", argv: listArgv },
      ],
      result: {
        would: [
          "obtain-archive 1.4.7 outside tree",
          "node bin/useful-jobs.mjs list --json",
          "node bin/useful-jobs.mjs run lockfile-pin-delta --before --after --out-dir",
          "node bin/useful-jobs.mjs run page-change-offline-job --example",
        ],
      },
    });
  }

  const wrapped = await withExtract(parsed, map, bound, async ({ kit, cli, obtained, extractDir }) => {
    const evidence = [
      ...bindEvidence,
      {
        kind: "obtain",
        dest: obtained.json?.dest,
        sha256: obtained.json?.sha256,
        bytes: obtained.json?.bytes,
        extractDir,
        outsideTree: !isInside(bound.paths.root, kit),
      },
    ];
    const listed = await runCommand([process.execPath, cli, "list", "--json"], {
      cwd: kit,
      timeoutMs: 30_000,
    });
    const listJson = parseJsonText(listed.stdout) || parseJsonText(listed.stderr);
    evidence.push({
      kind: "spawn",
      action: "list",
      code: listed.code,
      stdout: clip(listed.stdout, 1200),
    });
    const ids = jobIdsFromList(listJson);
    const mapIds = map.jobs.map((j) => j.id);
    if (listed.code !== 0) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("HOST_BUILD", `useful-jobs list exited ${listed.code}`, {
          stderr: clip(listed.stderr, 400),
        }),
      });
    }
    if (listJson?.ok === true && ids.length === 0) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("SILENT_EMPTY_SUCCESS", "list returned ok:true with zero jobs", { ids }),
      });
    }
    if (JSON.stringify(ids) !== JSON.stringify(mapIds)) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("LIST_MISMATCH", "list job ids != map", { ids, mapIds }),
      });
    }
    for (const job of map.jobs) {
      const listedJob = (listJson.jobs || []).find((j) => j.id === job.id);
      const required = listedJob?.requiredInputs || [];
      if (JSON.stringify(required) !== JSON.stringify(job.requiredInputs)) {
        return envelope({
          ok: false,
          command: "prove",
          evidence,
          error: failError("LIST_MISMATCH", `${job.id} requiredInputs != map`, {
            required,
            mapped: job.requiredInputs,
          }),
        });
      }
    }

    const callerDir = join(extractDir, "caller-lockfile");
    mkdirSync(callerDir, { recursive: true });
    const pair = lockfilePair({ name: "left-pad", beforeVersion: "1.3.0", afterVersion: "1.3.1" });
    const beforePath = join(callerDir, "before.json");
    const afterPath = join(callerDir, "after.json");
    const outDir = join(extractDir, "out-lockfile");
    writeFileSync(beforePath, `${JSON.stringify(pair.before, null, 2)}\n`);
    writeFileSync(afterPath, `${JSON.stringify(pair.after, null, 2)}\n`);
    const lockArgs = [
      "run",
      "lockfile-pin-delta",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      outDir,
    ];
    const lockRun = await runCommand([process.execPath, cli, ...lockArgs], {
      cwd: kit,
      timeoutMs: 30_000,
    });
    const lockJson = parseJsonText(lockRun.stdout) || parseJsonText(lockRun.stderr);
    evidence.push({
      kind: "spawn",
      action: "lockfile-pin-delta",
      code: lockRun.code,
      stdout: clip(lockRun.stdout, 800),
    });
    const jsonOut = join(outDir, "pin-delta.json");
    const mdOut = join(outDir, "pin-delta.md");
    const outputsExist = existsSync(jsonOut) && existsSync(mdOut) && statSync(jsonOut).size > 0 && statSync(mdOut).size > 0;
    if (lockRun.code !== 0 || lockJson?.ok !== true || !outputsExist) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("HOST_BUILD", "lockfile-pin-delta did not write promised json+md", {
          childExit: lockRun.code,
          product: lockJson,
          jsonOut: existsSync(jsonOut),
          mdOut: existsSync(mdOut),
        }),
      });
    }
    if (lockJson?.purchaseAuthority === true) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("BOUNDARY", "purchaseAuthority true on lockfile run"),
      });
    }

    const pageRun = await runCommand(
      [process.execPath, cli, "run", "page-change-offline-job", "--example"],
      { cwd: kit, timeoutMs: 30_000 },
    );
    const pageJson = parseJsonText(pageRun.stdout) || parseJsonText(pageRun.stderr);
    evidence.push({
      kind: "spawn",
      action: "page-change-example",
      code: pageRun.code,
      stdout: clip(pageRun.stdout, 400),
      stderr: clip(pageRun.stderr, 400),
    });
    const pageRefused =
      pageRun.code !== 0 &&
      (pageJson?.code === "sample_as_delivered_watch" ||
        /sample_as_delivered_watch/.test(`${pageRun.stdout}\n${pageRun.stderr}`));
    if (!pageRefused) {
      return envelope({
        ok: false,
        command: "prove",
        evidence,
        error: failError("SEED_REJECT", "page-change --example did not refuse sample_as_delivered_watch", {
          childExit: pageRun.code,
          product: pageJson,
        }),
      });
    }

    return envelope({
      ok: true,
      command: "prove",
      evidence,
      result: {
        pin: { version: map.pin.version, sha256: map.pin.sha256, bytes: map.pin.bytes },
        kit,
        jobs: ids,
        lockfile: {
          ok: true,
          digest: lockJson?.digest || null,
          outputs: ["pin-delta.json", "pin-delta.md"],
        },
        pageChangeExample: { refused: true, code: pageJson?.code },
        purchaseAuthority: false,
      },
    });
  });
  if (wrapped.fail) return wrapped.fail;
  return wrapped.env;
}
