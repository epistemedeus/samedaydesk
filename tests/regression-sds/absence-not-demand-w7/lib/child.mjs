export const VERIFY_TIMEOUT_MS = 15_000;

export function interpretSpawn(r) {
  if (r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL" || r.signal === "SIGTERM") {
    return {
      status: 124,
      timedOut: true,
      body: { ok: false, error: { code: "ETIMEDOUT" } },
      stderr: r.stderr,
    };
  }
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? 1, timedOut: false, body, stderr: r.stderr };
}
