import { evaluateMerchant } from "./surfaces/merchant.mjs";
import { evaluateBuyer } from "./surfaces/buyer.mjs";
import { evaluateVerifier } from "./surfaces/verifier.mjs";
import { evaluatePack } from "./surfaces/pack.mjs";

const DISPATCH = {
  merchant: evaluateMerchant,
  buyer: evaluateBuyer,
  verifier: evaluateVerifier,
  pack: evaluatePack,
};

export async function evaluateCase(entry) {
  const surface = entry.surface;
  const dispatch = DISPATCH[surface];
  if (!dispatch) throw new Error(`unknown surface ${surface}`);
  return dispatch(entry.evaluate);
}
