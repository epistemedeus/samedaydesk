import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { envelope, failError } from "./envelope.mjs";
import { clip, runCommand } from "./spawn.mjs";

export async function runPresence(parsed, { root, dryRun = false } = {}) {
  const action = parsed.tokens[0] || "cold-read";
  if (action === "refresh") {
    const fixture = parsed.flags.fixture || join(root, "fixtures/presence");
    const argv = [
      process.execPath,
      join(root, "tools/presence/refresh.mjs"),
      "bazaar",
      "--dry-run",
      "--fixture",
      fixture,
    ];
    const evidence = [{ kind: "argv", argv: ["node", "tools/presence/refresh.mjs", "bazaar", "--dry-run", "--fixture", fixture] }];
    if (dryRun) {
      return envelope({
        ok: true,
        command: "presence",
        dryRun: true,
        feature: "for-agents-cold-read",
        evidence,
      });
    }
    const ran = await runCommand(argv, { cwd: root, timeoutMs: 30_000 });
    evidence.push({ kind: "spawn", code: ran.code, stdout: clip(ran.stdout, 800), stderr: clip(ran.stderr, 400) });
    // refresh reports classification via JSON; unknown surface is exit 2 — not used here.
    return envelope({
      ok: ran.code === 0 || ran.code === 1,
      command: "presence",
      feature: "for-agents-cold-read",
      evidence,
      error:
        ran.code === 2
          ? failError("USAGE", clip(ran.stderr, 200))
          : ran.code > 1
            ? failError("HOST_BUILD", `presence refresh exited ${ran.code}`)
            : null,
      result: { childExit: ran.code, dryRun: true, apply: false },
    });
  }

  if (action !== "cold-read") {
    return envelope({
      ok: false,
      command: "presence",
      status: "usage",
      error: failError("USAGE", "presence cold-read | presence refresh --fixture"),
    });
  }

  const evidence = [
    {
      kind: "argv",
      argv: [
        "resolveForAgentsColdRead",
        parsed.flags.live ? "preferFixture:false" : "preferFixture:true",
      ],
    },
  ];
  if (dryRun) {
    return envelope({
      ok: true,
      command: "presence",
      dryRun: true,
      feature: "for-agents-cold-read",
      evidence,
      result: { preferFixture: !parsed.flags.live },
    });
  }

  try {
    const mod = await import(pathToFileURL(join(root, "tools/presence/for-agents-cold-read.mjs")).href);
    const preferFixture = !parsed.flags.live;
    const result = await mod.resolveForAgentsColdRead({ preferFixture });
    evidence.push({
      kind: "cold-read",
      outcome: result.outcome,
      paid: result.paid,
      liveObserved: result.liveObserved,
      coverage: result.coverage,
    });
    if (preferFixture && result.outcome !== "offline_fixture") {
      return envelope({
        ok: false,
        command: "presence",
        feature: "for-agents-cold-read",
        evidence,
        error: failError("HOST_BUILD", 'preferFixture:true must yield outcome "offline_fixture"'),
        result,
      });
    }
    if (result.paid) {
      return envelope({
        ok: false,
        command: "presence",
        feature: "for-agents-cold-read",
        evidence,
        error: failError("SEED_REJECT", "cold-read must stay unpaid"),
        result,
      });
    }
    return envelope({
      ok: true,
      command: "presence",
      feature: "for-agents-cold-read",
      evidence,
      result: {
        outcome: result.outcome,
        paid: result.paid,
        liveObserved: result.liveObserved,
        coverage: result.coverage,
      },
    });
  } catch (error) {
    return envelope({
      ok: false,
      command: "presence",
      feature: "for-agents-cold-read",
      evidence,
      status: "error",
      error: failError("RUNTIME", error.message),
    });
  }
}
