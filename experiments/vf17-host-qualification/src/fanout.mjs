import pg from "pg";
import { redact } from "./redact.mjs";

function classifyError(err, held) {
  const code = err.code || "unknown";
  const limit = code === "53300" ? "max_connections" : code === "EMFILE" || code === "ENFILE" ? "open_files" : null;
  return {
    outcome: limit ? "refused" : "unknown",
    phase: held ? "work" : "connect",
    code,
    limit,
    ms: null,
    message: redact(err.message || String(err)).slice(0, 240),
  };
}

async function attemptOne(slot, clientConfig, acquire) {
  const client = new pg.Client({
    host: clientConfig.host,
    port: clientConfig.port,
    user: clientConfig.user,
    password: clientConfig.password,
    database: clientConfig.database,
    application_name: "vf17-offered",
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    await client.query("SET statement_timeout = '15s'");
    if (acquire) await acquire(client, slot);
    return { held: true, slot, client };
  } catch (err) {
    try { await client.end(); } catch { /* not connected */ }
    return { held: false, failure: { slot, ...classifyError(err, false) } };
  }
}

export async function fanout({ offered, clientConfig, acquire, sample, run }) {
  if (!Number.isInteger(offered) || offered < 1) {
    throw new Error(`fanout offered client count must be a positive integer, got ${offered}`);
  }
  // One attempt at a time. A refused backend is gone before the next attempt,
  // so the held set is the steady session cap rather than a connect-storm undercount.
  const held = [];
  const failures = [];
  for (let slot = 0; slot < offered; slot += 1) {
    const attempt = await attemptOne(slot, clientConfig, acquire);
    if (attempt.held) held.push(attempt);
    else failures.push(attempt.failure);
  }
  const holderRows = await sample();
  const completed = await Promise.all(held.map(async ({ slot, client }) => {
    try {
      const started = performance.now();
      const detail = await run(client, slot);
      return {
        slot,
        outcome: "completed",
        phase: "work",
        ms: Math.round(performance.now() - started),
        ...detail,
      };
    } catch (err) {
      return { slot, ...classifyError(err, true) };
    } finally {
      try { await client.end(); } catch { /* already closed */ }
    }
  }));
  return { results: [...completed, ...failures], holderRows };
}
