import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { EXIT, OFFER_ID, SCHEMA_REPLY } from "./constants.mjs";
import { projectCurrentAvailability } from "./current-availability.mjs";
import { emptyIsNotOwed, kernelContract, loadKernelPure } from "./kernel-compare.mjs";
import { readHandoffPair } from "./participant.mjs";
import {
  decide,
  importClaim,
  importSubmission,
  inspectSubmission,
  openLedger,
  observeSettlement,
  readByProof,
  readStatus,
  revokeClaim,
  settle,
} from "./ledger.mjs";

const SUPPLIED_STATUS = ["open", "accepts", "accepts-public-submissions", "status", "paid", "state", "admission"];

function suppliedStatus(flags) {
  return SUPPLIED_STATUS.find((key) => Object.prototype.hasOwnProperty.call(flags, key)) ?? null;
}

function mailboxReply(view) {
  return {
    schema: SCHEMA_REPLY,
    channel: "asynchronous_mailbox",
    hostedApi: "unavailable",
    transmitted: false,
    instantApi: false,
    inReplyTo: {
      reservationId: view.reservationId,
      purpose: "read",
      requestStatementSha256: view.requestStatementSha256,
      offerId: view.offerId ?? OFFER_ID,
      termsVersion: view.termsVersion,
    },
    result: {
      state: view.state,
      reward: view.reward,
      paid: view.paid === true,
      reportedStatus: view.state,
      readback: view.readback ?? null,
      accepted_by_root: view.accepted_by_root === true,
      rewardClaimable: view.rewardClaimable === true,
      independentlyVerifiedByThisReply: false,
    },
    duplicatedReplyCreatesObligation: false,
    rootSignature: null,
    replyAuthenticatedByRootKey: false,
  };
}

