/**
 * Shared refuse policy for input preparation.
 * Never invent evidence to satisfy an S134 parser.
 */
export function refuse(code, message, evidence = {}) {
  return {
    ok: false,
    refused: true,
    code,
    message,
    evidence,
    paidValueClaim: false,
  };
}

export function isProbablyHtml(text) {
  const t = String(text ?? '').trim().slice(0, 200).toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || (t.startsWith('<') && t.includes('<body'));
}

export function requireFields(obj, fields, label) {
  const missing = fields.filter((f) => obj?.[f] == null || obj[f] === '');
  if (missing.length) {
    return refuse('missing-required-fields', `${label} missing required fields`, { missing });
  }
  return null;
}
