// One config check decides whether the answer panel can run, and every CTA on the site
// reads its copy from that check. With no keys the site promises eligibility only, which
// is what it can actually deliver.
export function isPanelOn() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

export function openaiModel() {
  return process.env.OPENAI_MODEL || "gpt-5.2";
}

export function ctaButton() {
  return isPanelOn()
    ? "Check this site. Quotes on the next page. No email."
    : "Check this site. Eligibility result on the next page. No email.";
}
