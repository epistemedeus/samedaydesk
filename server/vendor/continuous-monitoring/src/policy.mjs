import { BlockList, isIP } from 'node:net';
import { requireThat } from './errors.mjs';

const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) denied.addSubnet(address, prefix, 'ipv4');
// Only ordinary global IPv6 unicast is allowed; translation, mapped, link-local,
// multicast, ULA, documentation, Teredo and 6to4 cannot tunnel into private IPv4.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  denied.addSubnet(address, prefix, 'ipv6');
}
export function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}
export function targetUrl(text, { mountedOrigin = null } = {}) {
  requireThat(typeof text === 'string' && text.length <= 2048 && !/[\s\x00-\x1f\\]/.test(text), 'invalid_url');
  let url;
  try { url = new URL(text); } catch { requireThat(false, 'invalid_url'); }
  requireThat(!url.username && !url.password && !url.search && !url.hash, 'url_credentials_query_fragment_forbidden');
  // Percent-encoded path tokens and opaque long path segments are refused too.
  // Public paths only: credentials belong in neither this API nor the target URL.
  requireThat(!/%/.test(url.pathname) && !/(?:token|secret|password|api[-_]?key|bearer)(?:[=/:_-]|$)/i.test(url.pathname)
    && !url.pathname.split('/').some(segment => segment.length > 80), 'secret_like_path');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mounted = mountedOrigin && url.origin === mountedOrigin && host === '127.0.0.1';
  if (mounted) requireThat(url.protocol === 'http:', 'invalid_demo_origin');
  else {
    requireThat(url.protocol === 'https:' && (!url.port || url.port === '443'), 'https_public_443_required');
    requireThat(host.includes('.') && !host.endsWith('.') && !/(?:^|\.)(?:localhost|local|internal|home|test|invalid)$/.test(host), 'private_host');
    if (isIP(host)) requireThat(publicAddress(host), 'private_address');
  }
  return url;
}
export function assertMountedOrigin(origin) {
  const url = new URL(origin);
  requireThat(url.origin === origin && url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port, 'invalid_demo_origin');
}
