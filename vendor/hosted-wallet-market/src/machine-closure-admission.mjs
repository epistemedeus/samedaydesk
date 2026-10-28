// One immutable source/host admission for the life of this cache. Public reads use
// current() and do not rescan. There is no cadence, timer, or background rehash.
// The owner invalidates explicitly; recheck() is the only re-admission.
const refuse = (code = 'machine_profile_refused', http = 409) => {
  throw Object.assign(new Error(code), {code, codeName: code, http});
};

export function createClosureAdmission({expectedSource, expectedHost, verify, now = Date.now} = {}) {
  if (typeof verify !== 'function' || typeof expectedSource !== 'string' || typeof expectedHost !== 'string') refuse();
  let state = {status: 'pending'};
  let flight = null;
  let scans = 0;

  function publish(result) {
    const sourceSha256 = result?.sourceSha256;
    const hostSha256 = result?.hostSha256;
    if (sourceSha256 !== expectedSource || hostSha256 !== expectedHost) {
      state = {status: 'failed', at: now(), reason: 'source_mismatch'};
      refuse();
    }
    state = {status: 'admitted', at: now(), sourceSha256, hostSha256};
    return current();
  }

  function run() {
    if (flight) return flight;
    flight = Promise.resolve().then(async () => {
      scans += 1;
      try {
        return publish(await verify());
      } catch (error) {
        if (state.status !== 'failed') state = {status: 'failed', at: now(), reason: 'verify_failed'};
        if (error?.codeName) throw error;
        refuse();
      } finally {
        flight = null;
      }
    });
    return flight;
  }

  function current() {
    if (state.status !== 'admitted') refuse();
    return {sourceSha256: state.sourceSha256, hostSha256: state.hostSha256, at: state.at};
  }

  // Explicit fail-closed. Does not scan and does not schedule a later scan.
  function invalidate() {
    state = {status: 'failed', at: now(), reason: 'invalidated'};
  }

  return {admit: run, recheck: run, current, invalidate, scans: () => scans};
}

// Authentication and CSRF close before any closure read. current() does not rescan.
export async function authorizeMachineMutation({authenticate, admission, req, input, refuse: reject}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('body_refused', 400);
  const account = await authenticate(req, {write: true});
  admission.current();
  return account;
}
