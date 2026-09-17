import { existsSync } from "node:fs";
import { join } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { GATEWAY_ORIGIN, OPENAPI_FIXTURE, OPENAPI_FIXTURE_VERSION } from "./catalog.mjs";
import { httpRequest, previewBody } from "./http.mjs";
import { readJson } from "./repo.mjs";

export async function runOpenApi(parsed, { root, dryRun = false } = {}) {
  const action = parsed.tokens[0] || "check";
  if (action !== "check") {
    return envelope({
      ok: false,
      command: "openapi",
      status: "usage",
      error: failError("USAGE", "openapi check [--live]"),
    });
  }
  const fixturePath = join(root, OPENAPI_FIXTURE);
  const evidence = [
    { kind: "fixture", path: OPENAPI_FIXTURE, expectedVersion: OPENAPI_FIXTURE_VERSION },
    { kind: "argv", argv: parsed.flags.live ? ["GET", `${GATEWAY_ORIGIN}/openapi.json`] : ["read", OPENAPI_FIXTURE] },
  ];
  if (dryRun) {
    return envelope({
      ok: true,
      command: "openapi",
      dryRun: true,
      feature: "x402-unpaid-discovery",
      evidence,
    });
  }
  if (!existsSync(fixturePath)) {
    return envelope({
      ok: false,
      command: "openapi",
      evidence,
      error: failError("HOST_BUILD", `${OPENAPI_FIXTURE} missing`),
    });
  }
  const fixture = readJson(fixturePath);
  const fixtureVersion = fixture?.info?.version || null;
  evidence.push({ kind: "fixture-version", version: fixtureVersion });
  let live = null;
  if (parsed.flags.live) {
    live = await httpRequest(`${GATEWAY_ORIGIN}/openapi.json`, {
      headers: { accept: "application/json" },
    });
    evidence.push({
      kind: "http",
      status: live.status,
      kindClass: live.kind,
      preview: previewBody(live.body),
      version: live.json?.info?.version || null,
    });
    if (live.kind === "cdn_challenge") {
      return envelope({
        ok: false,
        command: "openapi",
        feature: "x402-unpaid-discovery",
        evidence,
        error: failError("cdn_challenge", "live OpenAPI GET was an hcdn challenge, not product 200"),
      });
    }
  }
  const liveVersion = live?.json?.info?.version || null;
  const drift =
    liveVersion && fixtureVersion && liveVersion !== fixtureVersion
      ? { fixture: fixtureVersion, live: liveVersion }
      : null;
  if (parsed.flags.strict && drift) {
    return envelope({
      ok: false,
      command: "openapi",
      feature: "x402-unpaid-discovery",
      evidence,
      error: failError("HOST_BUILD", "OpenAPI fixture drifted from live", drift),
      result: { fixtureVersion, liveVersion, drift },
    });
  }
  return envelope({
    ok: true,
    command: "openapi",
    feature: "x402-unpaid-discovery",
    evidence,
    result: {
      fixtureVersion,
      liveVersion,
      drift,
      note: drift
        ? "report drift; fixture is not the live merchant pin"
        : "fixture matches live or live not requested",
    },
  });
}
