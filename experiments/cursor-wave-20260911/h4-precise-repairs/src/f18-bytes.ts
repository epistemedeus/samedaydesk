import { createHash } from "node:crypto";
import { brotliCompressSync, gzipSync } from "node:zlib";

/** Small non-trivial JSON used only for local gzip/br vs decoded-byte comparison. */
export const F18_BYTES_JSON_TEXT =
  '{"id":"F18-bytes","route":"/extract","status":"ok","price":{"display":"$0.005","amountAtomic":"5000"},"finding":"gzip/br Content-Length is not the decoded JSON byte pin","tags":["gzip","br","content-length","json-pin"]}';

export type F18CompressionEncoding = "gzip" | "br";

export type DecodedJsonPin = {
  decodedBytes: number;
  sha256: string;
};

export type CompressedVsDecoded = {
  contentLength: number;
  decodedBytes: number;
  match: boolean;
  encoding: F18CompressionEncoding;
};

export type CompressedLengthPinInput = {
  contentLength: number;
  decodedBytes: number;
  treatCompressedAsPin: boolean;
};

export type CompressedLengthIsNotJsonPin = {
  ok: false;
  rejected: true;
  code: "compressed-length-is-not-json-pin";
  reason: string;
};

export type DecodedBytesAreTheJsonPin = {
  ok: true;
  rejected: false;
  code: "decoded-bytes-are-the-json-pin";
  reason: string;
};

const COMPRESSED_LENGTH_IS_NOT_JSON_PIN =
  "gzip/br Content-Length is the compressed body size, not the decoded JSON utf8 byte pin";

function utf8Bytes(jsonText: string): Buffer {
  return Buffer.from(jsonText, "utf8");
}

function compressJson(jsonText: string, encoding: F18CompressionEncoding): Buffer {
  const raw = utf8Bytes(jsonText);
  if (encoding === "gzip") {
    // mtime 0 keeps the gzip header deterministic; length is what F18 compares.
    return gzipSync(raw, { mtime: 0 });
  }
  return brotliCompressSync(raw);
}

export function pinDecodedJsonBytes(jsonText: string): DecodedJsonPin {
  const raw = utf8Bytes(jsonText);
  return {
    decodedBytes: raw.byteLength,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

export function compareCompressedLengthToDecoded(
  jsonText: string,
  encoding: F18CompressionEncoding,
): CompressedVsDecoded {
  if (encoding !== "gzip" && encoding !== "br") {
    throw new TypeError(`unsupported encoding: ${String(encoding)}`);
  }
  const decodedBytes = Buffer.byteLength(jsonText, "utf8");
  const contentLength = compressJson(jsonText, encoding).byteLength;
  return {
    contentLength,
    decodedBytes,
    match: contentLength === decodedBytes,
    encoding,
  };
}

export function assertCompressedLengthIsNotJsonPin(
  input: CompressedLengthPinInput & { treatCompressedAsPin: true },
): CompressedLengthIsNotJsonPin;
export function assertCompressedLengthIsNotJsonPin(
  input: CompressedLengthPinInput,
): CompressedLengthIsNotJsonPin | DecodedBytesAreTheJsonPin;
export function assertCompressedLengthIsNotJsonPin(
  input: CompressedLengthPinInput,
): CompressedLengthIsNotJsonPin | DecodedBytesAreTheJsonPin {
  if (input.treatCompressedAsPin) {
    return {
      ok: false,
      rejected: true,
      code: "compressed-length-is-not-json-pin",
      reason: COMPRESSED_LENGTH_IS_NOT_JSON_PIN,
    };
  }
  return {
    ok: true,
    rejected: false,
    code: "decoded-bytes-are-the-json-pin",
    reason: "JSON pin is utf8 Buffer.byteLength of the decoded JSON text, not Content-Length",
  };
}

export const F18_BYTES_GZIP_EXAMPLE = compareCompressedLengthToDecoded(
  F18_BYTES_JSON_TEXT,
  "gzip",
);

export const F18_BYTES_BR_EXAMPLE = compareCompressedLengthToDecoded(
  F18_BYTES_JSON_TEXT,
  "br",
);

export const F18_BYTES_DECODED_PIN = pinDecodedJsonBytes(F18_BYTES_JSON_TEXT);
