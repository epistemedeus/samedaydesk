import {rawHeaderValues} from './contributor-native-ingress.js';

const acceptedWorkPath = /^\/api\/neomorphic-contributor-journey\/v1\/market\/accepted-work(?:\/market-[a-f0-9]{64}(?:\/artifact)?)?$/;

// Browser transport of the existing consented public projection. This does not
// publish anything: the market checks its source-bound profile and current
// consent before serving these three reserved routes. No release-time config
// knob or broader public-journey switch grants access.
export function allowsAcceptedWorkBrowserRead(req, env) {
  if (env.CONTRIBUTOR_JOURNEY_MODE !== 'live' ||
      req.method !== 'GET' || !acceptedWorkPath.test((req.originalUrl || req.url || '').split('?')[0])) return false;
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === env.CONTRIBUTOR_JOURNEY_ORIGIN ||
      !Array.isArray(req.rawHeaders) || rawHeaderValues(req, 'origin').length !== 1 ||
      ['cookie', 'authorization', 'proxy-authorization'].some(name => name in req.headers)) return false;
  try {
    const url = new URL(origin);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    return url.origin === origin && (url.protocol === 'https:' || url.protocol === 'http:' && loopback);
  } catch {
    return false;
  }
}
