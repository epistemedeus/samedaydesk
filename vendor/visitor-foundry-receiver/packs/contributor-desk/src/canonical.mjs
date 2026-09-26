/** Deterministic JSON for I01 terms hashing. */

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

export function canonicalTerms(terms = {}) {
  const reward = terms.reward ?? {};
  const media = Array.isArray(terms.allowedMediaTypes) ? [...terms.allowedMediaTypes] : [];
  return {
    summary: String(terms.summary ?? "").trim(),
    reward: {
      amount: String(reward.amount ?? ""),
      asset: String(reward.asset ?? ""),
      network: String(reward.network ?? ""),
    },
    claimTtlSeconds: Number(terms.claimTtlSeconds ?? 0),
    maxArtifactBytes: Number(terms.maxArtifactBytes ?? 0),
    allowedMediaTypes: media.map((item) => String(item)).sort(),
    slotLimit: Number(terms.slotLimit ?? 0),
  };
}
