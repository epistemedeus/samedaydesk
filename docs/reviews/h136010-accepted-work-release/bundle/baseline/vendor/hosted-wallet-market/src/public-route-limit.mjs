// Anonymous machine reads mounted at the hosted-wallet prefix.
// This is a socket-address limiter, not a client identity limiter. The key is
// req.socket.remoteAddress. x-forwarded-for is ignored, so a shared proxy address
// shares one bucket and a forged forwarded header cannot mint another.
export const MOUNTED_PUBLIC_READS = Object.freeze([
  '/v1/market/profile',
  '/v1/market/discover',
  '/v1/market/participation-contract',
]);

export function onMountedPrefix(prefix, pathname) {
  return pathname === prefix || (typeof pathname === 'string' && pathname.startsWith(prefix + '/'));
}

export function mountedPublicRead(prefix, pathname, method) {
  if (method !== 'GET' || !onMountedPrefix(prefix, pathname)) return false;
  return MOUNTED_PUBLIC_READS.includes(pathname.slice(prefix.length));
}

export function createMountedPublicLimiter({perMinute = 120, capacity = 1024, now = Date.now} = {}) {
  const entries = new Map();
  return function admitMountedPublicRead(prefix, pathname, method, req) {
    if (!mountedPublicRead(prefix, pathname, method)) return {applies: false};
    const time = now();
    for (const [key, entry] of entries) if (entry.until <= time) entries.delete(key);
    const address = req?.socket?.remoteAddress || 'unknown';
    if (!entries.has(address)) {
      if (entries.size >= capacity) return {applies: true, status: 429, code: 'public_rate_limited'};
      entries.set(address, {until: time + 60000, count: 0});
    }
    const entry = entries.get(address);
    entry.count += 1;
    if (entry.count > perMinute) return {applies: true, status: 429, code: 'public_rate_limited'};
    return {applies: true, status: 200};
  };
}
