export async function runPhasedWorker({ mode, projectId, runPhase, close, notify }) {
  if (!["recover", "dispatch"].includes(mode) || !projectId) {
    const error = new Error("recover|dispatch and an enrolled project are required");
    error.code = "worker_usage";
    throw error;
  }
  let stop = false;
  const onStop = () => { stop = true; };
  const detach = notify ? notify(onStop) : () => {};
  const phases = mode === "dispatch" ? ["recover", "dispatch"] : ["recover"];
  const ran = [];
  try {
    for (const phase of phases) {
      if (stop) return { phase: `shutdown_before_${phase}`, ran, stopped: true };
      // A stop request does not turn a failed current pass into success.
      await runPhase(phase, { shouldStop: () => stop });
      ran.push(phase);
      if (stop) return { phase: `shutdown_after_${phase}`, ran, stopped: true };
    }
    return { phase: mode === "dispatch" ? "dispatched" : "recovered", ran, stopped: false };
  } finally {
    detach();
    if (close) await close();
  }
}
