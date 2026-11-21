const KEY_RE = /^(privateinput|private_input|secret|password|mnemonic|seedphrase|seed_phrase|apikey|api_key|authorization|bearer|controlprivatekey|privatekey)$/i;
const VALUE_RE = /mnemonic:|seed phrase|private key|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\bsk-[A-Za-z0-9]{20,}\b|bearer\s+[A-Za-z0-9\-._~+/]+=*/i;

export function containsPrivate(value, preimage = null) {
  return walk(value, preimage, null);
}

function walk(value, preimage, keyName) {
  if (typeof value === "string") {
    if (VALUE_RE.test(value)) return true;
    if (keyName !== "grantPreimage" && preimage && preimage.length > 0 && value.includes(preimage)) return true;
    return false;
  }
  if (Array.isArray(value)) return value.some((item) => walk(item, preimage, keyName));
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (KEY_RE.test(key) && key !== "grantPreimage") return true;
      if (walk(item, preimage, key)) return true;
    }
  }
  return false;
}

export function redactPaths(value) {
  if (typeof value === "string") {
    if (value.startsWith("/home/") || value.startsWith("/Users/")) return "[redacted-local-path]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redactPaths);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactPaths(item);
    return out;
  }
  return value;
}
