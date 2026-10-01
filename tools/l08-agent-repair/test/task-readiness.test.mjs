import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";
import { boundedTransport, fetchBounded, outboundHeaders, PublicHostError, MAX_REDIRECTS } from "../lib/bounded-fetch.mjs";
import { catalogText } from "../lib/task-catalog.mjs";
import {
  authorizePacket,
  demandAfterFailedProbe,
  demandFromLedger,
  readFixture,
  semanticResult,
} from "../lib/task-readiness.mjs";
import { NEO230, S14_PIN, acquirePins, exactFetchArgs, gitHead, resolvePin, repoRoot } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cold = join(here, "../cold-client.mjs");
const pinsSource = readFileSync(join(here, "../lib/pins.mjs"), "utf8");

before(() => {
  const pins = acquirePins();
  assert.equal(pins.neo.head, NEO230);
  assert.equal(pins.s14.head, S14_PIN);
}, { timeout: 180_000 });

test("committed task-readiness catalog matches the generator and stays truthful", () => {
  const committed = readFileSync(join(repoRoot, "client/public/discovery/task-readiness.json"), "utf8");
  assert.equal(committed, catalogText());
  const doc = JSON.parse(committed);
  assert.equal(doc.page, null);
  assert.equal(doc.paid, false);
  assert.equal(doc.invokesPricedExecution, false);
  assert.equal(doc.humanPageAdded, false);
  assert.equal(doc.canonical.repaired, true);
  assert.equal(doc.canonical.requiredStatus, 400);
  assert.equal(doc.canonical.missingHeader, "accepted");
  assert.equal(doc.canonical.version, "2025-11-25");
  assert.equal(doc.pins.acquire, "node tools/l08-agent-repair/cold-client.mjs acquire-pins");
  assert.equal(JSON.stringify(doc).includes("score"), false);
});

test("a correctly shaped string quote is not a ready repair", () => {
  const s14 = resolvePin("s14");
  const fixture = readFixture(s14.root, "catalog-row-repair-complete.json");
  const semantic = semanticResult({ data: { quote: "soon" } });
  assert.equal(semantic.shape, "string");
  assert.equal(semantic.state, "fail");
  const packet = authorizePacket({
    method: "POST",
    route: "/quote",
    requiredPaths: fixture.row.requiredPaths,
    schema: fixture.row.schema,
    semantic,
  }, fixture);
  assert.equal(packet.authorized, false);
  assert.equal(packet.reason, "semantic_mismatch");
  assert.equal(semanticResult({ data: { quote: "1.25" } }).state, "pass");
});

test("a failed probe does not become absence of demand", () => {
  const failed = demandAfterFailedProbe();
  assert.equal(failed.availability.state, "fail");
  assert.equal(failed.absenceOfDemand.state, "not_observed");
  assert.equal(failed.absenceOfDemand.code, "probe_failure_is_not_demand");
  assert.equal(demandFromLedger([]).absenceOfDemand.code, "no_demand_records");
  assert.equal(demandFromLedger(null).absenceOfDemand.state, "not_observed");
});

test("caller headers do not cross origins and private redirects are refused", async () => {
  assert.equal(outboundHeaders({ authorization: "Bearer x", origin: "https://caller.example" }, { crossOrigin: false }).authorization, undefined);
  assert.equal(outboundHeaders({ origin: "https://caller.example" }, { crossOrigin: true }).origin, undefined);
  const calls = [];
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  await fetchBounded("http://example.com/start", {
    headers: { authorization: "Bearer caller-secret", origin: "https://caller.example", "content-type": "application/json" },
    lookup,
    transport: async (url, options) => {
      calls.push({ host: url.hostname, headers: options.headers });
      if (calls.length === 1) return { status: 302, headers: { location: "http://other.example/landed" }, body: "" };
      return { status: 200, headers: {}, body: "{}" };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[1].headers.origin, undefined);
  assert.equal(calls[1].headers["content-type"], undefined);
  await assert.rejects(
    () => fetchBounded("http://127.0.0.1/secret"),
    (err) => err instanceof PublicHostError,
  );
  await assert.rejects(
    () => fetchBounded("file:///etc/passwd"),
    (err) => err instanceof PublicHostError,
  );
  await assert.rejects(
    () => fetchBounded("http://user:secret@example.com/x"),
    (err) => err instanceof PublicHostError,
  );
  let dnsCalls = 0;
  await assert.rejects(
    () => fetchBounded("http://example.com/dns", {
      lookup: async () => [{ address: "10.1.2.3", family: 4 }, { address: "93.184.216.34", family: 4 }],
      transport: async () => {
        dnsCalls += 1;
        return { status: 200, headers: {}, body: "" };
      },
    }),
    (err) => err instanceof PublicHostError,
  );
  assert.equal(dnsCalls, 0);
  await assert.rejects(
    () => fetchBounded("http://example.com/bounce", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => ({ status: 302, headers: { location: "http://metadata.google.internal/computeMetadata/v1/" }, body: "" }),
    }),
    (err) => err instanceof PublicHostError,
  );
  await assert.rejects(
    () => fetchBounded("http://example.com/bounce", {
      lookup,
      transport: async () => ({ status: 302, headers: { location: "http://10.1.2.3/secret" }, body: "" }),
    }),
    (err) => err instanceof PublicHostError && /not a public address/.test(err.message),
  );
  let hops = 0;
  await assert.rejects(
    () => fetchBounded("http://example.com/start", {
      lookup,
      maxRedirects: MAX_REDIRECTS,
      transport: async () => {
        hops += 1;
        return { status: 302, headers: { location: "http://example.com/again" }, body: "" };
      },
    }),
    (err) => err instanceof PublicHostError && /Too many redirects/.test(err.message),
  );
  assert.equal(hops, MAX_REDIRECTS + 1);
});

test("caller fetch stops at the byte cap and the time cap", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/big") {
      res.end("x".repeat(1000));
      return;
    }
  });
  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  try {
    const big = await boundedTransport(new URL(`http://127.0.0.1:${port}/big`), {
      method: "GET",
      headers: {},
      address: { address: "127.0.0.1", family: 4 },
      timeoutMs: 2000,
      maxBytes: 32,
    });
    assert.equal(big.truncated, true);
    assert.ok(big.body.length <= 32);
    const started = Date.now();
    const slow = await boundedTransport(new URL(`http://127.0.0.1:${port}/slow`), {
      method: "GET",
      headers: {},
      address: { address: "127.0.0.1", family: 4 },
      timeoutMs: 200,
      maxBytes: 64,
    });
    assert.equal(slow.status, 0);
    assert.ok(Date.now() - started < 2000);
  } finally {
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
});

