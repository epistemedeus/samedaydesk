import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_SMOKE_DIR } from "./paths.mjs";
import { describeEngine, loadEngines } from "./engines.mjs";
import { runEngine, oneLine, writeRunRecord } from "./runner.mjs";

const SAMPLE_NOTE = "SAMPLE/--example is not a customer job";

function phaseArgs(engine, phase) {
  if (phase.id === "help") {
    return { args: [...engine.helpArgs], needsOutDir: false, sample: false };
  }
  if (phase.id === "example") {
    return {
      args: [...engine.exampleArgs],
      needsOutDir: true,
      sample: true,
      note: engine.exampleNote || SAMPLE_NOTE,
    };
  }
  return {
    args: [...(phase.args || [])],
    needsOutDir: phase.needsOutDir === true,
    sample: phase.sample === true,
    note: phase.note || null,
  };
}

function withOutDir(args, outDir, needsOutDir) {
  if (!needsOutDir || !outDir) return args;
  if (args.includes("--out-dir")) return args;
  return [...args, "--out-dir", outDir];
}

export async function runSmoke({
  engines: engineList,
  smokeDir = ENGINE_SMOKE_DIR,
} = {}) {
  const loaded = engineList ? { engines: engineList, source: "provided" } : loadEngines();
  mkdirSync(smokeDir, { recursive: true });
  const summary = {
    at: new Date().toISOString(),
    source: loaded.source,
    sampleNotCustomerJob: true,
    engines: [],
  };

  for (const engine of loaded.engines) {
    const desc = describeEngine(engine);
    const engineDir = join(smokeDir, engine.id);
    mkdirSync(engineDir, { recursive: true });
    const phases = [
      { id: "help" },
      { id: "example" },
      ...(engine.extraSmoke || []),
    ];
    const engineSummary = {
      engineId: engine.id,
      sha: engine.sha,
      executedSha: desc.executedSha,
      worktree: engine.worktree,
      worktreeExists: desc.worktreeExists,
      cliExists: desc.cliExists,
      sampleNotCustomerJob: true,
      phases: {},
    };

    for (const phase of phases) {
      const spec = phaseArgs(engine, phase);
      const runDir = join(engineDir, phase.id);
      const outDir = spec.needsOutDir ? join(runDir, "out") : null;
      const args = withOutDir(spec.args, outDir, spec.needsOutDir);
      let captured;
      let meta;
      if (!desc.worktreeExists || !desc.cliExists) {
        captured = {
          argv: [process.execPath, join(engine.worktree, engine.cliRel), ...args],
          cwd: engine.worktree,
          exitCode: null,
          signal: null,
          timedOut: false,
          spawnError: !desc.worktreeExists
            ? `worktree missing: ${engine.worktree}`
            : `cli missing: ${join(engine.worktree, engine.cliRel)}`,
          stdout: "",
          stderr: "",
          durationMs: 0,
          ok: false,
          outDir,
          outDirFiles: [],
        };
        meta = writeRunRecord(runDir, captured, {
          engineId: engine.id,
          phase: phase.id,
          sha: engine.sha,
          executedSha: desc.executedSha,
          worktree: engine.worktree,
          sample: spec.sample,
          note: spec.note,
        });
      } else {
        const ran = await runEngine({
          engine,
          args,
          runDir,
          outDir,
          sample: spec.sample,
          phase: phase.id,
          note: spec.note,
          executedSha: desc.executedSha,
        });
        captured = ran.captured;
        meta = ran.meta;
      }
      engineSummary.phases[phase.id] = {
        exitCode: captured.exitCode,
        ok: captured.ok === true && captured.exitCode === 0,
        timedOut: captured.timedOut,
        spawnError: captured.spawnError,
        durationMs: captured.durationMs,
        stdoutPreview: oneLine(captured.stdout),
        stderrPreview: oneLine(captured.stderr),
        outDirFiles: captured.outDirFiles,
        sample: spec.sample === true,
      };
      void meta;
    }

    writeFileSync(
      join(engineDir, "meta.json"),
      `${JSON.stringify(engineSummary, null, 2)}\n`,
    );
    summary.engines.push(engineSummary);
  }

  writeFileSync(join(smokeDir, "meta.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
