const SAFE_STRIPE_HOSTS = new Set(["checkout.stripe.com", "pay.stripe.com"]);

export function isSafeStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return SAFE_STRIPE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function requestSellerRepairCheckoutUrl(findingId: string): Promise<string> {
  const res = await fetch("/api/checkout/seller-repair-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finding_id: findingId }),
  });
  if (!res.ok) {
    throw new Error("Could not start checkout");
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url || !isSafeStripeCheckoutUrl(data.url)) {
    throw new Error("Invalid checkout redirect");
  }
  return data.url;
}
