import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.mjs";
import { CODES, FEATURE_ID, MAX_PACKET_BYTES, PACKAGE_ROOT, WAVE_ID } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PRIVATE_FIXTURE = join(here, "..", "fixtures/private-data.json");
export const DEFAULT_OK_FIXTURE = join(here, "..", "fixtures/ok.json");

export function loadPacketFile(filePath) {
  const abs = resolve(filePath);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return { ok: false, code: CODES.INPUT_MALFORMED, error: "cannot read fixture", publishAuthorized: false };
  }
  if (!stat.isFile()) {
    return { ok: false, code: CODES.INPUT_MALFORMED, error: "fixture is not a file", publishAuthorized: false };
  }
  if (stat.size > MAX_PACKET_BYTES) {
    return { ok: false, code: CODES.INPUT_OVERSIZE, error: "fixture exceeds 256 KiB", publishAuthorized: false };
  }
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, code: CODES.INPUT_MALFORMED, error: "cannot read fixture", publishAuthorized: false };
  }
  let packet;
  try {
    packet = JSON.parse(text);
  } catch {
    return { ok: false, code: CODES.INPUT_MALFORMED, error: "fixture is not JSON", publishAuthorized: false };
  }
  return { ok: true, packet, path: abs };
}

export function checkFixture(filePath) {
  const loaded = loadPacketFile(filePath);
  if (!loaded.ok) {
    return {
      ok: false,
      rights: null,
      publishAuthorized: false,
      privateData: false,
      wave: WAVE_ID,
      id: FEATURE_ID,
      code: loaded.code,
      error: loaded.error,
    };
  }
  return evaluate(loaded.packet);
}

/**
 * Literal journey: public catalog snippet + one field correction,
 * then a packet with email/address must be rejected as private data.
 */
export function runJourney({ fixturePath, privateFixturePath = DEFAULT_PRIVATE_FIXTURE } = {}) {
  if (!fixturePath) {
    return {
      ok: false,
      rights: null,
      publishAuthorized: false,
      privateData: false,
      wave: WAVE_ID,
      id: FEATURE_ID,
      code: CODES.FIXTURE_REQUIRED,
      error: "--fixture is required",
    };
  }

  const accepted = checkFixture(fixturePath);
  const privatePacket = checkFixture(privateFixturePath);

  if (!accepted.ok) {
    return {
      ...accepted,
      publishAuthorized: false,
      privatePacket,
    };
  }

  const privateRejected =
    privatePacket.ok === false && privatePacket.code === CODES.PRIVATE_DATA;

  if (!privateRejected) {
    return {
      ok: false,
      rights: accepted.rights,
      publishAuthorized: false,
      privateData: false,
      wave: WAVE_ID,
      id: FEATURE_ID,
      code: CODES.PRIVATE_PROBE_NOT_REJECTED,
      error: "packet containing an email/address must be rejected as private data",
      collection: accepted,
      privatePacket,
    };
  }

  return {
    ok: true,
    rights: "cleared",
    publishAuthorized: false,
    privateData: false,
    wave: WAVE_ID,
    id: FEATURE_ID,
    code: CODES.ACCEPTED,
    document: accepted.document,
    correction: accepted.correction,
    rightsClearance: accepted.rightsClearance,
    privatePacket: {
      ok: false,
      rights: privatePacket.rights,
      publishAuthorized: false,
      privateData: true,
      code: CODES.PRIVATE_DATA,
      error: privatePacket.error,
      reasons: privatePacket.reasons,
    },
  };
}

export function packageRoot() {
  return PACKAGE_ROOT;
}
