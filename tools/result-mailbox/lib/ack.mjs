import { join, resolve } from "node:path";
import { failBody, refuse } from "./errors.mjs";
import { compareExpiry } from "./expiry.mjs";
import { ACK_SCHEMA } from "./pins.mjs";
import { ackRecordPath, readEnvelope, writeEnvelope, writeJson } from "./store.mjs";

export function acknowledge({ mailbox, requestId, clock, outDir = null }) {
  let envelope;
  try {
    ({ envelope } = readEnvelope(mailbox, requestId));
  } catch (err) {
    return failBody(err, { requestId, acknowledgedAt: clock, status: err.status || err.code });
  }

  const expiry = compareExpiry(envelope.expiresAt, clock);

  if (envelope.sample === true) {
    return failBody(
      refuse(
        "sample-not-delivered",
        "SAMPLE envelopes cannot be labelled delivered-to-buyer",
        { status: "sample-not-delivered" },
      ),
      {
        requestId,
        acknowledgedAt: clock,
        sample: true,
        sampleReasons: envelope.sampleReasons || [],
        expiry,
        jobId: envelope.jobId,
      },
    );
  }

  if (expiry.expired && envelope.deliveredToBuyer !== true) {
    return failBody(
      refuse("expired", "envelope expiry timestamp is in the past relative to --clock", {
        status: "expired",
      }),
      {
        requestId,
        acknowledgedAt: clock,
        expiry,
        jobId: envelope.jobId,
        status: "expired",
      },
    );
  }

  const already = envelope.deliveredToBuyer === true;
  if (!already) {
    envelope.deliveredToBuyer = true;
    envelope.acknowledgedAt = clock;
    writeEnvelope(mailbox, envelope);
  }

  const body = {
    schema: ACK_SCHEMA,
    ok: true,
    refused: false,
    status: already ? "already-acknowledged" : "acknowledged",
    deliveredToBuyer: true,
    sample: false,
    requestId,
    jobId: envelope.jobId,
    acknowledgedAt: envelope.acknowledgedAt,
    retrieved: false,
    purchaseAuthority: false,
    sold: false,
    liveSettlement: "out-of-scope",
    termsVersion: envelope.termsVersion,
    evidenceClass: "local-runtime",
  };
  const ackPath = ackRecordPath(mailbox, requestId);
  writeJson(ackPath, body);
  body.ackPath = ackPath;
  if (outDir) writeJson(join(resolve(outDir), "ack.json"), body);
  return body;
}
