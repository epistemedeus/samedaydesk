// Completion-target auth for a mounted gateway job projection.
// The reader token is sent only when the monitor URL is that reader's own
// completion path on the configured origin. No other request receives it.
export const COMPLETION_PATH = /^\/api\/machine-gateway\/v1\/jobs\/([A-Za-z0-9_-]{1,80})\/completion$/;

export function completionHeaders(config, readers, tenantId) {
  if (!config?.targetAuth?.ref) return {};
  let url;
  try { url = new URL(config.url); } catch { return {}; }
  if (url.search || url.hash || url.username || url.password || !COMPLETION_PATH.test(url.pathname)) return {};
  const reader = (readers ?? []).find(item => item.tenantId === tenantId && item.ref === config.targetAuth.ref);
  if (!reader || reader.origin !== url.origin) return {};
  return { authorization: `Bearer ${reader.token}` };
}
