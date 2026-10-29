import { observeBaseTransfer } from "../../../experiments/contributor-reuse-trial-100198/src/chain-observation.mjs";
import { addDecimal } from "../../earned-work/src/decimal.js";
import { assessSettlement, BASE_USDC_CONTRACT, decimalToUnits } from "../../../src/lib/reward-receiving/settlement.mjs";
import { digestText, identityValid, isRecord, nonnegative, sameIdentity, sha256, timestamp } from "./validation.js";
import { acceptedWorkValid } from "./work-source.js";
const hash = (value) => typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value);
const address = (value) => typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value);
const failure = (reason) => ({ qualified: false, reason });
function settlementBindingValid(value) {
    return identityValid(value) && isRecord(value) && hash(value.transactionHash) && hash(value.blockHash) &&
        nonnegative(value.blockNumber) && nonnegative(value.logIndex) && timestamp(value.timestamp) &&
        sha256(value.sourceSha256) && sha256(value.destinationSha256);
}
/** Uses the existing bounded, canonical-block/direct-USDC observer. No signing, uploads or payment writes. */
export function createBaseReceiptObserver(options) {
    return {
        source: "configured_base_rpc",
        observe: (transactionHash, reservationId) => observeBaseTransfer(transactionHash, { ...options, reservationId }),
    };
}
/** Exact work -> accepted obligation -> exclusive canonical receipt -> authorized counterparties. */
export function createQualifiedSettlementPort(deps) {
    return {
        async qualify(work) {
            if (!isRecord(work) || !isRecord(work.binding) || typeof work.binding.workId !== "string" ||
                !acceptedWorkValid(work, work.binding.workId))
                return failure("invalid_join");
            if (deps.observer.source !== "configured_base_rpc" && deps.observer.source !== "synthetic_fixture")
                return failure("invalid_receipt");
            if (deps.observer.source === "synthetic_fixture" && deps.allowSynthetic !== true)
                return failure("fixture_refused");
            try {
                const binding = await deps.registry.readForObligation(work.binding.obligationId);
                if (binding === null)
                    return failure("missing_settlement");
                if (!settlementBindingValid(binding) || !sameIdentity(binding, work.binding) ||
                    Date.parse(binding.timestamp) < Date.parse(work.aggregate.obligation.createdAt))
                    return failure("invalid_join");
                const reward = work.aggregate.obligation.reward;
                const amount = addDecimal(reward.amount, "0");
                // This adapter deliberately supports the existing native Base USDC observer only.
                if (reward.network !== "base" || reward.asset !== "USDC" || decimalToUnits(amount) === null ||
                    decimalToUnits(amount) <= 0n)
                    return failure("invalid_join");
                if (!sha256(work.binding.authorizedSourceSha256) || !sha256(work.binding.authorizedDestinationSha256) ||
                    binding.sourceSha256 !== work.binding.authorizedSourceSha256 || binding.destinationSha256 !== work.binding.authorizedDestinationSha256)
                    return failure("wrong_counterparty");
                const owners = await deps.registry.readReceiptBindings(binding.transactionHash, binding.logIndex);
                if (!Array.isArray(owners) || owners.length !== 1)
                    return failure("duplicate_receipt");
                const owner = owners[0];
                if (!settlementBindingValid(owner) || !sameIdentity(owner, binding) ||
                    ["transactionHash", "blockNumber", "blockHash", "logIndex", "timestamp", "sourceSha256", "destinationSha256"].some(k => owner[k] !== binding[k]))
                    return failure("duplicate_receipt");
                const response = await deps.observer.observe(binding.transactionHash, work.binding.reservationId);
                if (!isRecord(response) || response.ok !== true || !isRecord(response.observation))
                    return failure("invalid_receipt");
                const seen = response.observation;
                const receipt = seen.canonicalReceipt;
                if (seen.chainId !== "8453" || !address(seen.source) || !address(seen.destination) ||
                    seen.transactionFrom !== seen.source || !isRecord(receipt) ||
                    receipt.blockHash !== binding.blockHash || receipt.logIndex !== binding.logIndex ||
                    receipt.addressesIncluded !== false || receipt.transferCount !== 1 || receipt.status !== "success" ||
                    receipt.network !== "base" || receipt.asset !== "USDC" || receipt.tokenContract !== BASE_USDC_CONTRACT ||
                    receipt.transactionHash !== binding.transactionHash || receipt.blockNumber !== binding.blockNumber ||
                    receipt.timestamp !== binding.timestamp)
                    return failure("invalid_receipt");
                if (digestText(seen.source) !== binding.sourceSha256 || digestText(seen.destination) !== binding.destinationSha256)
                    return failure("wrong_counterparty");
                if (typeof seen.amountAtomic !== "string" || !/^\d{1,40}$/.test(seen.amountAtomic) ||
                    seen.amountAtomic !== receipt.amountBaseUnits || typeof receipt.amount !== "string" ||
                    decimalToUnits(receipt.amount) !== BigInt(seen.amountAtomic))
                    return failure("amount_mismatch");
                // Reassess against THIS obligation. The reused observer's trial-specific assessment is never authority here.
                const assessment = assessSettlement({
                    taskId: work.binding.taskId, slotId: work.binding.reservationId,
                    ...reward, amount, transactionHash: binding.transactionHash, blockNumber: binding.blockNumber, timestamp: binding.timestamp,
                }, receipt, { transactionHash: binding.transactionHash, taskId: work.binding.taskId, slotId: work.binding.reservationId });
                if (assessment.verified !== true)
                    return failure("amount_mismatch");
                return { qualified: true, source: deps.observer.source };
            }
            catch {
                return failure("unavailable");
            }
        },
    };
}
//# sourceMappingURL=settlement.js.map