/**
 * R2-CAPABILITIES-03: Capability evidence binding.
 * Binds a declared capability to exact source + test output facts.
 * Claimed / observed / verified provenance are recorded separately.
 * Signer labels alone are never trust. Supplied digests must match content when both exist.
 */
import { createHash } from "node:crypto";

const SHA256_RE = /^[a-f0-9]{64}$/i;

function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function normalizeSha(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (!SHA256_RE.test(s)) return { invalid: true, value: String(value) };
  return { invalid: false, value: s };
}

/**
 * @param {object} input
 * @param {object} input.declaration - { capabilityId, claim, sourcePath?, revision? }
 * @param {object} [input.source] - { path, content?, sha256?, revision? }
 * @param {object} [input.testOutput] - { path, content?, sha256?, exitCode?, summary?, passed? }
 * @param {object} [input.provenance] - optional signer labels (never sufficient alone)
 */
export function bindEvidence(input = {}) {
  const declaration = asObject(input.declaration, "declaration");
  const capabilityId = String(declaration.capabilityId || "").trim();
  if (!capabilityId) throw new Error("declaration.capabilityId required");

  const source = input.source && typeof input.source === "object" ? input.source : null;
  const testOutput = input.testOutput && typeof input.testOutput === "object" ? input.testOutput : null;
  const provenance = input.provenance && typeof input.provenance === "object" ? input.provenance : null;

  const gaps = [];
  const bindings = [];

  const claimed = {
    capabilityId,
    claim: declaration.claim || null,
    revision: declaration.revision != null ? String(declaration.revision) : null,
    sourcePath: declaration.sourcePath || source?.path || null,
    sourceSha256: null,
    testSha256: null,
  };

  const observed = {
    sourceRevision: source?.revision != null ? String(source.revision) : null,
    sourceSha256: null,
    testExitCode: null,
    testPassedHeuristic: null,
    testSha256: null,
  };

  const verified = {
    sourceDigestMatchesContent: null,
    testDigestMatchesContent: null,
    revisionAligned: null,
    testPassConsistent: null,
  };

  let sourceBinding = null;
  if (source?.path || source?.content != null || source?.sha256 || declaration.sourceSha256) {
    const claimedSha = normalizeSha(source?.sha256 ?? declaration.sourceSha256);
    if (claimedSha?.invalid) {
      gaps.push({ field: "source.sha256", reason: "claimed sha256 is not a 64-hex digest" });
    }
    if (claimedSha && !claimedSha.invalid) claimed.sourceSha256 = claimedSha.value;

    let computed = null;
    if (source?.content != null) {
      computed = sha256Text(source.content);
      observed.sourceSha256 = computed;
    }

    let digestOk = null;
    if (claimedSha && !claimedSha.invalid && computed) {
      digestOk = claimedSha.value === computed;
      verified.sourceDigestMatchesContent = digestOk;
      if (!digestOk) {
        gaps.push({
          field: "source.sha256",
          reason: "claimed sha256 does not match hash of supplied content",
        });
      }
    } else if (claimedSha && !claimedSha.invalid && source?.content == null) {
      // Claimed digest without content is observed claim only — not verified.
      observed.sourceSha256 = claimedSha.value;
      verified.sourceDigestMatchesContent = false;
      gaps.push({
        field: "source.content",
        reason: "claimed sha256 present without content; digest not verified against bytes",
      });
    } else if ((!claimedSha || claimedSha.invalid) && computed) {
      verified.sourceDigestMatchesContent = true;
    }

    const declRev = claimed.revision;
    const srcRev = observed.sourceRevision;
    let revisionBlocks = false;
    if (declRev != null && srcRev != null && declRev !== srcRev) {
      verified.revisionAligned = false;
      revisionBlocks = true;
      gaps.push({
        field: "revision",
        reason: `declaration.revision=${declRev} conflicts with source.revision=${srcRev}`,
      });
    } else if (declRev != null && srcRev != null) {
      verified.revisionAligned = true;
    } else {
      verified.revisionAligned = null;
    }

    const usableSha = digestOk === true ? computed : computed && !(claimedSha && !claimedSha.invalid) ? computed : null;
    if (!usableSha || revisionBlocks) {
      gaps.push({
        field: "source.digest",
        reason: revisionBlocks
          ? "revision conflict blocks verified source binding"
          : "no verified source digest (need content hash, or matching claimed sha256+content)",
      });
    } else {
      sourceBinding = {
        path: source?.path ? String(source.path) : null,
        sha256: usableSha,
        revisionClaimed: declRev,
        revisionObserved: srcRev,
      };
      bindings.push({ kind: "source", ...sourceBinding });
    }
  } else {
    gaps.push({ field: "source", reason: "no source path/content/sha256 supplied" });
  }

  let testBinding = null;
  if (testOutput?.path || testOutput?.content != null || testOutput?.sha256 || testOutput?.exitCode != null) {
    const content = testOutput.content != null ? String(testOutput.content) : null;
    const claimedSha = normalizeSha(testOutput.sha256);
    if (claimedSha?.invalid) {
      gaps.push({ field: "testOutput.sha256", reason: "claimed sha256 is not a 64-hex digest" });
    }
    if (claimedSha && !claimedSha.invalid) claimed.testSha256 = claimedSha.value;

    let computed = null;
    if (content != null) {
      computed = sha256Text(content);
      observed.testSha256 = computed;
    }

    let digestOk = null;
    if (claimedSha && !claimedSha.invalid && computed) {
      digestOk = claimedSha.value === computed;
      verified.testDigestMatchesContent = digestOk;
      if (!digestOk) {
        gaps.push({
          field: "testOutput.sha256",
          reason: "claimed sha256 does not match hash of supplied test content",
        });
      }
    } else if (claimedSha && !claimedSha.invalid && content == null) {
      observed.testSha256 = claimedSha.value;
      verified.testDigestMatchesContent = false;
      gaps.push({
        field: "testOutput.content",
        reason: "claimed test sha256 present without content; digest not verified",
      });
    } else if (!claimedSha && computed) {
      verified.testDigestMatchesContent = true;
    }

    const exitCode = testOutput.exitCode;
    observed.testExitCode = typeof exitCode === "number" ? exitCode : null;

    const heuristicPass =
      content != null
        ? /\b#\s*fail\s+0\b|# fail 0/i.test(content) &&
          /# pass \d+/i.test(content) &&
          !/\bnot ok\b/.test(content)
        : null;
    observed.testPassedHeuristic = heuristicPass;

    // Contradictions: exitCode!=0 but heuristic pass, or exitCode==0 with not ok / fail>0
    let passConsistent = true;
    if (typeof exitCode === "number" && heuristicPass === true && exitCode !== 0) {
      passConsistent = false;
      gaps.push({
        field: "testOutput",
        reason: "exitCode nonzero contradicts TAP pass heuristic",
      });
    }
    if (typeof exitCode === "number" && exitCode === 0 && content && /\bnot ok\b/.test(content)) {
      passConsistent = false;
      gaps.push({
        field: "testOutput",
        reason: "exitCode 0 contradicts TAP not-ok lines",
      });
    }
    if (typeof exitCode === "number" && exitCode === 0 && content && /# fail ([1-9]\d*)/i.test(content)) {
      passConsistent = false;
      gaps.push({
        field: "testOutput",
        reason: "exitCode 0 contradicts TAP fail count > 0",
      });
    }
    verified.testPassConsistent = passConsistent;

    // Bound requires verified digest of content + TAP # pass / # fail 0 without not ok.
    // exitCode 0 alone, or loose "pass" text alone, is insufficient.
    const usableSha = digestOk === true ? computed : computed && !claimedSha ? computed : null;
    const tapOk = heuristicPass === true;
    const exitOk = exitCode == null ? true : exitCode === 0;
    const boundEligible = Boolean(usableSha) && tapOk && exitOk && passConsistent;

    if (!usableSha) {
      gaps.push({
        field: "testOutput.digest",
        reason: "no verified test digest; hashing claim without content is not evidence",
      });
    }
    if (!tapOk) {
      gaps.push({
        field: "testOutput",
        reason:
          content == null
            ? "test content missing; exitCode alone does not prove pass"
            : "test content is not a passing TAP summary (# pass N and # fail 0, no not ok)",
      });
    }

    testBinding = {
      path: testOutput.path ? String(testOutput.path) : null,
      sha256: usableSha,
      exitCode: typeof exitCode === "number" ? exitCode : null,
      summary: testOutput.summary || summarizeTap(content),
      passed: boundEligible,
    };
    bindings.push({ kind: "test-output", ...testBinding });
  } else {
    gaps.push({ field: "testOutput", reason: "no test output supplied" });
  }

  const provenanceOnly =
    Boolean(provenance?.signer || provenance?.signature || provenance?.attestation) &&
    !sourceBinding &&
    !(testBinding && testBinding.passed);

  if (provenanceOnly) {
    gaps.push({
      field: "provenance",
      reason: "signer/provenance alone is not capability evidence",
    });
  }

  // Positive content binding is CONTENT-BOUND only. This library never attests execution.
  // Caller-supplied executionVerified / runner trust fields are ignored (never set true).
  let status = "content_bound";
  if (
    gaps.length ||
    !sourceBinding ||
    !testBinding ||
    testBinding.passed !== true
  ) {
    status = "untested_declaration";
  }

  const parsedTap = summarizeTap(
    testOutput?.content != null ? String(testOutput.content) : null,
  );
  claimed.parsedTestFacts =
    parsedTap && (parsedTap.pass != null || parsedTap.fail != null || parsedTap.tests != null)
      ? {
          tests: parsedTap.tests ?? null,
          pass: parsedTap.pass ?? null,
          fail: parsedTap.fail ?? null,
          source: "imported_content",
        }
      : null;
  observed.parsedTestFacts = claimed.parsedTestFacts;
  observed.contentBytesOnly = true;

  return {
    schema: "s138.evidence-binding.v1",
    capabilityId: "R2-CAPABILITIES-03",
    declaration: {
      capabilityId,
      claim: declaration.claim || null,
      revision: claimed.revision,
    },
    status,
    executionVerified: false,
    claimed,
    observed,
    verified,
    bindings,
    provenanceConsidered: Boolean(provenance),
    provenanceSufficientAlone: false,
    gaps,
    notes: [
      "content_bound means verified digests of supplied source/test bytes + passing TAP text shape; executionVerified is always false.",
      "Claimed sha256 must match content when both are supplied; mismatch is untested_declaration (not bound).",
      "Hashing imported output does not prove those tests ran against the claimed source revision.",
      "claimed/observed parsed TAP facts are imported text parses, not library observations of a live run.",
      "No caller-set executionVerified:true trust field is honored.",
      "signer labels alone never suffice.",
    ],
  };
}

function summarizeTap(content) {
  if (!content) return null;
  const pass = content.match(/# pass (\d+)/);
  const fail = content.match(/# fail (\d+)/);
  const tests = content.match(/# tests (\d+)/);
  if (pass || fail || tests) {
    return {
      tests: tests ? Number(tests[1]) : null,
      pass: pass ? Number(pass[1]) : null,
      fail: fail ? Number(fail[1]) : null,
    };
  }
  return { bytes: Buffer.byteLength(content) };
}
