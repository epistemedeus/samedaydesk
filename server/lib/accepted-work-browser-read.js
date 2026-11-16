import {rawHeaderValues} from './contributor-native-ingress.js';

const acceptedWorkPath = /^\/api\/neomorphic-contributor-journey\/v1\/market\/accepted-work(?:\/market-[a-f0-9]{64}(?:\/artifact)?)?$/;

// This is a transport opt-in for the existing consented public projection,
// not a publication grant. The market still checks consent on every read.
export function allowsAcceptedWorkBrowserRead(req, env) {
  if (env.CONTRIBUTOR_JOURNEY_PUBLIC_ACCEPTED_WORK_BROWSER_READS !== '1' ||
      env.CONTRIBUTOR_JOURNEY_MODE !== 'live' || env.CONTRIBUTOR_JOURNEY_PUBLIC_READS !== '1' ||
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
