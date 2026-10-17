export function redact(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>")
    .replace(/PASSWORD '[^']*'/gi, "PASSWORD '<redacted>'");
}

export function redactSecrets(text, secrets) {
  let out = redact(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("<redacted>");
  }
  return out;
}
