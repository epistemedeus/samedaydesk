import { ALL_OFFERS, accountCheckoutEntry } from "./services.ts";

// The return route comes from the qualified offer catalog, never an arbitrary URL.
export function safeAccountCheckoutNext(value: string | null): string | null {
  return value && ALL_OFFERS.some((offer) => accountCheckoutEntry(offer.slug) === value) ? value : null;
}

export function checkoutLoginPath(pathname: string, search: string): string {
  const offer = new URLSearchParams(search).get("offer");
  const next = pathname === "/checkout" ? accountCheckoutEntry(offer) : null;
  if (!next || !offer) return "/login";
  return "/login?" + new URLSearchParams({ offer, next });
}

export function authHandoff(search: string) {
  const params = new URLSearchParams(search);
  const declared = params.get("offer") || undefined;
  const candidate = safeAccountCheckoutNext(params.get("next"));
  const selected = candidate?.slice("/checkout?offer=".length);
  const offer = declared || selected;
  const next = candidate && (!declared || declared === selected) ? candidate : null;
  const query = new URLSearchParams();
  if (offer) query.set("offer", offer);
  if (next) query.set("next", next);
  const suffix = query.size ? "?" + query : "";
  return { offer, next, query: suffix, destination: "/dashboard" + suffix };
}
