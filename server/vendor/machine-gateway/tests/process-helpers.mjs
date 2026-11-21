import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";

export const execFile = promisify(execFileCallback);
export async function launch(t, script, env = {}) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("owned fixture startup timed out")), 5000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`owned fixture exited ${code}: ${stderr}`)); });
    child.stdout.on("data", data => {
      stdout += data;
      const line = stdout.split("\n").find(line => { try { return !!JSON.parse(line).port; } catch { return false; } });
      if (line) { clearTimeout(timer); resolve(JSON.parse(line).port); }
    });
  });
  const stop = async (signal = "SIGTERM") => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit"); child.kill(signal); await exited;
  };
  t.after(() => stop());
  const port = await ready;
  return { child, port, origin: `http://127.0.0.1:${port}`, base: `http://127.0.0.1:${port}/api/machine-gateway`, stop };
}
