// Title and publicText only. This is not a general secrecy filter.
// An integer token is a maximal digit run. Comma thousands groups are one
// integer, so 20,000 is 20000 and does not match 20. A period or other
// non-digit ends the run, so 20. and (20) and 20.5 match 20. 2026 and 200
// do not match 20. Digits inside a 0x hex token are not decimal amounts.
// An address token is 0x plus exactly 40 hex characters. The prefix and the
// hex are case-insensitive, and the token is compared in lowercase with the
// fee recipient. A longer hex token is not that address.
// Words such as twenty are not amounts. An isolated 1, including the 1 in
// v1, matches a fee of 1. Structured economics and the terms reward field
// are not passed through this predicate.

function integerTokens(text) {
  const masked = String(text ?? '').replace(/0x[0-9a-f]+/gi, token => ' '.repeat(token.length));
  const found = [];
  for (const match of masked.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) {
    found.push(match[0].replaceAll(',', ''));
  }
  return found;
}

function addressTokens(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(/0x[0-9a-f]{40}(?![0-9a-f])/gi)) {
    found.push(match[0].toLowerCase());
  }
  return found;
}

export function publicFieldLeaks(text, {amounts, feeRecipient}) {
  const wanted = new Set((amounts || []).filter(part => part && part !== '0').map(part => String(part)));
  if (integerTokens(text).some(token => wanted.has(token))) return true;
  if (!feeRecipient) return false;
  const recipient = String(feeRecipient).toLowerCase();
  return addressTokens(text).includes(recipient);
}
