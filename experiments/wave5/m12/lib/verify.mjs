import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyResult } from "./classify.mjs";
import { OFFER_ID, OFFER_SCHEMA } from "./schema.mjs";
import { WRAPPER_CLI } from "./paths.mjs";

function finding(id, ok, detail = {}) {
  return { id, ok, ...detail };
}

function spawnCli(repoRoot, args, { timeout = 120_000 } = {}) {
  return spawnSync(process.execPath, [WRAPPER_CLI, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseCliJson(spawned) {
  try {
    return JSON.parse(String(spawned.stdout || "").trim());
  } catch {
    return null;
  }
}

export async function verifyOfferDescription(description, sources, { runRuntime = true } = {}) {
  const findings = [];
  const wrapper = sources.wrapper;
  const repoRoot = sources.repoRoot;

  if (!description || description.schema !== OFFER_SCHEMA) {
    findings.push(finding("schema", false, { expected: OFFER_SCHEMA, got: description?.schema || null }));
    return { ok: false, findings };
  }
  findings.push(finding("schema", true));

  if (typeof description.offerId !== "string" || !description.offerId || /^\d+$/.test(description.offerId)) {
    findings.push(finding("offer-identity", false, { reason: "offerId must be a stable string, not an array index" }));
  } else {
    findings.push(finding("offer-identity", true, { offerId: description.offerId }));
  }

  const catalogIds = sources.catalog.jobs.map((j) => j.id);
  const advertisedIds = Array.isArray(description.jobIds) ? description.jobIds : [];
  if (!Array.isArray(advertisedIds) || advertisedIds.length === 0) {
    findings.push(finding("job-ids", false, { reason: "jobIds missing" }));
  } else if (advertisedIds.some((id, i) => id === String(i) || id === i)) {
    findings.push(finding("job-ids", false, { reason: "catalog array index is not job identity" }));
  } else {
    const unknown = advertisedIds.filter((id) => !catalogIds.includes(id));
    const wrapperUnknown = advertisedIds.filter((id) => !wrapper.JOB_IDS.includes(id));
    findings.push(
      finding("job-ids", unknown.length === 0 && wrapperUnknown.length === 0, {
        unknown,
        wrapperUnknown,
      }),
    );
  }

  for (const id of advertisedIds) {
    const advertised = description.jobsById?.[id];
    const catalogJob = sources.catalog.jobs.find((j) => j.id === id);
    const wrapperJob = wrapper.JOBS.find((j) => j.id === id);
    if (!advertised || !catalogJob || !wrapperJob) {
      findings.push(finding(`job:${id}`, false, { reason: "missing advertised or runtime job" }));
      continue;
    }
    const inputsMatch =
      JSON.stringify(advertised.requiredInputs) === JSON.stringify(catalogJob.requiredInputs) &&
      JSON.stringify(advertised.requiredInputs) === JSON.stringify(wrapperJob.requiredInputs);
    const outputsMatch =
      JSON.stringify(advertised.outputs) === JSON.stringify(catalogJob.outputs) &&
      JSON.stringify(advertised.outputs) === JSON.stringify(wrapperJob.outputs);
    findings.push(finding(`job:${id}`, inputsMatch && outputsMatch, { inputsMatch, outputsMatch }));
  }

  const ids = description.identities || {};
  const catalogSha = ids.catalogSha256;
  const archiveSha = ids.archiveSha256;
  if (!catalogSha || !archiveSha) {
    findings.push(finding("unlike-identities", false, { reason: "missing catalog or archive digest" }));
  } else if (catalogSha === archiveSha || ids.forcedEqual === true) {
    findings.push(
      finding("unlike-identities", false, {
        reason: "catalog digest and archive identity are different documents; do not force them equal",
      }),
    );
  } else if (catalogSha !== sources.catalogSha256 || archiveSha !== wrapper.USEFUL_JOBS_ARCHIVE_SHA256) {
    findings.push(
      finding("unlike-identities", false, {
        reason: "advertised digests do not match current files",
      }),
    );
  } else {
    findings.push(finding("unlike-identities", true));
  }

  const extract = description.prices?.adjacentLive?.find((p) => p.productId === "extract");
  const sia = description.prices?.adjacentLive?.find((p) => p.productId === "seller-integrity-audit");
  const liveExtractOk =
    extract &&
    extract.kind === "live-published" &&
    extract.belongsToSelectedOffer === false &&
    String(extract.amountUsdc) === String(wrapper.LIVE_EXTRACT_PRICE_USDC) &&
    String(extract.amountUsdc) === String(sources.buyer.route.mcpPriceUsd) &&
    String(extract.amountUsdc) === String(sources.mcpExtractPrice) &&
    extract.payTo === wrapper.LIVE_PAY_TO &&
    extract.payTo === sources.buyer.contract.payTo;
  findings.push(finding("live-extract-price", Boolean(liveExtractOk)));

  const liveSiaOk =
    sia &&
    sia.kind === "live-published" &&
    sia.belongsToSelectedOffer === false &&
    String(sia.amountUsdc) === String(wrapper.LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC) &&
    String(sia.amountUsdc) === String(sources.siaAmount) &&
    String(sia.amountUsdc) === String(sources.mcpSiaPrice);
  findings.push(finding("live-sia-price", Boolean(liveSiaOk)));

  const fixture = description.prices?.selected?.find((p) => p.kind === "fixture-labelled");
  const fixtureOk =
    fixture &&
    fixture.live === false &&
    fixture.publishedToLiveCatalog === false &&
    fixture.sold === false &&
    String(fixture.amountUsdc) === String(wrapper.FIXTURE_PRICE_USDC) &&
    String(fixture.amountUsdc) !== String(wrapper.LIVE_EXTRACT_PRICE_USDC) &&
    String(fixture.amountUsdc) !== String(wrapper.LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC);
  findings.push(finding("fixture-not-live", Boolean(fixtureOk)));

  const advertisedJobsAsLive = (description.jobIds || []).some((id) =>
    (description.prices?.adjacentLive || []).some((p) => p.productId === id && p.belongsToSelectedOffer),
  );
  findings.push(finding("jobs-not-live-mcp-products", advertisedJobsAsLive === false));

  const free = description.prices?.selected?.find((p) => p.kind === "free-offline");
  const discoveryOk =
    sources.discovery.purchaseAuthority === false &&
    sources.discovery.paidHostedClaim === false &&
    free &&
    free.purchaseAuthority === false &&
    free.paidHostedClaim === false &&
    free.amountUsdc === "0";
  findings.push(finding("discovery-purchase-authority", Boolean(discoveryOk)));

  const proposed = description.prices?.selected?.find((p) => p.kind === "proposed-cost-backed");
  if (!proposed) {
    findings.push(finding("cost-backing", false, { reason: "proposed-cost-backed row missing" }));
  } else if (proposed.status === "measured") {
    if (sources.d26.status !== "bound") {
      findings.push(finding("cost-backing", false, { reason: "measured price advertised without D26 document" }));
    } else {
      const floor =
        Number(sources.d26.doc.variableCostUsdc) + Number(sources.d26.doc.paymentFeesUsdc);
      const price = Number(proposed.amountUsdc);
      const matchesDoc = String(proposed.amountUsdc) === String(sources.d26.doc.proposedPriceUsdc);
      const loss =
        !matchesDoc ||
        !(price >= floor) ||
        proposed.nonLossmaking !== true ||
        proposed.publishedToLiveCatalog === true;
      findings.push(finding("cost-backing", !loss, { price, floor, matchesDoc }));
    }
  } else if (proposed.amountUsdc != null || proposed.publishedToLiveCatalog === true) {
    findings.push(finding("cost-backing", false, { reason: "unbound D26 cannot advertise a price" }));
  } else {
    findings.push(finding("cost-backing", true, { status: proposed.status }));
  }

  const limits = description.limits || {};
  const limitsOk =
    limits.maxInputBytes === 1_048_576 &&
    limits.purchaseAuthority === false &&
    limits.liveSettlement === "out-of-scope" &&
    limits.sampleNotASale === true &&
    limits.sold === false;
  findings.push(finding("limits", Boolean(limitsOk)));

  if (description.offerId && description.offerId !== OFFER_ID && sources.m01.status !== "bound") {
    findings.push(finding("offer-id-pin", false, { reason: "M01 unbound; offerId must stay SDS52 selected id" }));
  } else {
    findings.push(finding("offer-id-pin", true));
  }

  if (!runRuntime) {
    return { ok: findings.every((f) => f.ok), findings, runtime: { skipped: true } };
  }

  const listed = spawnCli(repoRoot, ["list"]);
  const listBody = parseCliJson(listed);
  const listOk =
    listed.status === 0 &&
    listBody?.ok === true &&
    listBody.liveSettlement === "out-of-scope" &&
    advertisedIds.every((id) => (listBody.jobs || []).includes(id));
  findings.push(
    finding("cli-list", Boolean(listOk), {
      status: listed.status,
      jobs: listBody?.jobs || null,
      stderr: listed.stderr || "",
    }),
  );

  const first = description.firstJourneyJob;
  const firstJob = description.jobsById?.[first];
  const before = join(repoRoot, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json");
  const after = join(repoRoot, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json");
  if (first === "vendor-budget-impact" && firstJob) {
    const outDir = mkdtempSync(join(tmpdir(), "m12-pos-"));
    const pos = spawnCli(repoRoot, [
      "run",
      first,
      "--before",
      before,
      "--after",
      after,
      "--out-dir",
      outDir,
    ]);
    const posBody = parseCliJson(pos);
    const classified = classifyResult(posBody, firstJob.outputs);
    const posOk =
      pos.status === 0 &&
      posBody?.ok === true &&
      posBody?.sold === false &&
      classified.transport === "ok" &&
      classified.delivery.complete === true &&
      firstJob.outputs.every((name) => classified.delivery.present.includes(name));
    findings.push(
      finding("cli-positive-journey", Boolean(posOk), {
        status: pos.status,
        transport: classified.transport,
        analysis: classified.analysis,
        delivery: classified.delivery,
        sold: posBody?.sold,
      }),
    );

    const noChangeDir = mkdtempSync(join(tmpdir(), "m12-nc-"));
    const nc = spawnCli(repoRoot, [
      "run",
      first,
      "--before",
      before,
      "--after",
      before,
      "--out-dir",
      noChangeDir,
    ]);
    const ncBody = parseCliJson(nc);
    const ncClass = classifyResult(ncBody, firstJob.outputs);
    const ncOk =
      nc.status === 0 &&
      nc.signal === null &&
      ncBody?.ok === true &&
      ncClass.transport === "ok" &&
      ncClass.analysis.outcome === "informational" &&
      ncClass.delivery.complete === true;
    findings.push(
      finding("valid-no-change-not-crash", Boolean(ncOk), {
        status: nc.status,
        signal: nc.signal,
        transport: ncClass.transport,
        analysis: ncClass.analysis,
        delivery: ncClass.delivery,
      }),
    );
  } else {
    findings.push(finding("cli-positive-journey", false, { reason: "first journey job is not the SDS52 vendor-budget-impact pin" }));
    findings.push(finding("valid-no-change-not-crash", false, { reason: "first journey job unavailable" }));
  }

  const missing = await wrapper.runPaidOffer({
    jobId: "api-upgrade-brief",
    inputs: { before },
  });
  const missingClass = classifyResult(missing, sources.catalog.jobs.find((j) => j.id === "api-upgrade-brief")?.outputs || []);
  const missingOk =
    missing.ok === false &&
    missing.code === "missing-required-inputs" &&
    missing.sold === false &&
    missingClass.transport === "rejected" &&
    missingClass.analysis.outcome === "not-run";
  findings.push(
    finding("missing-input-is-refusal", Boolean(missingOk), {
      code: missing.code,
      transport: missingClass.transport,
      analysis: missingClass.analysis,
    }),
  );

  const work = mkdtempSync(join(tmpdir(), "m12-oversize-"));
  const big = join(work, "before.json");
  writeFileSync(big, `${"x".repeat((description.limits?.maxInputBytes || 0) + 1)}`);
  const oversize = await wrapper.runPaidOffer({
    jobId: "vendor-budget-impact",
    inputs: { before: big, after },
  });
  const overClass = classifyResult(oversize, description.jobsById?.["vendor-budget-impact"]?.outputs || []);
  const overOk =
    oversize.ok === false &&
    oversize.code === "input-oversize" &&
    oversize.sold === false &&
    overClass.transport === "rejected";
  findings.push(
    finding("advertised-limit-enforced", Boolean(overOk), {
      code: oversize.code,
      transport: overClass.transport,
    }),
  );

  const example = spawnCli(repoRoot, [
    "run",
    "vendor-budget-impact",
    "--example",
    "--funding",
    "reserved-fixture",
    "--payment",
    join(repoRoot, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json"),
  ]);
  const exampleBody = parseCliJson(example);
  const exampleOk =
    example.status !== 0 &&
    exampleBody?.ok === false &&
    exampleBody?.sold === false &&
    exampleBody?.code === "sample-not-a-sale";
  findings.push(finding("sample-not-a-sale", Boolean(exampleOk), { code: exampleBody?.code, status: example.status }));

  const unknown = spawnCli(repoRoot, ["run", "not-a-real-job"]);
  const unknownBody = parseCliJson(unknown);
  const unknownOk =
    unknown.status === 2 &&
    unknown.signal === null &&
    unknownBody?.ok === false &&
    unknownBody?.code === "unknown-job" &&
    unknownBody?.sold === false;
  findings.push(finding("unknown-job-structured", Boolean(unknownOk), { code: unknownBody?.code, status: unknown.status }));

  return {
    ok: findings.every((f) => f.ok),
    findings,
    tested: {
      wrapperContract: wrapper.contract,
      hasCreateExecutor: wrapper.hasCreateExecutor,
      wrapperShaPin: "aeef964fa188443078958d9d6d393afae1d542ee",
    },
  };
}
