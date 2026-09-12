import assert from "node:assert/strict";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inspectLockfileOffer } from "../lib/inspect.mjs";
import { assertUntamperedArtifacts } from "../lib/invoke.mjs";
import { OfferRefuse } from "../lib/refuse.mjs";
import {
  CALLER_AFTER,
  CALLER_BEFORE,
  REPO_ROOT,
  describeTo,
  discoverTo,
  invokeTo,
  ownedTmp,
  runOffer,
  writeJson,
} from "./helpers.mjs";

function mutateDiscovery(src, mutator) {
  const dir = ownedTmp();
  const doc = JSON.parse(readFileSync(src, "utf8"));
  mutator(doc);
  const dest = join(dir, "discovery.json");
  writeJson(dest, doc);
  return dest;
}

test("stale 1.23.45, wrong remote, and false latest refuse", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const stale = mutateDiscovery(discoveryPath, (doc) => {
    doc.identity.merchant.version = "1.23.45";
  });
  const staleRun = describeTo(stale, CALLER_BEFORE, CALLER_AFTER, join(dir, "stale.json"));
  assert.equal(staleRun.status, 2);
  assert.equal(staleRun.json.code, "stale-merchant-version");

  const wrong = mutateDiscovery(discoveryPath, (doc) => {
    doc.identity.merchant.remote = "https://example.invalid/mcp";
    doc.identity.merchant.serverName = "wrong.server";
  });
  const wrongRun = describeTo(wrong, CALLER_BEFORE, CALLER_AFTER, join(dir, "wrong.json"));
  assert.equal(wrongRun.status, 2);
  assert.equal(["wrong-merchant-name", "wrong-merchant-remote", "identity-changed"].includes(wrongRun.json.code), true);

  const latest = mutateDiscovery(discoveryPath, (doc) => {
    doc.identity.merchant.isLatestAuthority = true;
  });
  const latestRun = describeTo(latest, CALLER_BEFORE, CALLER_AFTER, join(dir, "latest.json"));
  assert.equal(latestRun.status, 2);
  assert.equal(latestRun.json.code, "false-latest-authority");
});

test("GET on POST-only route and paid HTTP to the offline adapter refuse before invocation", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const getRun = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, join(dir, "get.json"), ["--method", "GET"]);
  assert.equal(getRun.status, 2);
  assert.equal(getRun.json.code, "get-on-post-only-route");
  const paid = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, join(dir, "paid.json"), [
    "--acquisition",
    "paid-http",
  ]);
  assert.equal(paid.status, 2);
  assert.equal(paid.json.code, "paid-method-on-offline-adapter");
});

test("changed catalog identity or caller body between processes refuses", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const descriptionPath = join(dir, "description.json");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const tampered = mutateDiscovery(discoveryPath, (doc) => {
    doc.identity.catalog.sha256 = "0".repeat(64);
  });
  const catalogRun = describeTo(tampered, CALLER_BEFORE, CALLER_AFTER, join(dir, "changed-catalog.json"));
  assert.equal(catalogRun.status, 2);
  assert.equal(catalogRun.json.code, "identity-changed");

  assert.equal(describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, descriptionPath).status, 0);
  const swapped = invokeTo(descriptionPath, CALLER_AFTER, CALLER_BEFORE, join(dir, "swapped"));
  assert.equal(swapped.status, 2);
  assert.equal(swapped.json.code, "caller-body-changed");
});

test("renamed or reformatted known samples and SAMPLE metadata cannot become caller evidence", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  assert.equal(discoverTo(discoveryPath).status, 0);

  const journeyBefore = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures/journey/before.json");
  const journeyAfter = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures/journey/after.json");
  const renamedBefore = join(dir, "not-a-sample-name.json");
  const renamedAfter = join(dir, "also-not-a-sample-name.json");
  copyFileSync(journeyBefore, renamedBefore);
  copyFileSync(journeyAfter, renamedAfter);
  const renamed = describeTo(discoveryPath, renamedBefore, renamedAfter, join(dir, "renamed.json"));
  assert.equal(renamed.status, 2);
  assert.equal(renamed.json.code, "sample-not-caller-evidence");

  const reformattedBefore = join(dir, "reformatted-before.json");
  const reformattedAfter = join(dir, "reformatted-after.json");
  writeFileSync(reformattedBefore, `${JSON.stringify(JSON.parse(readFileSync(journeyBefore, "utf8")), null, 4)}\n`);
  writeFileSync(reformattedAfter, `${JSON.stringify(JSON.parse(readFileSync(journeyAfter, "utf8")), null, 4)}\n`);
  const reformatted = describeTo(discoveryPath, reformattedBefore, reformattedAfter, join(dir, "reformatted.json"));
  assert.equal(reformatted.status, 2);
  assert.equal(reformatted.json.code, "sample-not-caller-evidence");

  const sampleBefore = join(dir, "meta-before.json");
  const sampleAfter = join(dir, "meta-after.json");
  const lock = JSON.parse(readFileSync(CALLER_BEFORE, "utf8"));
  lock.name = "SAMPLE";
  writeJson(sampleBefore, lock);
  writeJson(sampleAfter, JSON.parse(readFileSync(CALLER_AFTER, "utf8")));
  const meta = describeTo(discoveryPath, sampleBefore, sampleAfter, join(dir, "meta.json"));
  assert.equal(meta.status, 2);
  assert.equal(meta.json.code, "sample-not-caller-evidence");

  const example = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, join(dir, "example.json"), ["--example"]);
  assert.equal(example.status, 2);
  assert.equal(example.json.code, "sample-not-caller-evidence");
});

