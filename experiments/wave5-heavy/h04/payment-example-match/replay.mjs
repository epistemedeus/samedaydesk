#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareCorpus, loadCorpus } from "./src/compare.mjs";
import {
  OBSERVED,
  PAID_EVIDENCE_REQUEST_DOMAIN,
  PRODUCTION_PIN,
  emptyGetBody,
  paidEvidenceRequestDigest,
} from "./src/digest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(here, "corpus.json");

function oneByteFlip(s) {
  const buf = Buffer.from(s, "utf8");
  buf[buf.length - 1] ^= 1;
  return buf.toString("utf8");
}

const corpus = loadCorpus(corpusPath);
const compared = compareCorpus(corpus);

const controlTarget = "/extract?url=control-known";
const controlDigest = paidEvidenceRequestDigest("GET", controlTarget, emptyGetBody());
const controlAgain = paidEvidenceRequestDigest("GET", controlTarget, emptyGetBody());
const flippedTarget = oneByteFlip(controlTarget);
const flippedDigest = paidEvidenceRequestDigest("GET", flippedTarget, emptyGetBody());
const flippedBody = paidEvidenceRequestDigest("GET", controlTarget, Buffer.from([1]));

const result = {
  ok: true,
  productionPin: PRODUCTION_PIN,
  domain: PAID_EVIDENCE_REQUEST_DOMAIN.replace("\0", "\\0"),
  observed: OBSERVED,
  controls: {
    positiveRepeat: controlDigest === controlAgain,
    controlDigest,
    oneByteTargetDiffers: flippedDigest !== controlDigest,
    oneByteBodyDiffers: flippedBody !== controlDigest,
  },
  corpus: compared,
  interpretation: {
    triple:
      compared.matches.triple.length > 0
        ? "exact-public-demo-bytes"
        : "unresolved",
    fourth:
      compared.matches.fourth.length > 0
        ? "exact-public-demo-bytes"
        : "unresolved",
    notProven: [
      "payer identity",
      "independence of purchases",
      "discovery path",
      "usefulness of the result",
    ],
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
