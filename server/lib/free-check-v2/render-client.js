// The free check's `renderer`: asks the VM-side render worker (tools/free-check-renderer) how many
// words a reader sees once scripts run. A challenge page, an error or a timeout throws, and the
// caller keeps "rendered text" Not verified. The token is sent only as a bearer header.
export const RENDER_TIMEOUT_MS = 9_000;

/** A renderer for collectObservation, or null when the worker is not configured. */
export function createRemoteRenderer({ url = process.env.FREE_CHECK_RENDER_URL, token = process.env.FREE_CHECK_RENDER_TOKEN, timeoutMs = RENDER_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  if (!url || !token) return null;
  const endpoint = new URL("/render", url);
  if (endpoint.protocol !== "https:" && !/^(?:127\.0\.0\.1|localhost)$/.test(endpoint.hostname)) throw Error("The render worker must be reached over HTTPS.");
  return async ({ url: page, signal, initialWords = 0 }) => {
    const limit = AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, limit]) : limit,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: page, initialWords }),
    });
    if (!response.ok) throw Error(`Render worker answered HTTP ${response.status}.`);
    const result = await response.json();
    if (result.challenged) throw Error("The page showed a bot challenge to the renderer.");
    if (!Number.isFinite(result.words) || !Number.isFinite(result.extraWords)) throw Error("The render worker sent no word count.");
    return { words: result.words, extraWords: result.extraWords };
  };
}
