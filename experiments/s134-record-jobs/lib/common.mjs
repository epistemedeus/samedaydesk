/** Shared helpers for S134 offline record-job CLIs. Cash $0. No network. */

export const CASH_BOUNDARY_USD = 0;
export const PAID_VALUE_CLAIM = false;

export const FREE_BASELINE = {
  kind: 'competent-free-baseline',
  description:
    'Diff supplied local artifacts with maintained offline parsers (yaml / csv-parse / fast-xml-parser). No URL fetch, no LLM, no notifications, no marketplace listing.',
  paidValueClaim: false,
};

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) out[a.slice(2)] = true;
    else out._.push(a);
  }
  return out;
}

export function emit(obj) {
  const payload = {
    cashBoundaryUsd: CASH_BOUNDARY_USD,
    paidValueClaim: PAID_VALUE_CLAIM,
    freeBaseline: FREE_BASELINE,
    ...obj,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function uncertainty(code, detail, evidence = {}) {
  return { code, detail, evidence };
}

export function stableSort(arr, keyFn) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
