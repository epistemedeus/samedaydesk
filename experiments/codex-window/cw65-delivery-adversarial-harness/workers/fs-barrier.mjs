// Child-only observation seam. Delegates the actual fs operation unchanged.
// Kills occur at a precise boundary; no timing-based claim that stdout loss is a crash.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const config = JSON.parse(fs.readFileSync(process.env.CW65_FS_BARRIER, 'utf8'));
const original = fs.renameSync;
let fired = false;
function hold(source, destination) {
  fired = true;
  fs.writeFileSync(config.ready, JSON.stringify({ pid: process.pid, source: String(source), destination: String(destination), timing: config.timing }) + '\n');
  const started = Date.now();
  while (!fs.existsSync(config.release)) {
    if (Date.now() - started > 20_000) throw new Error('CW65 fs barrier timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
fs.renameSync = function(source, destination) {
  const hit = !fired && String(destination) === config.destination;
  if (hit && config.timing === 'before') hold(source, destination);
  const result = original.apply(this, arguments);
  if (hit && config.timing === 'after') hold(source, destination);
  return result;
};
syncBuiltinESMExports();
