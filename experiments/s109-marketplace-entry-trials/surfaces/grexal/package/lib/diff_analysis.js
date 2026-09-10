/**
 * Local unified-diff analysis helpers (no network, no git-apply claims).
 * Labels here describe the text of a diff — they do not prove git-apply or buyer acceptance.
 */

export const DEFAULT_MAX_DIFF_BYTES = 5 * 1024 * 1024;

const TRAVERSAL = /(^|\/)\.\.(\/|$)/;

/**
 * @param {string} diffText
 * @param {{ maxDiffBytes?: number }} [opts]
 */
export function analyzeUnifiedDiff(diffText, opts = {}) {
  const maxDiffBytes = opts.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
  const text = typeof diffText === 'string' ? diffText : '';
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.length ? text.split('\n') : [];

  const files = [];
  let current = null;
  let hunkOpen = false;
  let truncatedHunk = false;
  let expectedOld = 0;
  let expectedNew = 0;
  let sawBinary = false;
  let sawRename = false;
  let sawCopy = false;
  let sawNoNewline = false;
  const unsafePaths = [];

  const pushCurrent = () => {
    if (current) files.push(current);
    current = null;
    hunkOpen = false;
    expectedOld = 0;
    expectedNew = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;

    if (line.startsWith('diff --git ')) {
      if (hunkOpen && (expectedOld > 0 || expectedNew > 0)) truncatedHunk = true;
      pushCurrent();
      const m = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
      current = {
        aPath: m ? m[1] : null,
        bPath: m ? m[2] : null,
        status: 'modify',
        binary: false,
        rename: false,
        copy: false,
        noNewlineMarkers: 0,
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      current.rename = true;
      current.status = 'rename';
      sawRename = true;
    }
    if (line.startsWith('copy from ') || line.startsWith('copy to ')) {
      current.copy = true;
      current.status = 'copy';
      sawCopy = true;
    }
    if (line.startsWith('new file mode')) current.status = 'add';
    if (line.startsWith('deleted file mode')) current.status = 'delete';
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      current.binary = true;
      sawBinary = true;
    }
    if (line.startsWith('\\ No newline at end of file')) {
      current.noNewlineMarkers += 1;
      sawNoNewline = true;
    }

    const hunk = line.match(/^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s@@/);
    if (hunk) {
      if (hunkOpen && (expectedOld > 0 || expectedNew > 0)) truncatedHunk = true;
      hunkOpen = true;
      expectedOld = hunk[2] !== undefined ? Number(hunk[2]) : 1;
      expectedNew = hunk[4] !== undefined ? Number(hunk[4]) : 1;
      continue;
    }

    if (hunkOpen) {
      if (line.startsWith(' ')) {
        expectedOld = Math.max(0, expectedOld - 1);
        expectedNew = Math.max(0, expectedNew - 1);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        expectedOld = Math.max(0, expectedOld - 1);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        expectedNew = Math.max(0, expectedNew - 1);
      } else if (line.startsWith('\\')) {
        // marker; does not consume hunk counts
      } else if (line.startsWith('diff --git ')) {
        // handled above
      } else if (line === '' && isLast) {
        // tolerate final empty split artifact
      } else if (!line.startsWith('@@') && line !== '' && !line.startsWith('\\')) {
        // unknown line inside hunk — may indicate truncation if counts remain
      }
    }
  }
  if (hunkOpen && (expectedOld > 0 || expectedNew > 0)) truncatedHunk = true;
  pushCurrent();

  for (const f of files) {
    for (const p of [f.aPath, f.bPath]) {
      if (!p) continue;
      if (p.startsWith('/') || TRAVERSAL.test(p) || p.includes('\0')) {
        unsafePaths.push(p);
      }
    }
  }

  const looksTruncated =
    truncatedHunk ||
    /\[truncated\]|<<<TRUNCATED>>>|\.\.\.\s*truncated/i.test(text) ||
    (text.length > 0 && !text.endsWith('\n') && /^(diff --git|@@)/m.test(text) && truncatedHunk);

  return {
    bytes,
    exceedsMaxBytes: bytes > maxDiffBytes,
    maxDiffBytes,
    fileCount: files.length,
    files,
    sawBinary,
    sawRename,
    sawCopy,
    sawNoNewline,
    truncatedHunk,
    looksTruncated,
    unsafePaths,
    empty: bytes === 0,
    // Explicit non-claims:
    gitApplyVerified: false,
    buyerAcceptanceVerified: false,
  };
}

/**
 * Evaluate optional buyer criteria against analysis + packaging checks.
 * Returning pass/fail here is criterion-binding math only — not marketplace escrow approval.
 */
export function bindBuyerCriteria(criteria, ctx) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return {
      buyerCriteriaProvided: false,
      buyerCriteriaSatisfied: null,
      note: 'No buyerCriteria supplied. structuralChecksPass≠buyer acceptance.',
      results: [],
    };
  }
  const results = criteria.map((c) => {
    const id = c.id || c.check || 'unnamed';
    let pass = false;
    let detail = '';
    switch (c.type) {
      case 'minFiles':
        pass = ctx.analysis.fileCount >= Number(c.value || 0);
        detail = `fileCount=${ctx.analysis.fileCount} min=${c.value}`;
        break;
      case 'maxDiffBytes':
        pass = ctx.analysis.bytes <= Number(c.value || 0);
        detail = `bytes=${ctx.analysis.bytes} max=${c.value}`;
        break;
      case 'forbidUnsafePaths':
        pass = ctx.analysis.unsafePaths.length === 0;
        detail = `unsafe=${ctx.analysis.unsafePaths.length}`;
        break;
      case 'forbidTruncated':
        pass = !ctx.analysis.looksTruncated && !ctx.analysis.truncatedHunk;
        detail = `looksTruncated=${ctx.analysis.looksTruncated}`;
        break;
      case 'requireStructuralPass':
        pass = Boolean(ctx.structuralChecksPass);
        detail = `structuralChecksPass=${ctx.structuralChecksPass}`;
        break;
      case 'noteOnly':
        pass = false;
        detail = 'noteOnly criteria never auto-pass; human/buyer must decide';
        break;
      default:
        pass = false;
        detail = `unknown criterion type ${c.type}; treated as not satisfied`;
    }
    return { id, type: c.type, pass, detail, buyerAcceptanceVerified: false };
  });
  return {
    buyerCriteriaProvided: true,
    buyerCriteriaSatisfied: results.every((r) => r.pass),
    note: 'Criterion binding is local math on the artifact. It is not escrow approval, git-apply success, or Grexal paid execution.',
    results,
  };
}
