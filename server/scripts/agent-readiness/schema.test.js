import { describe, expect, it } from "./expect-shim.js";
import { BundleError, parseBundleText, validateBundle } from "../../lib/agent-readiness/schema.js";
import { DEMO_BUNDLES } from "../../lib/agent-readiness/demo.js";
describe("bundle validation", () => {
  it("accepts every demo bundle", () => {
    for (const bundle of DEMO_BUNDLES) {
      expect(validateBundle(JSON.parse(JSON.stringify(bundle))).host).toBe(bundle.host);
    }
  });
  it("rejects non-JSON text", () => {
    expect(() => parseBundleText("not json")).toThrow(BundleError);
    expect(() => parseBundleText("not json")).toThrow(/Not valid JSON/);
  });
  it("rejects a non-object", () => {
    expect(() => validateBundle([])).toThrow(/must be a JSON object/);
  });
  it("rejects the wrong schema", () => {
    expect(() => validateBundle({ schema: "other", host: "a", probedAt: "" })).toThrow(
      /Unsupported schema/
    );
  });
  it("rejects a missing host", () => {
    expect(
      () => validateBundle({ schema: "agent-readiness.probe.v1", probedAt: "2026-09-24T09:00:00Z", responses: {} })
    ).toThrow(/missing a host/);
  });
  it("rejects a bad probedAt", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "yesterday",
        responses: {}
      })
    ).toThrow(/ISO date string/);
  });
  it("rejects missing responses", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "2026-09-24T09:00:00Z"
      })
    ).toThrow(/responses object/);
  });
  it("rejects a response without a status", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "2026-09-24T09:00:00Z",
        responses: { "/llms.txt": { body: "hi" } }
      })
    ).toThrow(/numeric status/);
  });
  it("accepts optional retrieval fields and rejects a bad truncated flag", () => {
    const base = {
      schema: "agent-readiness.probe.v1",
      host: "a.example",
      probedAt: "2026-09-24T09:00:00Z",
      responses: { "/openapi.json": { status: 200, body: "{", truncated: true, error: "timeout" } },
    };
    expect(validateBundle(base).responses["/openapi.json"].truncated).toBe(true);
    expect(() => validateBundle({
      ...base,
      responses: { "/openapi.json": { status: 200, truncated: "yes" } },
    })).toThrow(/truncated must be boolean/);
  });
  it("rejects an unknown response field", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "2026-09-24T09:00:00Z",
        responses: { "/llms.txt": { status: 200, bodyText: "hi" } }
      })
    ).toThrow(/unknown field: bodyText/);
  });
  it("rejects a malformed mcp block", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "2026-09-24T09:00:00Z",
        responses: {},
        mcp: { url: "https://a.example/mcp" }
      })
    ).toThrow(/offeredVersion/);
  });
  it("rejects a malformed corsPreflight entry", () => {
    expect(
      () => validateBundle({
        schema: "agent-readiness.probe.v1",
        host: "a.example",
        probedAt: "2026-09-24T09:00:00Z",
        responses: {},
        corsPreflight: { "/llms.txt": { status: 204 } }
      })
    ).toThrow(/headers object/);
  });
});