test("unsupported job id is refused by the lockfile-only adapter", () => {
  const dir = ownedTmp();
  const result = runOffer(["discover", "--job-id", "vendor-budget-impact", "--out", join(dir, "other.json")]);
  assert.equal(result.status, 2);
  assert.equal(result.json.code, "unsupported-job");
});

test("unknown acquisition, engine-root override, and missing CLI refuse without fallback", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const unknown = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, join(dir, "unknown.json"), [
    "--acquisition",
    "ftp",
  ]);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.json.code, "unknown-acquisition");

  const engineRoot = describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, join(dir, "engine-root.json"), [
    "--engine-root",
    dir,
  ]);
  assert.equal(engineRoot.status, 2);
  assert.equal(engineRoot.json.code, "engine-root-override");

  assert.throws(() => inspectLockfileOffer({ repoRoot: dir, jobId: "lockfile-pin-delta" }), (err) => {
    assert.equal(err instanceof OfferRefuse, true);
    assert.equal(["cli-missing", "catalog-missing", "engine-bin-missing"].includes(err.code), true);
    return true;
  });
});

test("missing input, unsupported lockfile version, and HTML refuse with structured codes", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const descriptionPath = join(dir, "description.json");
  assert.equal(discoverTo(discoveryPath).status, 0);
  const missing = runOffer([
    "describe",
    "--discovery",
    discoveryPath,
    "--before",
    CALLER_BEFORE,
    "--out",
    join(dir, "missing.json"),
  ]);
  assert.equal(missing.status, 2);
  assert.equal(missing.json.code, "missing-required-inputs");

  const unsupported = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures/unsupported-version/lock.json");
  const html = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures/html/not-a-lock.html");
  assert.equal(describeTo(discoveryPath, unsupported, unsupported, descriptionPath).status, 0);
  const versionRun = invokeTo(descriptionPath, unsupported, unsupported, join(dir, "version-out"));
  assert.equal(versionRun.status, 2);
  assert.equal(versionRun.json.ok, false);
  assert.equal(
    versionRun.json.code === "unsupported-lockfile-version" ||
      versionRun.json.spawn?.code === "unsupported-lockfile-version" ||
      versionRun.json.spawn?.body?.code === "unsupported-lockfile-version" ||
      String(versionRun.stdout).includes("unsupported-lockfile-version"),
    true,
    versionRun.stdout,
  );

  const htmlDesc = join(dir, "html-desc.json");
  const htmlDescribe = describeTo(discoveryPath, html, html, htmlDesc);
  if (htmlDescribe.status === 0) {
    const htmlRun = invokeTo(htmlDesc, html, html, join(dir, "html-out"));
    assert.equal(htmlRun.status, 2);
    assert.equal(htmlRun.json.ok, false);
  } else {
    assert.equal(htmlDescribe.json.refused, true);
  }

  const oversizePath = join(dir, "oversize.json");
  writeFileSync(
    oversizePath,
    `{"name":"cw69-oversize","lockfileVersion":3,"packages":{"":{"name":"cw69-oversize","version":"1.0.0"}},"pad":"${"x".repeat(1_048_576)}"}\n`,
  );
  const overDesc = join(dir, "over-desc.json");
  const overDescribe = describeTo(discoveryPath, oversizePath, oversizePath, overDesc);
  if (overDescribe.status === 0) {
    const overRun = invokeTo(overDesc, oversizePath, oversizePath, join(dir, "over-out"));
    assert.equal(overRun.status, 2);
    assert.equal(overRun.json.ok, false);
    const code = overRun.json.code || overRun.json.spawn?.code;
    assert.equal(
      code === "input-oversize" || code === "resource-limit" || overRun.json.refused === true,
      true,
      overRun.stdout,
    );
  } else {
    assert.equal(overDescribe.json.refused, true);
  }
});

test("tampered artifact or receipt is rejected by bound verify", () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const descriptionPath = join(dir, "description.json");
  const outDir = join(dir, "out");
  assert.equal(discoverTo(discoveryPath).status, 0);
  assert.equal(describeTo(discoveryPath, CALLER_BEFORE, CALLER_AFTER, descriptionPath).status, 0);
  const invoked = invokeTo(descriptionPath, CALLER_BEFORE, CALLER_AFTER, outDir);
  assert.equal(invoked.status, 0, invoked.stderr);
  writeFileSync(join(outDir, "pin-delta.json"), "{}\n");
  assert.throws(() => assertUntamperedArtifacts(invoked.json, outDir), (err) => {
    assert.equal(err.code, "tampered-artifact");
    return true;
  });
});
