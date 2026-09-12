import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_H04_ROOT,
  DEFAULT_MERCHANT_ROOT,
  H04_SHA,
  LIVE_LOCKFILE_PATH,
  LIVE_LOCKFILE_PRICE_ATOMIC,
  LIVE_LOCKFILE_PRICE_USDC,
  MERCHANT_SHA,
  MERCHANT_VERSION,
  OWNED_DIR,
  SCHEMA_PROFILE,
} from "./pins.mjs";
import { loadH04Pairs } from "./corpus.mjs";
import { controlledCases } from "./controlled.mjs";
import { captureEnvironment, readOsRelease } from "./env-capture.mjs";
import { facilitatorAttemptCost } from "./facilitator-cost.mjs";
import { concurrencyPlan } from "./headroom.mjs";
import {
  classifyHttp,
  decodePaymentRequired,
  jsonPost,
  nextPaymentId,
  startFakeFacilitator,
  startMerchant,
  stopChild,
  testPayment,
} from "./merchant-harness.mjs";
import { measureDuring, sampleTree } from "./procstat.mjs";
import { railwayAllocatedCost, railwayVariableCost } from "./railway-fees.mjs";
import { recommendLiveLockfileOffer } from "./lockfile-offer.mjs";
import { buildSourceExport } from "./source-export.mjs";

async function postLockfile(base, body, headers = {}) {
  const init = jsonPost(body, headers);
  const requestBytes = Buffer.byteLength(init.body);
  const res = await fetch(`${base}${LIVE_LOCKFILE_PATH}`, init);
  const raw = Buffer.from(await res.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    json = null;
  }
  return {
    status: res.status,
    raw,
    json,
    requestBytes,
    outputBytes: raw.length,
    charged: json?.charged === true,
  };
}

function rowFromAttempt({
  id,
  family,
  kind,
  concurrency,
  attempt,
  measurement,
  verifyCalls,
  settleCalls,
}) {
  const final = attempt.paid || attempt.unpaid;
  const classification = classifyHttp(final.status, final.charged);
  const cpuSeconds = measurement.cpuSeconds;
  const wallSeconds = measurement.wallSeconds;
  const railway = railwayVariableCost({
    cpuSeconds,
    wallSeconds,
    peakRssBytes: measurement.peakRssBytes,
  });
  const cdp = facilitatorAttemptCost({
    facilitator: "cdp",
    settleCalls,
    verifyCalls,
  });
  const xpay = facilitatorAttemptCost({
    facilitator: "xpay",
    settleCalls,
    verifyCalls,
  });
  return {
    id,
    family,
    kind,
    concurrency,
    classification,
    httpStatus: final.status,
    charged: final.charged,
    analysis: final.json?.analysis || null,
    transport: final.json?.transport || null,
    code: final.json?.code || null,
    wallMs: measurement.wallMs,
    cpuMs: measurement.cpuMs,
    cpuSeconds,
    wallSeconds,
    peakRssBytes: measurement.peakRssBytes,
    requestBytes: final.requestBytes,
    outputBytes: final.outputBytes,
    unpaidStatus: attempt.unpaid.status,
    paidStatus: attempt.paid?.status ?? null,
    verifyCalls,
    settleCalls,
    railwayVariableUsd: railway.variableUsd,
    railwayVariableUsdcAtomicCeil: railway.variableUsdcAtomicCeil,
    cdpSettleFeeUsdc: cdp.ok ? cdp.settleFeeUsdc : null,
    xpaySettleFeeUsdc: null,
    xpayFeeKnown: false,
    timeoutMsIsNotAverage: true,
  };
}

async function completeAttempt(merchant, body, paymentId) {
  const unpaid = await postLockfile(merchant.base, body);
  if (unpaid.status !== 402) {
    return { unpaid, paid: null };
  }
  const challenge = decodePaymentRequired(unpaid);
  const paid = await postLockfile(merchant.base, body, {
    "payment-signature": testPayment(challenge, { id: paymentId }),
  });
  return { unpaid, paid, challenge };
}

