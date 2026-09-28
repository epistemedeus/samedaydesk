#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { D19_ROOT, PIN, SDS52_SHA } from "../lib/pins.mjs";
import { Incomplete, locateCo16, locateCo20, co20Fixture } from "../lib/locate.mjs";
import { barrierAppendRows, runLedgerExample, tmpDir, twoCreates, writeClonedOrder } from "../lib/run.mjs";

function arg(name) {
  return process.argv.includes(name);
}

async function collect() {
  const co20 = locateCo20();
  const co16 = locateCo16();
  const same = await twoCreates([co20Fixture("ord-1.json"), co20Fixture("ord-1.json")]);
  const distinct = await twoCreates([writeClonedOrder("ord-d19-a"), writeClonedOrder("ord-d19-b")]);
  const ledgerWork = tmpDir("w5-d19-led-");
  const ledger = join(ledgerWork, "ledger.json");
  mkdirSync(join(ledgerWork, "a"), { recursive: true });
  mkdirSync(join(ledgerWork, "b"), { recursive: true });
  const [ledA, ledB] = await Promise.all([
    runLedgerExample({ ledger, outDir: join(ledgerWork, "a") }),
    runLedgerExample({ ledger, outDir: join(ledgerWork, "b") }),
  ]);
  const barrier = await barrierAppendRows(4, { trials: 8 });
  const sameCreators = [same.a.body, same.b.body].filter((body) => body.ok && body.replayed === false);
  return {
    assignment: PIN.id,
    startingRef: SDS52_SHA,
    tested: {
      co20: { sha: co20.sha, source: co20.source, cli: co20.cli },
      co16: { sha: co16.sha, source: co16.source, cli: co16.cli },
    },
    distinctJobs: {
      ok: distinct.a.body.ok === true && distinct.b.body.ok === true,
      orderIds: [distinct.a.body.orderId, distinct.b.body.orderId],
      storeFiles: distinct.storeFiles,
      pids: [distinct.a.proc.pid, distinct.b.proc.pid],
    },
    sameOrder: {
      storeFiles: same.storeFiles,
      replayed: [same.a.body.replayed, same.b.body.replayed],
      nonReplayedCreates: sameCreators.length,
      duplicateEngineOutputs: same.outputsA && same.outputsB,
      pids: [same.a.proc.pid, same.b.proc.pid],
    },
    ledgerCli: {
      ok: ledA.body.ok === true && ledB.body.ok === true,
      runIds: [ledA.body.row?.runId, ledB.body.row?.runId],
    },
    ledgerBarrier: {
      trials: barrier.length,
      lostTrials: barrier.filter((row) => row.lost).length,
      rowCounts: barrier.map((row) => row.rowCount),
    },
    intended: {
      distinctJobsPreserved: distinct.storeFiles.length === 2,
      singleStoreReservation: same.storeFiles.length === 1,
      singleEngineExecution: same.outputsA !== true || same.outputsB !== true,
      ledgerAppendPreservesAll: barrier.every((row) => !row.lost),
    },
  };
}

function intendedHolds(report) {
  return (
    report.intended.distinctJobsPreserved &&
    report.intended.singleStoreReservation &&
    report.intended.singleEngineExecution &&
    report.intended.ledgerAppendPreservesAll
  );
}

try {
  const report = await collect();
  report.intendedHolds = intendedHolds(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (arg("--write-receipt-json")) {
    writeFileSync(join(D19_ROOT, "harness-last.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (arg("--assert-intended") && !report.intendedHolds) {
    process.stderr.write(
      "intended contract not held on this pin. D04 owns reserve-before-run. D13 owns atomic ledger append.\n",
    );
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  const incomplete = err instanceof Incomplete || err?.code === "incomplete";
  process.stdout.write(
    `${JSON.stringify({ ok: false, incomplete, error: String(err.message || err) }, null, 2)}\n`,
  );
  process.exit(incomplete ? 3 : 1);
}
