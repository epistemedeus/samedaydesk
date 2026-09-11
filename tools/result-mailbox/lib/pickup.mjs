import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Bytes } from "./digest.mjs";
import { failBody, refuse } from "./errors.mjs";
import { compareExpiry } from "./expiry.mjs";
import { PICKUP_SCHEMA } from "./pins.mjs";
import { artifactsDir, readEnvelope, retrievedRecordPath, writeJson } from "./store.mjs";

export function materializeVerifiedArtifacts(verified, dest) {
  const target = resolve(dest);
  mkdirSync(target, { recursive: true });
  const copied = [];
  for (const { listed, buf } of verified) {
    const destFile = join(target, listed.name);
    writeFileSync(destFile, buf);
    const written = readFileSync(destFile);
    const digest = sha256Bytes(written);
    if (written.length !== listed.bytes || digest !== listed.sha256) {
      throw refuse(
        "digest-mismatch",
        `artifact ${listed.name} dest bytes failed digest verification`,
        { status: "digest-mismatch" },
      );
    }
    copied.push({
      name: listed.name,
      bytes: listed.bytes,
      sha256: listed.sha256,
      path: destFile,
      ok: true,
    });
  }
  return copied;
}

export function pickup({
  mailbox,
  requestId,
  outDir,
  clock,
  asDelivered = false,
}) {
  let envelope;
  try {
    ({ envelope } = readEnvelope(mailbox, requestId));
  } catch (err) {
    const body = failBody(err, { requestId, retrievedAt: clock, status: err.status || err.code });
    if (outDir) writePickupFile(outDir, body);
    return body;
  }

  const retrievedAt = clock;
  const expiry = compareExpiry(envelope.expiresAt, clock);
  const dest = resolve(outDir);
  mkdirSync(dest, { recursive: true });

  if (envelope.sample === true && asDelivered) {
    const body = failBody(
      refuse(
        "sample-not-delivered",
        "SAMPLE envelopes cannot be labelled delivered-to-buyer",
        { status: "sample-not-delivered" },
      ),
      {
        requestId,
        retrievedAt,
        sample: true,
        sampleReasons: envelope.sampleReasons || [],
        expiry,
        jobId: envelope.jobId,
        acknowledged: false,
      },
    );
    writePickupFile(dest, body);
    return body;
  }

  if (asDelivered) {
    const body = failBody(
      refuse(
        "pickup-is-not-delivery",
        "pickup copies bytes; delivered acknowledgment is a separate ack command",
        { status: "pickup-is-not-delivery" },
      ),
      {
        requestId,
        retrievedAt,
        sample: envelope.sample === true,
        expiry,
        jobId: envelope.jobId,
        acknowledged: envelope.deliveredToBuyer === true,
      },
    );
    writePickupFile(dest, body);
    return body;
  }

  if (expiry.expired) {
    const body = failBody(
      refuse("expired", "envelope expiry timestamp is in the past relative to --clock", {
        status: "expired",
      }),
      {
        requestId,
        retrievedAt,
        sample: envelope.sample === true,
        sampleReasons: envelope.sampleReasons || [],
        expiry,
        jobId: envelope.jobId,
        status: "expired",
        acknowledged: envelope.deliveredToBuyer === true,
      },
    );
    writePickupFile(dest, body);
    return body;
  }

  const verified = [];
  const sourceDir = artifactsDir(mailbox, requestId);
  for (const listed of envelope.artifacts) {
    const src = join(sourceDir, listed.name);
    if (!existsSync(src)) {
      const body = failBody(
        refuse("digest-mismatch", `missing artifact bytes for ${listed.name}`, {
          status: "digest-mismatch",
        }),
        { requestId, retrievedAt, expiry, jobId: envelope.jobId },
      );
      writePickupFile(dest, body);
      return body;
    }
    const buf = readFileSync(src);
    const digest = sha256Bytes(buf);
    if (buf.length !== listed.bytes || digest !== listed.sha256) {
      const body = failBody(
        refuse("digest-mismatch", `artifact ${listed.name} failed digest verification`, {
          status: "digest-mismatch",
        }),
        {
          requestId,
          retrievedAt,
          expiry,
          jobId: envelope.jobId,
          sample: envelope.sample === true,
          artifacts: [
            {
              name: listed.name,
              expectedBytes: listed.bytes,
              expectedSha256: listed.sha256,
              actualBytes: buf.length,
              actualSha256: digest,
              ok: false,
            },
          ],
        },
      );
      writePickupFile(dest, body);
      return body;
    }
    verified.push({ listed, buf });
  }

  let copied;
  try {
    copied = materializeVerifiedArtifacts(verified, dest);
  } catch (err) {
    const body = failBody(err, { requestId, retrievedAt, expiry, jobId: envelope.jobId });
    writePickupFile(dest, body);
    return body;
  }

  const status = envelope.sample ? "retrieved-sample" : "retrieved";
  const body = {
    schema: PICKUP_SCHEMA,
    ok: true,
    refused: false,
    status,
    deliveredToBuyer: false,
    acknowledged: envelope.deliveredToBuyer === true,
    sample: envelope.sample === true,
    sampleReasons: envelope.sampleReasons || [],
    requestId,
    jobId: envelope.jobId,
    retrievedAt,
    expiry,
    artifacts: copied.map(({ name, bytes, sha256, ok }) => ({ name, bytes, sha256, ok })),
    outDir: dest,
    purchaseAuthority: false,
    sold: false,
    liveSettlement: "out-of-scope",
    termsVersion: envelope.termsVersion,
    evidenceClass: "local-runtime",
  };
  body.pickupPath = writePickupFile(dest, body);
  writeJson(retrievedRecordPath(mailbox, requestId), {
    schema: PICKUP_SCHEMA,
    status,
    requestId,
    jobId: envelope.jobId,
    retrievedAt,
    deliveredToBuyer: false,
    acknowledged: envelope.deliveredToBuyer === true,
    artifactsDigest: envelope.artifactsDigest,
  });
  return body;
}

function writePickupFile(outDir, body) {
  const path = join(resolve(outDir), "pickup.json");
  const recorded = {
    schema: PICKUP_SCHEMA,
    ...body,
  };
  writeJson(path, recorded);
  return path;
}
