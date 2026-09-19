import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { classifyCase } from "./classify.mjs";
import { fail, honestyFields } from "./failures.mjs";
import { naiveHttpSettle } from "./naive.mjs";
import { committedPaths, findRepoRoot } from "./paths.mjs";
import {
  CODES,
  MCP_REL,
  PACK_ID,
  REPORT_SCHEMA,
  VERIFIER,
} from "./rules.mjs";
import { analyzeMcpSource, derivedIsErrorCases } from "./source.mjs";

function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function refuseFlags(flags = {}) {
  if (flags.publish || flags.deploy || flags.writeSds) {
    return fail(CODES.PUBLISH_ATTEMPTED, "this verifier never publishes or deploys", {
      seeded: "publish_attempted",
    });
  }
  if (flags.checkout || flags.pay || flags.payment || flags.live) {
    return fail(CODES.CHECKOUT_TOUCHED, "this verifier does not call live MCP, payment, or checkout", {
      seeded: "checkout_touched",
    });
  }
  return null;
}

export async function verifyCommitted({
  repoRoot = findRepoRoot(),
  flags = {},
} = {}) {
  const refused = refuseFlags(flags);
  if (refused) return refused;

  if (!repoRoot) {
    return fail(CODES.COMMITTED_SURFACES_UNAVAILABLE, `${MCP_REL} was not found by walking parents`);
  }
  const paths = committedPaths(repoRoot);
  if (!existsSync(paths.mcp)) {
    return fail(CODES.COMMITTED_SURFACES_UNAVAILABLE, `missing ${MCP_REL}`, { path: paths.mcp });
  }

  const src = readFileSync(paths.mcp, "utf8");
  const analysis = analyzeMcpSource(src);
  const recorded = {
    path: MCP_REL,
    sha256: sha256Text(src),
    bytes: Buffer.byteLength(src),
    fixpackLink: analysis.fixpackLink,
    isErrorSiteCount: analysis.sites.length,
  };

  if (!analysis.okMsg) {
    return fail(
      CODES.OKMSG_MISSING,
      "server/routes/mcp.js must define okMsg as a JSON-RPC result envelope",
      { recorded, analysis: { okMsg: false } },
    );
  }
  if (!analysis.httpJson) {
    return fail(
      CODES.HTTP_JSON_MISSING,
      "MCP POST handler must return res.json(out) (HTTP 200 is not settlement)",
      { recorded },
    );
  }
  if (analysis.sites.length === 0) {
    return fail(
      CODES.ISERROR_SITES_MISSING,
      "committed MCP source has no isError: true sites to verify",
      { recorded, seeded: "silent_empty_success" },
    );
  }

  const notViaOkMsg = analysis.sites.filter((site) => !site.viaOkMsg);
  if (notViaOkMsg.length > 0) {
    return fail(
      CODES.ISERROR_NOT_VIA_OKMSG,
      "an isError: true site is not returned through okMsg (JSON-RPC result)",
      { recorded, sites: notViaOkMsg },
    );
  }

  const derived = derivedIsErrorCases(analysis);
  if (derived.length === 0) {
    return fail(
      CODES.ISERROR_SITES_MISSING,
      "could not derive isError cases from committed MCP snippets",
      { recorded, missingSnippets: analysis.missingSnippets },
    );
  }

  const classified = derived.map((item) => {
    const report = classifyCase(item.input);
    const naive = naiveHttpSettle(item.input.http.status, item.input.rpc);
    return {
      id: item.id,
      snippet: item.snippet,
      verdict: report.verdict,
      ok: report.ok,
      code: report.code,
      settleAllowed: report.classification?.settleAllowed ?? null,
      isError: report.classification?.isError ?? null,
      naiveSettled: naive.settled,
    };
  });

  const claimed = derived.map((item) => {
    const report = classifyCase({
      ...item.input,
      claim: { settled: true, basis: "http_200" },
    });
    return {
      id: item.id,
      snippet: item.snippet,
      verdict: report.verdict,
      ok: report.ok,
      code: report.code,
    };
  });

  const hold = classified.filter(
    (item) => !(item.ok === true && item.verdict === "pass" && item.settleAllowed === false && item.isError === true),
  );
  if (hold.length > 0) {
    return fail(
      CODES.ISERROR_NOT_VIA_OKMSG,
      "derived committed isError envelopes were not classified as not-settle",
      { recorded, hold },
    );
  }

  const notRejected = claimed.filter((item) => !(item.verdict === "reject" && item.ok === false));
  if (notRejected.length > 0) {
    return fail(
      CODES.DERIVED_SETTLE_CLAIM_NOT_REJECTED,
      "HTTP 200 + isError claimed as settled was not rejected against committed MCP text",
      { recorded, notRejected, seeded: "http_200_iserror_claimed_settle" },
    );
  }

  return {
    ok: true,
    verdict: "pass",
    pack: PACK_ID,
    verifier: VERIFIER,
    schema: REPORT_SCHEMA,
    mode: "committed",
    code: CODES.ISERROR_NOT_SETTLE,
    ...honestyFields(),
    recorded,
    isErrorSites: analysis.sites,
    snippets: analysis.snippets,
    derived: classified,
    seededClaimAgainstCommitted: {
      applied: { settled: true, basis: "http_200" },
      rejected: claimed.length,
      codes: [...new Set(claimed.map((item) => item.code))],
    },
    naiveWouldSettle: classified.every((item) => item.naiveSettled === true),
    checks: {
      okmsg_result_envelope: true,
      iserror_via_okmsg: true,
      http_json_is_not_settle: true,
      derived_iserror_not_settle: true,
      derived_http_200_claim_rejected: true,
    },
  };
}
