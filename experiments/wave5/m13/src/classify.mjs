export function classifySpawn(result) {
  if (result?.error) {
    return {
      failureClass: "transport",
      outcome: "start-failure",
      code: result.error.code || "spawn-error",
      error: result.error.message,
      status: result.status ?? null,
      signal: result.signal ?? null,
    };
  }
  if (result?.signal) {
    return {
      failureClass: "transport",
      outcome: "signaled",
      code: "signaled",
      error: `process signaled ${result.signal}`,
      status: result.status ?? null,
      signal: result.signal,
    };
  }
  if (!result || result.status == null && !result.stdout) {
    return {
      failureClass: "transport",
      outcome: "empty-spawn",
      code: "empty-spawn",
      error: "no spawn result",
      status: null,
      signal: null,
    };
  }

  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  let body = null;
  try {
    body = stdout ? JSON.parse(stdout) : null;
  } catch {
    return {
      failureClass: "transport",
      outcome: "non-json",
      code: "non-json-stdout",
      error: "wrapper stdout was not JSON",
      status: result.status,
      signal: result.signal ?? null,
      stderrPreview: String(result.stderr || "").slice(0, 400),
    };
  }
  if (!body || typeof body !== "object") {
    return {
      failureClass: "transport",
      outcome: "empty-json",
      code: "empty-json",
      error: "wrapper stdout was empty",
      status: result.status,
      signal: result.signal ?? null,
    };
  }

  if (body.ok === true) {
    return {
      failureClass: "analysis",
      outcome: "success",
      code: null,
      body,
      status: result.status,
      signal: null,
    };
  }

  if (body.ok === false) {
    const engineish = body.code === "engine-refused" || body.code === "internal-error";
    return {
      failureClass: engineish ? "engine" : "analysis",
      outcome: "refusal",
      code: body.code || "refused",
      body,
      status: result.status,
      signal: null,
    };
  }

  return {
    failureClass: "transport",
    outcome: "unclassified",
    code: "unclassified-json",
    error: "wrapper JSON lacked ok boolean",
    body,
    status: result.status,
    signal: null,
  };
}

export function isUsefulDelivery(classified) {
  return classified.failureClass === "analysis" && classified.outcome === "success" && classified.body?.ok === true;
}