export async function handle(ctx) {
  const { command, flags, now, terms, repoRoot, readJson, loadLedger } = ctx;
  if (command === "open") {
    return openLedger(loadLedger(flags.ledger), terms, now);
  }
  if (command === "import") {
    return importClaim(loadLedger(flags.ledger), readJson(flags.envelope), now);
  }
  if (command === "receive") {
    if (typeof flags.ledger !== "string" || typeof flags.claim !== "string" || typeof flags.submission !== "string") {
      return { ok: false, exit: EXIT.usage, code: "usage", message: "receive --ledger <qa-ledger.json> --claim <claim-email.json> --submission <submission-email.json>" };
    }
    const ledgerPath = resolve(flags.ledger);
    const publicRoot = resolve(repoRoot, "public");
    if (ledgerPath === publicRoot || ledgerPath.startsWith(`${publicRoot}${sep}`)) {
      return { ok: false, exit: EXIT.wrong_subject, code: "production_ledger", message: "the public tree is not a QA ledger" };
    }
    const read = readHandoffPair(flags.claim, flags.submission);
    if (!read.ok) return { ok: false, exit: read.exit, code: read.code, message: read.message };
    const imported = importClaim(loadLedger(flags.ledger), read.claim, now);
    if (!imported.ok) return imported;
    const submitted = await importSubmission(imported.ledger, read.submission, now, { repoRoot });
    if (!submitted.ok) return submitted;
    const reservationId = read.submission.reservationId ?? imported.result?.reservationId ?? null;
    if (flags.outcome == null) {
      return {
        ok: true,
        exit: EXIT.ok,
        code: "received",
        result: {
          accepted: false,
          paid: false,
          spentAtomic: submitted.ledger?.allocation?.spentAtomic ?? null,
          escrowed: submitted.ledger?.allocation?.escrowed === true,
          delivered: false,
          transmitted: false,
          hostedSubmit: "unavailable",
          autoAccepted: false,
          reservationId,
          idempotentReplay: submitted.result?.idempotentReplay === true,
          obligation: false,
        },
        ledger: submitted.ledger,
      };
    }
    if (flags.outcome !== "accept" && flags.outcome !== "reject") {
      return { ok: false, exit: EXIT.usage, code: "usage", message: "receive --outcome accept|reject" };
    }
    const decision = await decide(submitted.ledger, {
      reservationId,
      outcome: flags.outcome,
    }, now, repoRoot);
    if (!decision.ok) return decision;
    decision.result = {
      ...decision.result,
      accepted: flags.outcome === "accept",
      paid: decision.result?.paid === true,
      delivered: false,
      transmitted: false,
      hostedSubmit: "unavailable",
      autoAccepted: false,
    };
    return decision;
  }
  if (command === "submit") {
    const submission = readJson(flags.submission);
    if (!flags["grant-preimage"] && submission.route === "email" && submission.grantPreimage) {
      return {
        ok: false,
        exit: EXIT.private_input,
        code: "private_input",
        message: "mailbox packet contains the grant preimage",
        ledger: loadLedger(flags.ledger),
      };
    }
    if (flags["grant-preimage"]) {
      if (submission.grantPreimage && submission.grantPreimage !== flags["grant-preimage"]) {
        return {
          ok: false,
          exit: EXIT.unauthenticated,
          code: "grant_mismatch",
          message: "grant preimage does not match the submission",
          ledger: loadLedger(flags.ledger),
        };
      }
      if (!submission.grantPreimage) submission.grantPreimage = flags["grant-preimage"];
    }
    const evidence = flags.evidence ? readJson(flags.evidence) : undefined;
    return importSubmission(loadLedger(flags.ledger), submission, now, { evidence, repoRoot });
  }
  if (command === "inspect") {
    return inspectSubmission(loadLedger(flags.ledger), flags.reservation, now);
  }
  if (command === "reply") {
    const read = readByProof(loadLedger(flags.ledger), readJson(flags.request), now, repoRoot);
    if (!read.ok) return read;
    return { ok: true, exit: EXIT.ok, code: "ok", result: mailboxReply(read.result), ledger: read.ledger };
  }
  if (command === "revoke") {
    return revokeClaim(loadLedger(flags.ledger), readJson(flags.envelope), now);
  }
  if (command === "decide") {
    return decide(loadLedger(flags.ledger), {
      reservationId: flags.reservation,
      outcome: flags.outcome,
      termsVersion: flags["terms-version"],
      offerId: flags.offer,
      amount: flags.amount,
      contributorPublicId: flags["contributor-id"],
      payoutDestination: flags.destination,
    }, now, repoRoot);
  }
  if (command === "status" || command === "retrieve") {
    if (command === "retrieve" && flags.request) {
      const request = readJson(flags.request);
      if (flags.reservation && request.reservationId !== flags.reservation) {
        return { ok: false, exit: EXIT.unauthenticated, code: "proof_failed", message: "read request does not match the reservation", ledger: loadLedger(flags.ledger) };
      }
      return readByProof(loadLedger(flags.ledger), request, now, repoRoot);
    }
    if (command === "retrieve" && !flags["grant-preimage"]) {
      return { ok: false, exit: EXIT.unauthenticated, code: "grant_mismatch", message: "original claim grant is required", ledger: loadLedger(flags.ledger) };
    }
    return readStatus(loadLedger(flags.ledger), flags.reservation, flags["grant-preimage"], now, repoRoot);
  }
  if (command === "settle") {
    const receipt = flags.receipt ? readJson(flags.receipt) : null;
    return settle(loadLedger(flags.ledger), {
      reservationId: flags.reservation,
      payoutDestination: flags.destination,
      receipt,
    });
  }
  if (command === "observe") {
    if (flags.broadcast === true || flags.sign === true || flags.send === true) {
      return { ok: false, exit: EXIT.wrong_subject, code: "not_a_payment", message: "observe does not sign, broadcast, or send" };
    }
    if (typeof flags.ledger !== "string" || typeof flags.reservation !== "string" || typeof flags.tx !== "string") {
      return { ok: false, exit: EXIT.usage, code: "usage", message: "observe --ledger <qa-ledger.json> --reservation <rsv> --tx <hash> --source <address> --destination <address> --rpc <base-rpc>" };
    }
    const ledgerPath = resolve(flags.ledger);
    const publicRoot = resolve(repoRoot, "public");
    if (ledgerPath === publicRoot || ledgerPath.startsWith(`${publicRoot}${sep}`)) {
      return { ok: false, exit: EXIT.wrong_subject, code: "production_ledger", message: "the public tree is not a QA ledger" };
    }
    const rpcUrl = typeof flags.rpc === "string" ? flags.rpc : process.env.CRT_BASE_RPC_URL;
    return observeSettlement(loadLedger(flags.ledger), {
      reservationId: flags.reservation,
      txHash: flags.tx,
      source: flags.source,
      destination: flags.destination,
      broadcast: false,
      sign: false,
      send: false,
    }, {
      rpcUrl,
      timeoutMs: flags["timeout-ms"] == null ? undefined : Number(flags["timeout-ms"]),
      maxBytes: flags["max-bytes"] == null ? undefined : Number(flags["max-bytes"]),
    });
  }
  if (command === "export-availability") {
    if (suppliedStatus(flags)) {
      return {
        ok: false,
        exit: EXIT.usage,
        code: "supplied_status",
        message: "current availability is projected from the ledger lifecycle, counts, capacity, and expiry",
      };
    }
    if (flags.out != null && typeof flags.out !== "string") {
      return { ok: false, exit: EXIT.usage, code: "usage", message: "export-availability --out needs a path" };
    }
    const projected = projectCurrentAvailability(loadLedger(flags.ledger), now, terms.termsVersion);
    if (!projected.ok) return projected;
    if (typeof flags.out === "string") {
      const out = resolve(flags.out);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(projected.artifact, null, 2)}\n`);
    }
    return { ok: true, exit: EXIT.ok, code: "ok", result: projected.artifact };
  }
  if (command === "kernel-compare") {
    const pure = await loadKernelPure(repoRoot);
    const empty = emptyIsNotOwed(pure.reconcilePayout);
    const contract = kernelContract(repoRoot);
    process.stdout.write(`${JSON.stringify({
      kernelId: contract.id,
      adapter: contract.payout.adapter,
      kernelBooted: false,
      providerDbEnrollment: "unavailable",
      replacementDatabaseProvisioned: false,
      emptyOwed: empty.owed,
      emptyPaid: empty.paid,
      emptySettled: empty.settled,
    }, null, 2)}\n`);
    return { direct: true, exit: empty.owed === false && empty.paid === false ? EXIT.ok : EXIT.wrong_subject };
  }
  return { ok: false, exit: EXIT.usage, code: "usage", message: "unknown root command" };
}
