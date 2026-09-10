/**
 * Local unified-diff analysis helpers (no network, no git-apply claims).
 * Labels here describe the text of a diff — they do not prove git-apply or buyer acceptance.
 */

export const DEFAULT_MAX_DIFF_BYTES = 5 * 1024 * 1024;

const TRAVERSAL = /(^|\/)\.\.(\/|$)/;

/** Unquote a git C-style path token. Labels only — not git-apply. */
export function unquoteGitPath(raw) {
  if (raw == null) return raw;
  let p = String(raw);
  if (p.endsWith('\r')) p = p.slice(0, -1);
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    const bytes = [];
    const escapes = {a:7,b:8,t:9,n:10,v:11,f:12,r:13,'"':34,'\\':92};
    const inner=p.slice(1,-1);
    for(let i=0;i<inner.length;i++) {
      if(inner[i] !== '\\') {const cp=inner.codePointAt(i); bytes.push(...Buffer.from(String.fromCodePoint(cp))); if(cp>65535)i++;continue;}
      const oct=inner.slice(i+1).match(/^[0-7]{1,3}/);
      if(oct){bytes.push(parseInt(oct[0],8));i+=oct[0].length;}
      else {const ch=inner[++i];if(!(ch in escapes)) throw new Error('Unsupported Git path escape');bytes.push(escapes[ch]);}
    }
    p=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));
  }
  return p;
}

/** Strip one git a/ or b/ prefix (slash or backslash). */
export function stripDiffPrefix(p) {
  if (!p) return p;
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  if (p.startsWith('a\\') || p.startsWith('b\\')) return p.slice(2);
  return p;
}

function isDevNullPath(normalized) {
  return normalized === '/dev/null' || normalized === 'dev/null';
}

/**
 * Absolute, NUL, or .. traversal (slash or backslash). `/dev/null` is not unsafe.
 */
export function isUnsafePath(p) {
  if (p == null || p === '') return false;
  const raw = unquoteGitPath(p);
  if (/[\x00-\x1f\x7f]/.test(raw) || /^[A-Za-z]:/.test(raw)) return true;
  const stripped = stripDiffPrefix(raw);
  for (const c of [raw, stripped]) {
    const n = c.replace(/\\/g, '/');
    if (isDevNullPath(n)) continue;
    if (n.startsWith('/') || /^[A-Za-z]:/.test(n) || TRAVERSAL.test(n)) return true;
  }
  return false;
}

function displayUnsafePath(p) {
  return stripDiffPrefix(unquoteGitPath(p)).replace(/\\/g, '/');
}

