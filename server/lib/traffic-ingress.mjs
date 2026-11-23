import { readFileSync } from 'node:fs';
import { trafficContext, trafficPolicy } from './traffic-context.mjs';
let ranges;
try { ranges = JSON.parse(readFileSync(new URL('./crawler-ranges.json', import.meta.url), 'utf8')); } catch { ranges = null; }
export const requestTraffic = (req, path, flags = {}) => trafficContext(req, path,
  { ...flags, policy: trafficPolicy(), ranges });
