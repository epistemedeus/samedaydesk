import { join } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { hasClientDist, hasNodeModules, readJson } from "./repo.mjs";
import { clip, runCommand } from "./spawn.mjs";
import { HOST_BUILD } from "./catalog.mjs";

const HOST_CI = ["npm", "ci"];
const HOST_NPM_BUILD = ["npm", "run", "build"];

export async function runBuild({ root, dryRun = false, skipCi = false } = {}) {
  const needCi = !skipCi && !hasNodeModules(root);
  const steps = [];
  if (needCi) steps.push(HOST_CI);
  steps.push(HOST_NPM_BUILD);
  const pkg = readJson(join(root, "package.json"));
  const evidence = [
    {
      kind: "host-build",
      install: needCi ? "npm ci" : skipCi ? "skipped" : "already-present",
      build: HOST_BUILD.script,
      includes: HOST_BUILD.includes,
      packageScript: pkg.scripts?.build || null,
    },
    ...steps.map((argv) => ({ kind: "argv", argv })),
  ];

  if (dryRun) {
    return envelope({ ok: true, command: "build", dryRun: true, evidence });
  }

  const outputs = [];
  for (const argv of steps) {
    const ran = await runCommand(argv, { cwd: root, timeoutMs: 10 * 60_000 });
    outputs.push({
      argv,
      code: ran.code,
      timedOut: ran.timedOut,
      stdout: clip(ran.stdout, 2000),
      stderr: clip(ran.stderr, 2000),
    });
    if (ran.code !== 0) {
      return envelope({
        ok: false,
        command: "build",
        evidence: [...evidence, { kind: "spawn", ...outputs.at(-1) }],
        error: failError("HOST_BUILD", `${argv.join(" ")} exited ${ran.code}`, {
          stdout: clip(ran.stdout, 800),
          stderr: clip(ran.stderr, 800),
        }),
      });
    }
  }

  const index = hasClientDist(root);
  evidence.push({
    kind: "client-dist",
    index,
    spawn: outputs.map((item) => ({ argv: item.argv, code: item.code })),
  });
  if (!index) {
    return envelope({
      ok: false,
      command: "build",
      evidence,
      error: failError("HOST_BUILD", "client/dist/index.html missing after npm run build"),
    });
  }

  const clientPkg = readJson(join(root, "client/package.json"));
  const clientBuild = clientPkg.scripts?.build || "";
  if (!clientBuild.includes("tsc -b") || !clientBuild.includes("vite build")) {
    return envelope({
      ok: false,
      command: "build",
      evidence,
      error: failError("HOST_BUILD", "client build must include tsc -b && vite build"),
    });
  }

  return envelope({
    ok: true,
    command: "build",
    evidence,
    result: {
      clientDist: true,
      hostedStartup: true,
      clientBuild,
      script: pkg.scripts.build,
    },
  });
}
