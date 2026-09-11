import { diagnosePaymentPayload, assertHonestDiagnostics } from "./diagnose.mjs";
import { loadFixture } from "./load-fixture.mjs";
import { omitHint, authorityFingerprint, signedPayloadUnchanged } from "./authority.mjs";
import { planOmittedHintFill } from "./plan-fill.mjs";
import { loadH4Fixtures } from "./h4.mjs";
import { MERCHANT_PIN, PR54_RULES } from "./rules.mjs";

export function runJourney({ fixturePath }) {
  const loaded = loadFixture(fixturePath);
  const intact = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
    siblingPaymentRequirements: loaded.json.paymentRequirements,
  });

  const missingBazaarPayload = omitHint(loaded.paymentPayload, "extensions.bazaar");
  const beforeAuthority = authorityFingerprint(missingBazaarPayload);
  const missing = diagnosePaymentPayload(missingBazaarPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
  });
  const bazaarDiag = missing.diagnostics.find((row) => row.field === "extensions.bazaar");
  const afterAuthority = authorityFingerprint(missingBazaarPayload);
  const fill = planOmittedHintFill(missingBazaarPayload, loaded.declared);

  const dishonest = {
    field: "extensions.bazaar",
    present: false,
    signed: true,
    drift: "missing_hint",
  };
  const rejectedHintAuthority = assertHonestDiagnostics([dishonest]);

  const h4 = loadH4Fixtures();

  const ok =
    bazaarDiag?.drift === "missing_hint" &&
    bazaarDiag?.signed === false &&
    missing.declinedPayment === false &&
    beforeAuthority === afterAuthority &&
    fill.provenance.untouchedAuthority === true &&
    signedPayloadUnchanged(missingBazaarPayload, fill.clone) &&
    rejectedHintAuthority.rejected === true &&
    intact.signedAuthority === "payload";

  return {
    ok,
    command: "journey",
    merchantPin: MERCHANT_PIN,
    rules: PR54_RULES,
    h4Imported: h4.present,
    h4Source: h4.present ? h4.sources : null,
    fixture: loaded.basename,
    steps: [
      {
        id: "intact_payload",
        diagnostics: intact.diagnostics,
        signedAuthority: intact.signedAuthority,
      },
      {
        id: "missing_bazaar_hint",
        diagnostic: bazaarDiag,
        declinedPayment: missing.declinedPayment,
        paymentRetried: missing.paymentRetried,
      },
      {
        id: "signature_authority_unchanged",
        before: beforeAuthority,
        after: afterAuthority,
        unchanged: beforeAuthority === afterAuthority,
        fillUntouchedAuthority: fill.provenance.untouchedAuthority,
        fillDeclinedPayment: fill.declinedPayment,
        mutatedOriginal: fill.mutatedOriginal,
      },
      {
        id: "unsigned_hint_as_authority_rejected",
        rejected: rejectedHintAuthority.rejected,
        failure: rejectedHintAuthority.ok ? null : rejectedHintAuthority.failure,
      },
    ],
  };
}
