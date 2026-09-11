import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapBundleFreshness, refreshCase } from "../lib/refresh.mjs";
import { TOOL_DIR } from "./helpers.mjs";

describe("unknown freshness is never silently current", () => {
  it("maps missing freshness-receipt to unknown", () => {
    const mapped = mapBundleFreshness([{ artifactId: "release-brief", ok: true, freshness: "unknown" }]);
    assert.equal(mapped.status, "unknown");
    assert.equal(mapped.completeness, "unknown");
    assert.equal(mapped.source, "none");
  });

  it("does not copy a case claim of current", () => {
    const result = refreshCase({
      casePath: join(TOOL_DIR, "fixtures/unknown-freshness.json"),
    });
    assert.equal(result.ok, true);
    assert.equal(result.bundle.freshness, "unknown");
    assert.equal(result.bundle.freshnessDetail.status, "unknown");
    assert.equal(result.bundle.freshnessDetail.source, "none");
    assert.equal(result.bundle.claims.silentCurrent, false);
  });

  it("keeps an unsuccessful freshness-receipt as unknown, not current", () => {
    const mapped = mapBundleFreshness([
      { artifactId: "freshness-receipt", ok: false, freshness: "current" },
    ]);
    assert.equal(mapped.status, "unknown");
  });
});
