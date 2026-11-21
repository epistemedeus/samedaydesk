import { readFileSync } from "node:fs";
import { SCHEMA_ENVELOPE, S282_OBSERVATION_DATE, TEST_NOW, WARNINGS } from "./constants.js";
import { unwrapCard, cardId } from "./card.js";
import { scoreEligibility } from "./eligibility.js";
import { scoreFunding } from "./funding.js";
import { labelledWinProbabilityGuess, scoreEffort } from "./effort.js";
import { displayOnlyMixedScore, workGateFromDimensions } from "./mixed-score.js";
import { assertHonestPacket } from "./honesty.js";
import { nowIso } from "./inspect.js";
import { bountyIntelligenceFixturesDir, capabilityPreflightRoot, externalJobIntakeRoot, outsideOperatorFirstJobRoot, } from "./paths.js";
export function scoreCard(cardInput, opts = {}) {
    const card = unwrapCard(cardInput);
    const generatedAt = nowIso(opts.now || TEST_NOW);
    const eligibility = scoreEligibility(card, opts);
    const funding = scoreFunding(card, opts);
    const effort = scoreEffort(card);
    const mixedScore = displayOnlyMixedScore(card);
    const packet = { eligibility, funding, effort, mixedScore };
    assertHonestPacket(card, packet);
    const gate = workGateFromDimensions(packet);
    const reasons = [...gate.reasons];
    if (card.source?.publicGetStatus === 200) {
        reasons.push("list_or_public_GET_200_is_not_claim_authority");
    }
    if (card.source?.claimRouteStatus === 401)
        reasons.push("claim_route_401");
    const observationDate = (card.observationDate || card.capturedAt || S282_OBSERVATION_DATE).slice(0, 10);
    return {
        schema: SCHEMA_ENVELOPE,
        observationDate,
        generatedAt,
        card: {
            id: cardId(card),
            title: card.listing?.title || "",
            fixtureKind: card.fixtureKind || null,
            sourceName: card.source?.name || card.source?.adapter || null,
        },
        packet,
        doNotStartWork: eligibility.doNotStartWork,
        warnings: [...WARNINGS],
        diagnostics: {
            mixedScoreIsDisplayOnly: true,
            fabricatedAuthorityRejected: String(card.claimAuthority || "").toLowerCase() === "agent" ||
                String(card.claimAuthority || "").toLowerCase() === "auth_claim",
            winProbabilityGuess: labelledWinProbabilityGuess(card),
            reasons,
            reused: {
                bountyIntelligenceFixtures: Boolean(bountyIntelligenceFixturesDir()),
                externalJobIntake: Boolean(externalJobIntakeRoot()),
                capabilityPreflight: Boolean(capabilityPreflightRoot()),
                outsideOperatorFirstJob: Boolean(outsideOperatorFirstJobRoot()),
            },
        },
    };
}
export function scoreCardFile(path, opts = {}) {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return scoreCard(parsed, opts);
}
