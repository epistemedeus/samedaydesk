/**
 * Opaque task-scoped cursors (browser-safe). Compatible with task-memory material cursors.
 * A cursor is a stream position only; it is not authorization.
 */

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(raw) {
  const padded = raw.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (raw.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeCursor({ streamId, sequence }) {
  if (!streamId || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("cursor requires streamId and positive sequence");
  }
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify([streamId, sequence])));
}

export function decodeCursor(raw, expectedStreamId) {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw townError("invalid_cursor", "invalid cursor encoding");
  }
  const bytes = base64UrlToBytes(raw);
  if (bytesToBase64Url(bytes) !== raw) {
    throw townError("invalid_cursor", "invalid cursor encoding");
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw townError("invalid_cursor", "invalid cursor payload");
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value[0] !== expectedStreamId ||
    !Number.isSafeInteger(value[1]) ||
    value[1] < 1
  ) {
    throw townError("invalid_cursor", "cursor is not valid for this stream");
  }
  return value[1];
}

export function townError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
