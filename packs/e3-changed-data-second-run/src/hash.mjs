import { createHash } from "node:crypto";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function fixtureFingerprint({ beforeSha256, afterSha256, fields }) {
  const normalizedFields = Array.isArray(fields)
    ? [...fields].map((item) => String(item)).sort()
    : [];
  return sha256Text(
    `${beforeSha256}\n${afterSha256}\n${normalizedFields.join(",")}\n`,
  );
}