/** Split `diff --git` operands; supports quoted tokens and missing a/b prefixes. */
export function splitDiffGitPaths(line) {
  const prefix = 'diff --git ';
  if (!line.startsWith(prefix)) return [];
  const rest = line.endsWith('\r') ? line.slice(prefix.length, -1) : line.slice(prefix.length);
  if (!rest.startsWith('"')) {
    const pair=rest.match(/^a\/(.*) b\/(.*)$/);
    if(pair) return ['a/'+pair[1], 'b/'+pair[2]];
  }
  const tokens = [];
  let i = 0;
  while (i < rest.length && tokens.length < 2) {
    while (i < rest.length && rest[i] === ' ') i += 1;
    if (i >= rest.length) break;
    if (rest[i] === '"') {
      let j = i + 1;
      let closed = false;
      while (j < rest.length) {
        if (rest[j] === '\\' && j + 1 < rest.length) {
          j += 2;
          continue;
        }
        if (rest[j] === '"') {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push(unquoteGitPath(rest.slice(i, closed ? j : rest.length)));
      i = j;
    } else {
      let j = i;
      while (j < rest.length && rest[j] !== ' ') j += 1;
      tokens.push(unquoteGitPath(rest.slice(i, j)));
      i = j;
    }
  }
  return tokens;
}

function parseExtendedHeaderPath(line) {
  const rest = line.startsWith('--- ') || line.startsWith('+++ ') ? line.slice(4) : line;
  const tab = rest.indexOf('\t');
  return unquoteGitPath(tab >= 0 ? rest.slice(0, tab) : rest);
}

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
  let malformed = false;
  let expectedOld = 0;
  let expectedNew = 0;
  let sawBinary = false;
  let sawRename = false;
  let sawCopy = false;
  let sawNoNewline = false;
  const unsafePaths = [];

  const noteUnsafe = (p) => {
    if (!isUnsafePath(p)) return;
    const shown = displayUnsafePath(p);
    if (!unsafePaths.includes(shown)) unsafePaths.push(shown);
  };

  const pushCurrent = () => {
    if (current) {if(!current.hasChange) malformed=true; files.push(current);}
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
      const tokens = splitDiffGitPaths(line);
      const fallback = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
      const aRaw = tokens[0] ?? (fallback ? `a/${fallback[1]}` : null);
      const bRaw = tokens[1] ?? (fallback ? `b/${fallback[2]}` : null);
      current = {
        aPath: aRaw != null ? stripDiffPrefix(unquoteGitPath(aRaw)) : null,
        bPath: bRaw != null ? stripDiffPrefix(unquoteGitPath(bRaw)) : null,
        status: 'modify',
        hasChange: false,
        binary: false,
        rename: false,
        copy: false,
        noNewlineMarkers: 0,
      };
      noteUnsafe(aRaw);
      noteUnsafe(bRaw);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      current.hasChange = true;
      if(line.startsWith('rename from '))current.aPath=unquoteGitPath(line.slice(12));
      else current.bPath=unquoteGitPath(line.slice(10));
      current.rename = true;
      current.status = 'rename';
      sawRename = true;
      if (!hunkOpen) {
        noteUnsafe(line.startsWith('rename from ') ? line.slice(12) : line.slice(10));
      }
    }
    if (line.startsWith('copy from ') || line.startsWith('copy to ')) {
      current.hasChange = true;
      current.copy = true;
      current.status = 'copy';
      sawCopy = true;
      if (!hunkOpen) {
        noteUnsafe(line.startsWith('copy from ') ? line.slice(10) : line.slice(8));
      }
    }
    if (/^(new file mode|deleted file mode|old mode|new mode)/.test(line)) current.hasChange=true;
    if (line.startsWith('new file mode')) current.status = 'add';
    if (line.startsWith('deleted file mode')) current.status = 'delete';
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      current.hasChange = true;
      current.binary = true;
      sawBinary = true;
    }
    if (line.startsWith('\\ No newline at end of file')) {
      current.noNewlineMarkers += 1;
      sawNoNewline = true;
    }

    if (!hunkOpen && (line.startsWith('--- ') || line.startsWith('+++ '))) {
      const operand=parseExtendedHeaderPath(line);
      noteUnsafe(operand);
      const side=line.startsWith('--- ') ? 'aPath' : 'bPath';
      if(operand !== '/dev/null' && current[side] !== stripDiffPrefix(operand)) malformed=true;
    }

    const hunk = line.match(/^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s@@/);
    if (hunk) {
      if (hunkOpen && (expectedOld > 0 || expectedNew > 0)) truncatedHunk = true;
      current.hasChange=true;
      hunkOpen = true;
      expectedOld = hunk[2] !== undefined ? Number(hunk[2]) : 1;
      expectedNew = hunk[4] !== undefined ? Number(hunk[4]) : 1;
      if(!Number.isSafeInteger(expectedOld)||!Number.isSafeInteger(expectedNew))malformed=true;
      continue;
    }

    if (hunkOpen) {
      if (line.startsWith(' ')) {
        expectedOld = expectedOld - 1;
        expectedNew = expectedNew - 1;
      } else if (line.startsWith('-')) {
        expectedOld = expectedOld - 1;
      } else if (line.startsWith('+')) {
        expectedNew = expectedNew - 1;
      } else if (line.startsWith('\\')) {
        // marker; does not consume hunk counts
      } else if (line.startsWith('diff --git ')) {
        // handled above
      } else if (line === '' && isLast) {
        // tolerate final empty split artifact
      } else if (!line.startsWith('@@') && line !== '' && !line.startsWith('\\')) {
        malformed = true;
      }
      if(expectedOld < 0 || expectedNew < 0) malformed=true;
    }
  }
  if (hunkOpen && (expectedOld > 0 || expectedNew > 0)) truncatedHunk = true;
  pushCurrent();

  for (const f of files) {
    noteUnsafe(f.aPath);
    noteUnsafe(f.bPath);
  }

  const looksTruncated =
    truncatedHunk ||
    /\[truncated\]|<<<TRUNCATED>>>|\.\.\.\s*truncated/i.test(text) ||
    (text.length > 0 && !text.endsWith('\n') && /^(diff --git|@@)/m.test(text) && truncatedHunk);

  return {
    bytes,
    malformed: malformed || (bytes > 0 && files.length === 0),
    binaryContentVerified: false,
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
 * Escrow/apply non-claims for the local packager.
 * Local criterion math (including a fully satisfied binding) must never promote these.
 * bindingKind 'local' means documented local math — not marketplace escrow.
 */
export function packagerNonClaims(binding = {}) {
  const provided = binding.buyerCriteriaProvided === true;
  return {
    gitApplyVerified: false,
    buyerAcceptanceVerified: false,
    bidFundingVerified: false,
    escrowApproval: false,
    bindingKind: provided ? 'local' : 'none',
    localBindingSatisfied: provided ? binding.buyerCriteriaSatisfied === true : null,
    localBindingIsNotEscrow: true,
  };
}

function localBindingEnvelope({ provided, satisfied, results, note }) {
  const nonClaims = packagerNonClaims({
    buyerCriteriaProvided: provided,
    buyerCriteriaSatisfied: satisfied,
  });
  return {
    buyerCriteriaProvided: provided,
    buyerCriteriaSatisfied: satisfied,
    bindingKind: nonClaims.bindingKind,
    escrowApproval: nonClaims.escrowApproval,
    buyerAcceptanceVerified: nonClaims.buyerAcceptanceVerified,
    localBindingSatisfied: nonClaims.localBindingSatisfied,
    localBindingIsNotEscrow: nonClaims.localBindingIsNotEscrow,
    note,
    results,
  };
}

/**
 * Evaluate optional buyer criteria against analysis + packaging checks.
 * Returning pass/fail here is criterion-binding math only — not marketplace escrow approval.
 * buyerCriteriaSatisfied / localBindingSatisfied must not be copied onto buyerAcceptanceVerified.
 */
export function bindBuyerCriteria(criteria, ctx) {
  if (!Array.isArray(criteria) || criteria.length > 100) throw new Error('buyerCriteria must be an array of at most 100 entries');
  const ids = new Set();
  for (const c of criteria) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Invalid criterion');
    const id=c.id || c.check || 'unnamed';
    if(typeof id !== 'string' || ids.has(id)) throw new Error('Criterion IDs must be unique strings');
    ids.add(id);
    if(['minFiles','maxDiffBytes'].includes(c.type) && (!Number.isSafeInteger(c.value) || c.value<0)) throw new Error('Criterion value must be a nonnegative integer');
  }
  if (criteria.length === 0) {
    return localBindingEnvelope({
      provided: false,
      satisfied: null,
      results: [],
      note: 'No buyerCriteria supplied. structuralChecksPass≠buyer acceptance. allChecksPass is structural-only.',
    });
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
        detail = c.value
          ? `noteOnly never auto-pass (${c.value}); human/buyer must decide`
          : 'noteOnly criteria never auto-pass; human/buyer must decide';
        break;
      default:
        pass = false;
        detail = `unknown criterion type ${c.type}; treated as not satisfied`;
    }
    return {
      id,
      type: c.type,
      pass,
      detail,
      buyerAcceptanceVerified: false,
      bindingKind: 'local',
      escrowApproval: false,
    };
  });
  const satisfied = results.every((r) => r.pass);
  return localBindingEnvelope({
    provided: true,
    satisfied,
    results,
    note: 'Criterion binding is local math on the artifact. localBindingSatisfied is not escrow approval, git-apply success, or Grexal paid execution. Do not copy it onto buyerAcceptanceVerified.',
  });
}