test("unqualified sibling pins and a wrong checkout are refused without moving HEAD", () => {
  assert.throws(() => resolvePin("s14", join(repoRoot, "..", "pins", "s14")), (err) => err.code === "stale_sibling");
  assert.throws(() => resolvePin("neo", repoRoot), (err) => err.code === "pin_mismatch" || err.code === "stale_sibling");
  assert.deepEqual(exactFetchArgs(S14_PIN), ["fetch", "--depth", "1", "origin", S14_PIN]);
  assert.equal(pinsSource.includes("git pull"), false);
  assert.equal(pinsSource.includes("git clone"), false);
  assert.equal(pinsSource.includes('["fetch", "--depth", "1", "origin", commit]'), true);
  assert.equal(pinsSource.includes("exactFetchArgs(spec.commit)"), true);
  const wrong = mkdtempSync(join(tmpdir(), "l08-wrong-pin-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: wrong });
    spawnSync("git", ["config", "user.email", "pin@example.invalid"], { cwd: wrong });
    spawnSync("git", ["config", "user.name", "pin"], { cwd: wrong });
    spawnSync("git", ["commit", "--allow-empty", "-m", "wrong"], { cwd: wrong });
    const before = gitHead(wrong);
    assert.throws(() => resolvePin("s14", wrong), (err) => err.code === "pin_mismatch");
    assert.equal(gitHead(wrong), before);
    assert.notEqual(before, S14_PIN);
  } finally {
    rmSync(wrong, { recursive: true, force: true });
  }
});

test("cold task-readiness reaches the maintained adapter and the negative exits 1", { timeout: 120_000 }, () => {
  const positive = spawnSync(process.execPath, [cold, "task-readiness"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(positive.status, 0, `${positive.stdout}\n${positive.stderr}`);
  assert.match(positive.stdout, /adapter repair-add-required exit 1 finding seller_response_required_path_missing:data\.quote/);
  assert.match(positive.stdout, /adapter contract-absent exit 1 finding seller_response_contract_absent,seller_response_required_path_missing:data\.quote/);
  assert.match(positive.stdout, /semantic shape string value fail packet refused semantic_mismatch/);
  assert.match(positive.stdout, /retest repair-add-required exit 0/);
  assert.match(positive.stdout, /retest contract-absent exit 0/);
  assert.match(positive.stdout, /observed 400 required 400 unsupported_era pass repaired true/);
  assert.match(positive.stdout, /means repair-needed/);
  assert.match(positive.stdout, /era-retest exit 0/);
  assert.match(positive.stdout, /malicious_source/);
  assert.match(positive.stdout, /dns_private/);
  assert.match(positive.stdout, /budget_time/);
  assert.match(positive.stdout, /public-readback client\/public\/discovery\/task-readiness.json repaired true/);
  assert.match(positive.stdout, /demand not_observed probe_failure_is_not_demand/);
  assert.match(positive.stdout, /empty-ledger fail no_demand_records/);
  assert.match(positive.stdout, /private_address/);
  assert.match(positive.stdout, /paymentSent false/);
  const receipt = JSON.parse(readFileSync(join(here, "../TASK-READINESS-RECEIPT.json"), "utf8"));
  assert.equal(receipt.paymentSent, false);
  assert.equal(receipt.newPaymentRail, false);
  assert.equal(receipt.canonical.era.repaired, true);
  assert.equal(receipt.eraRetest.status, 0);
  assert.equal(receipt.targets[0].before.adapter.complete, false);
  assert.equal(receipt.targets[0].claimedBecausePacket, false);
  assert.equal(receipt.targets[0].retest.complete, true);
  assert.equal(receipt.publicReadback.repaired, true);
  assert.equal(receipt.targets.length, 2);
  assert.equal(receipt.targets[0].before.adapter.json.credentialsUsed, false);
  assert.notEqual(receipt.targets[0].id, receipt.targets[1].id);
  const negative = spawnSync(process.execPath, [cold, "task-readiness-negative"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(negative.status, 1, `${negative.stdout}\n${negative.stderr}`);
  assert.match(negative.stdout, /semantic_not_ready exit 1/);
  assert.match(negative.stdout, /demand_not_from_probe exit 1/);
  assert.match(negative.stdout, /stale_sibling exit 1/);
  assert.match(negative.stdout, /private_not_availability exit 1/);
});
