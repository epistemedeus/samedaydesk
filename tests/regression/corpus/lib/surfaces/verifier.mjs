import { join } from "node:path";
import { validateFile } from "../../../../../tools/evidence-records/lib.mjs";
import { inspectPaymentAuthority } from "../../../../../tools/recurring-job-recipes/lib/payment-guard.mjs";
import { REPO_ROOT } from "../root.mjs";
import { accept, reject } from "../result.mjs";

const VALID_RECORD = join(REPO_ROOT, "tools/evidence-records/fixtures/valid/indexnow-receipt.json");
const ORGANIC_LABEL = join(
  REPO_ROOT,
  "tools/evidence-records/fixtures/invalid/organic-label-for-controlled-traffic.json",
);

export async function evaluateVerifier(id) {
  if (id === "verifier.valid-record") {
    const result = validateFile(VALID_RECORD);
    const codes = (result.errors || []).map((error) => error.code);
    if (!result.ok) {
      return reject(codes[0] || "invalid_record", "Published valid evidence fixture failed validation.", {
        product: { filePath: result.filePath, codes },
      });
    }
    return accept("valid_record", "Shipped valid evidence fixture still verifies.", {
      product: { filePath: result.filePath, codes },
    });
  }

  if (id === "verifier.organic-label") {
    const result = validateFile(ORGANIC_LABEL);
    const codes = (result.errors || []).map((error) => error.code);
    const hit = result.ok === false && codes.includes("organic_label_for_controlled_or_incentivized_traffic");
    if (!hit) {
      return accept("organic_label_admitted", "Operator-controlled traffic labeled organic was accepted.", {
        product: { ok: result.ok, codes },
      });
    }
    return reject(
      "organic_label_for_controlled_or_incentivized_traffic",
      "Controlled or incentivized traffic must not be labeled organic.",
      { product: { codes } },
    );
  }

  if (id === "verifier.payment-replay-blocked") {
    const result = inspectPaymentAuthority(
      { payment: { attempted: true, receiptId: "corpus-receipt", charged: true } },
      { replayPayment: true },
    );
    const blocked = result.ok === false && result.code === "payment_replay_blocked" && result.attempted === false;
    if (!blocked) {
      return accept("payment_replayed", "A prior receipt was treated as authority to replay payment.", {
        product: result,
      });
    }
    return reject("payment_replay_blocked", "Recipes never automatically replay a prior payment.", {
      product: { code: result.code, attempted: result.attempted, replayBlocked: result.replayBlocked },
    });
  }

  throw new Error(`unknown verifier evaluator ${id}`);
}