async function measureAttempt(merchant, facilitator, body, paymentId) {
  const verify0 = facilitator.calls.verify;
  const settle0 = facilitator.calls.settle;
  const measured = await measureDuring(merchant.pid, () => completeAttempt(merchant, body, paymentId));
  return {
    attempt: measured.result,
    measurement: measured,
    verifyCalls: facilitator.calls.verify - verify0,
    settleCalls: facilitator.calls.settle - settle0,
  };
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

export function rowsToCsv(rows) {
  const headers = [
    "id", "family", "kind", "concurrency", "classification", "httpStatus", "charged",
    "wallMs", "cpuMs", "peakRssBytes", "requestBytes", "outputBytes",
    "verifyCalls", "settleCalls", "railwayVariableUsd", "railwayVariableUsdcAtomicCeil",
    "cdpSettleFeeUsdc", "analysis", "transport", "code",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function runLockfileProfile({
  merchantRoot = DEFAULT_MERCHANT_ROOT,
  h04Root = DEFAULT_H04_ROOT,
  outDir = join(OWNED_DIR, "measured"),
  concurrencies = [1, 6, 12],
  includeTimeout = true,
} = {}) {
  const environment = captureEnvironment({ merchantRoot, h04Root, extra: { osRelease: readOsRelease() } });
  const headroom = concurrencyPlan({ requested: concurrencies });
  const pairs = loadH04Pairs({ h04Root });
  const controlled = controlledCases();
  const concurrencyBody = pairs.find((p) => p.id === "h04-lock-pub-b04-removal")?.body
    || pairs.find((p) => p.id === "h04-lock-02")?.body;
  const timeoutBody = pairs.find((p) => p.id === "h04-lock-02")?.body || concurrencyBody;

  const facilitator = await startFakeFacilitator();
  let merchant;
  let timeoutMerchant;
  const rows = [];
  try {
    merchant = await startMerchant({ merchantRoot, facilitatorUrl: facilitator.url });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const idle = sampleTree(merchant.pid);

    for (const pair of pairs) {
      const measured = await measureAttempt(merchant, facilitator, pair.body, nextPaymentId(pair.id.slice(0, 8)));
      rows.push(rowFromAttempt({
        id: pair.id,
        family: pair.family,
        kind: pair.kind,
        concurrency: 1,
        ...measured,
      }));
    }

    for (const item of controlled) {
      const measured = await measureAttempt(merchant, facilitator, item.body, nextPaymentId("ctrl"));
      rows.push(rowFromAttempt({
        id: item.id,
        family: item.family,
        kind: item.kind,
        concurrency: 1,
        ...measured,
      }));
    }

    for (const n of headroom.allowed) {
      const verify0 = facilitator.calls.verify;
      const settle0 = facilitator.calls.settle;
      const ids = Array.from({ length: n }, () => nextPaymentId("c"));
      const wave = await measureDuring(merchant.pid, () => Promise.all(
        ids.map((id) => completeAttempt(merchant, concurrencyBody, id)),
      ));
      const verifyCalls = facilitator.calls.verify - verify0;
      const settleCalls = facilitator.calls.settle - settle0;
      wave.result.forEach((attempt, index) => {
        const final = attempt.paid || attempt.unpaid;
        rows.push({
          id: `concurrency-${n}-${index + 1}`,
          family: "concurrency",
          kind: "h04-lock-pub-b04-removal",
          concurrency: n,
          classification: classifyHttp(final.status, final.charged),
          httpStatus: final.status,
          charged: final.charged,
          wallMs: wave.wallMs,
          cpuMs: null,
          peakRssBytes: wave.peakRssBytes,
          requestBytes: final.requestBytes,
          outputBytes: final.outputBytes,
          verifyCalls: null,
          settleCalls: null,
          note: "Per-request facilitator counts are not attributed under concurrent waves; see the wave row.",
        });
      });
      rows.push({
        id: `concurrency-${n}-wave`,
        family: "concurrency-wave",
        kind: "h04-lock-pub-b04-removal",
        concurrency: n,
        classification: "wave",
        httpStatus: null,
        charged: null,
        wallMs: wave.wallMs,
        cpuMs: wave.cpuMs,
        cpuSeconds: wave.cpuSeconds,
        wallSeconds: wave.wallSeconds,
        peakRssBytes: wave.peakRssBytes,
        verifyCalls,
        settleCalls,
        railwayVariableUsd: railwayVariableCost({
          cpuSeconds: wave.cpuSeconds,
          wallSeconds: wave.wallSeconds,
          peakRssBytes: wave.peakRssBytes,
        }).variableUsd,
        railwayVariableUsdcAtomicCeil: railwayVariableCost({
          cpuSeconds: wave.cpuSeconds,
          wallSeconds: wave.wallSeconds,
          peakRssBytes: wave.peakRssBytes,
        }).variableUsdcAtomicCeil,
        timeoutMsIsNotAverage: true,
      });
    }

    if (includeTimeout) {
      timeoutMerchant = await startMerchant({
        merchantRoot,
        facilitatorUrl: facilitator.url,
        extraEnv: { LOCKFILE_PIN_DELTA_WORKER_HOLD_MS: "6000" },
      });
      const measured = await measureAttempt(
        timeoutMerchant,
        facilitator,
        timeoutBody,
        nextPaymentId("timeout"),
      );
      rows.push(rowFromAttempt({
        id: "controlled-timeout",
        family: "controlled",
        kind: "worker-hold-6000ms-vs-5000ms-ceiling",
        concurrency: 1,
        ...measured,
      }));
    }

    const successful = rows.filter((r) => r.classification === "successful");
    const refused = rows.filter((r) => r.classification === "refused");
    const failed = rows.filter((r) => r.classification === "failed");
    const failedSettles = rows.filter((r) => r.classification === "failed" && Number(r.settleCalls) > 0);
    const refusedSettles = rows.filter((r) => r.classification === "refused" && Number(r.settleCalls) > 0);

    const mean = (list, key) => {
      const nums = list.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
      if (!nums.length) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const allocatedHour = railwayAllocatedCost({
      idleRssBytes: idle.rssBytes,
      durationSeconds: 3600,
    });
    const allocatedMonth = railwayAllocatedCost({
      idleRssBytes: idle.rssBytes,
      durationSeconds: 30 * 24 * 3600,
    });

    const recommendation = recommendLiveLockfileOffer({ rows, allocatedHour, allocatedMonth });
    const sourceExport = buildSourceExport({ environment, merchantRoot, h04Root });

    const report = {
      schema: SCHEMA_PROFILE,
      assignment: "W5-D26",
      capturedAt: environment.capturedAt,
      liveLockfileOffer: true,
      historicalAssumedScenario: false,
      certifiedNoLoss: false,
      priceChange: false,
      notProductionCapacity: true,
      offer: {
        path: LIVE_LOCKFILE_PATH,
        method: "POST",
        priceUsdc: LIVE_LOCKFILE_PRICE_USDC,
        priceAtomic: LIVE_LOCKFILE_PRICE_ATOMIC,
        merchantRepo: "epistemedeus/x402-url-extractor",
        merchantSha: MERCHANT_SHA,
        merchantVersion: MERCHANT_VERSION,
        h04Sha: H04_SHA,
      },
      environment,
      headroom,
      idleRssBytes: idle.rssBytes,
      counts: {
        rows: rows.length,
        successful: successful.length,
        refused: refused.length,
        failed: failed.length,
        failedWithSettle: failedSettles.length,
        refusedWithSettle: refusedSettles.length,
      },
      latencyMs: {
        successfulMeanWall: mean(successful, "wallMs"),
        successfulMeanCpu: mean(successful, "cpuMs"),
        refusedMeanWall: mean(refused, "wallMs"),
        failedMeanWall: mean(failed, "wallMs"),
        note: "Measured on this VM against the mounted handler. 5000ms is the worker ceiling, not the average.",
      },
      allocated: {
        hour: allocatedHour,
        monthApprox30d: allocatedMonth,
      },
      rows,
      recommendation,
      sourceExport,
    };

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "profile.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(outDir, "profile.csv"), rowsToCsv(rows.filter((r) => r.family !== "concurrency-wave")));
    writeFileSync(join(outDir, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);
    writeFileSync(join(outDir, "recommendation.json"), `${JSON.stringify(recommendation, null, 2)}\n`);
    writeFileSync(join(outDir, "source-export.json"), `${JSON.stringify(sourceExport, null, 2)}\n`);

    return { ok: true, report, outDir };
  } finally {
    if (timeoutMerchant) await stopChild(timeoutMerchant.child);
    if (merchant) await stopChild(merchant.child);
    await facilitator.close();
  }
}
