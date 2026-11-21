// The release harness (scripts/release/stripe-matrix.mjs) tags each private preview's Stripe test
// sessions with metadata.release_run. Several previews can share one Stripe test account, so each
// listener sees every preview's events; a preview ignores events tagged with another run.
// Only a private preview (SDS_PRIVATE_PREVIEW=1) reads RELEASE_RUN; production never does.
export function releaseRunOf(env = process.env) {
  const run = env.SDS_PRIVATE_PREVIEW === "1" ? env.RELEASE_RUN : null;
  return typeof run === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(run) ? run : null;
}

// True when the event's object carries another run's tag (on the object or its subscription details).
export function belongsToAnotherRun(event, env = process.env) {
  const run = releaseRunOf(env);
  if (!run) return false;
  const object = event?.data?.object ?? {};
  const tag = object.metadata?.release_run ?? object.parent?.subscription_details?.metadata?.release_run;
  return typeof tag === "string" && tag !== run;
}
