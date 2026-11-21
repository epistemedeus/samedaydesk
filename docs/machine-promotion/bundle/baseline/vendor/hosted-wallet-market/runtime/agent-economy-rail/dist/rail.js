import { decodeFunctionData, decodeEventLog, encodeFunctionData, keccak256 } from 'viem';
import { readFileSync } from 'node:fs';
import { checked, requireThat, digest, freezeQuote, COMMERCE_PAYMENTS_PIN } from '../../agent-economy-foundation/dist/index.js';
import { checkChainIdentity, prepareIntent, broadcast } from './local-chain.js';
import { bindVersionedContract, eip155ChainId, selectedReleaseAbiDigest } from './network-profile.js';
import { capturePlan } from './fees.js';
/** Claim TTL the market writes into kernel terms. Authorization must outlast this review. */
export const REVIEW_WINDOW_SECONDS = 3600;
/** Capture submitted at the end of review still has to land before authorization expiry. */
export const CAPTURE_MARGIN_SECONDS = 300;
const stored = (p) => ({ ...p, operator: p.operator.toLowerCase(), payer: p.payer.toLowerCase(), receiver: p.receiver.toLowerCase(), token: p.token.toLowerCase(), feeReceiver: p.feeReceiver.toLowerCase(), maxAmount: p.maxAmount.toString(), salt: p.salt.toString() });
const payment = (p) => ({ ...p, maxAmount: BigInt(p.maxAmount), salt: BigInt(p.salt) });
const common = (r) => ({ schemaVersion: 'pilot.agent-economy.v2', provenance: 'local_chain', requestDigest: digest(r) });
const unknown = (r) => ({ ...common(r), state: 'unknown' });
const abiIndex = (abi) => Object.fromEntries(abi.map(e => [`${e.type}:${e.name}`, e]));
const pinnedAbi = JSON.parse(readFileSync(new URL('../../agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json', import.meta.url), 'utf8'));
/** Actual-contract adapter. B supplies authenticated review authorization; A writes only proof/operation receipts. */
export class CommercePaymentsRail {
    store;
    client;
    operator;
    authorityId;
    contracts;
    approve;
    confirmationDepth;
    assets;
    protocol = COMMERCE_PAYMENTS_PIN;
    constructor(store, client, operator, authorityId, contracts, approve, confirmationDepth = 1n, assets) {
        this.store = store;
        this.client = client;
        this.operator = operator;
        this.authorityId = authorityId;
        this.contracts = contracts;
        this.approve = approve;
        this.confirmationDepth = confirmationDepth;
        this.assets = assets;
        requireThat(assets, 'asset_registry_required');
        requireThat(typeof contracts.chain === 'string' && /^eip155:[1-9][0-9]*$/.test(contracts.chain), 'chain_identity_unknown');
        assets.registration({ chain: contracts.chain, token: contracts.token, decimals: 6, symbol: 'USDC' });
        if (client.chain?.id !== undefined)
            requireThat(`eip155:${client.chain.id}` === contracts.chain, 'chain_identity_mismatch');
        requireThat(confirmationDepth > 0n, 'confirmation_depth');
        const abiDigest = digest(abiIndex(contracts.abi));
        if (contracts.contractVersion || contracts.abiDigest)
            requireThat(!!contracts.contractVersion && contracts.abiDigest === abiDigest, 'rail_abi_pin');
        else
            requireThat(abiDigest === digest(abiIndex(pinnedAbi)) && abiDigest === selectedReleaseAbiDigest(), 'rail_abi_pin');
        // Refuses the selected 1.1.0 digest when the address is the deployed public escrow.
        bindVersionedContract({ versionId: contracts.contractVersion ?? 'sandbox-selected-v1.1.0', abiDigest, address: contracts.escrow });
        this.contracts = { ...structuredClone({ ...contracts, network: undefined }), network: contracts.network };
    }
    get qualification() { return this.contracts.network?.networkClass === 'public' ? 'production' : 'local_chain'; }
    common(r) { return { ...common(r), provenance: this.qualification }; }
    identity() { return { ...this.contracts.network, configuredChain: this.contracts.chain, asset: { chain: this.contracts.chain, token: this.contracts.token, decimals: 6, symbol: 'USDC' }, assets: this.assets }; }
    intentIdentity() { return { ...this.identity(), codeHashes: this.contracts.codeHashes }; }
    async configured() {
        await checkChainIdentity(this.client, this.identity(), false);
        const candidate = this.contracts.network?.candidate;
        if (candidate) {
            const slot = await this.client.getStorageAt({ address: candidate.token, slot: candidate.implementationSlot });
            requireThat(slot?.toLowerCase() === '0x' + '0'.repeat(24) + candidate.implementation.slice(2), 'asset_implementation_changed');
        }
        for (const address of new Set([this.contracts.escrow, this.contracts.collector, this.contracts.refundCollector, this.contracts.token, ...Object.keys(this.contracts.codeHashes)])) {
            const code = await this.client.getCode({ address });
            requireThat(code && code.length > 2, 'contract_code_absent');
            requireThat(keccak256(code) === this.contracts.codeHashes[address], 'contract_runtime_pin');
        }
    }
    /** Receiver, fixed fee recipient and quote are committed before any funding transport. */
    async bindQuote(input, p) {
        const q = freezeQuote(checked('QuoteV2', input), this.assets);
        await checkChainIdentity(this.client, { ...this.identity(), asset: q.asset });
        await this.configured();
        requireThat(q.asset.chain === this.contracts.chain && q.asset.token === this.contracts.token && q.asset.decimals === 6 && q.asset.symbol === 'USDC', 'rail_asset_binding');
        requireThat(q.fee.profile.id === 'commerce-payments-v1.1.0-single-capture' && digest(q.fee.profile.escrow) === digest(this.protocol), 'rail_profile');
        requireThat(q.fundingAuthorityId === this.authorityId && q.fundingTarget === this.contracts.escrow && q.payoutDestination === p.receiver && q.feeRecipient === p.feeReceiver && p.feeReceiver !== '0x0000000000000000000000000000000000000000' && p.operator === this.operator.address && p.token === this.contracts.token && p.maxAmount === BigInt(q.gross) && p.minFeeBps === 500 && p.maxFeeBps === 500, 'payment_quote_binding');
        const quoteExpiry = Math.floor(Date.parse(q.expiresAt) / 1000);
        requireThat(p.preApprovalExpiry <= p.authorizationExpiry && p.authorizationExpiry <= p.refundExpiry && quoteExpiry <= p.preApprovalExpiry, 'expiry_binding');
        requireThat(p.authorizationExpiry > quoteExpiry + REVIEW_WINDOW_SECONDS + CAPTURE_MARGIN_SECONDS, 'review_capture_window');
        const plan = capturePlan([q.gross]);
        requireThat(q.platformFee === plan.feeAmount && q.contributorNet === plan.net && q.rail.costCap === '0' && q.subsidy === '0', 'quote_totals_or_unsupported_cost');
        const hash = await this.client.readContract({ address: this.contracts.escrow, abi: this.contracts.abi, functionName: 'getHash', args: [p] });
        const proofId = `local-escrow:${digest({ chain: this.contracts.chain, token: this.contracts.token.toLowerCase(), escrow: this.contracts.escrow.toLowerCase(), hash })}`;
        await this.store.transaction(() => {
            const legacy = this.store.all('funding').find(b => b.hash === hash && b.quote.asset.chain === q.asset.chain && b.quote.asset.token.toLowerCase() === q.asset.token.toLowerCase() && b.quote.fundingTarget.toLowerCase() === q.fundingTarget.toLowerCase() && b.proofId.startsWith('eip155:31337:'));
            requireThat(!legacy, 'legacy_proof_requires_explicit_migration');
            const prior = this.store.get('funding', proofId);
            requireThat(!prior || digest(prior.quote) === digest(q), 'proof_already_allocated');
            this.store.fence('funding-allocation', JSON.stringify([q.tenantId, q.canonicalTaskId]), { proofId, quoteDigest: digest(q) }, 'allocation_already_funded');
            if (!prior)
                this.store.put('funding', proofId, { proofId, quote: q, payment: stored(p), hash, stage: 'signature', authorizationTx: null, seen: [], quarantined: false });
        });
        return proofId;
    }
    async authorizationTypedData(proofId) {
        const b = this.binding(proofId), p = payment(b.payment);
        const nonce = await this.client.readContract({ address: this.contracts.escrow, abi: this.contracts.abi, functionName: 'getHash', args: [{ ...p, payer: '0x0000000000000000000000000000000000000000' }] });
        return { domain: { name: 'USD Coin', version: '2', chainId: eip155ChainId(this.contracts.chain), verifyingContract: this.contracts.token }, primaryType: 'ReceiveWithAuthorization', types: { ReceiveWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] }, message: { from: p.payer, to: this.contracts.collector, value: p.maxAmount, validAfter: 0n, validBefore: BigInt(p.preApprovalExpiry), nonce } };
    }
    binding(proofId) { const b = this.store.get('funding', proofId); requireThat(b, 'funding_absent'); return b; }
    /** Read-only replay of the original overlength identity. Never alias, reprice, submit or manufacture a new F1 receipt. */
    async observeLegacyFunding(actor, proofId) {
        checked('AuthenticatedActor', actor);
        const b = this.binding(proofId), q = freezeQuote(b.quote, this.assets);
        requireThat(actor.tenantId === q.tenantId && [q.requesterId, q.evaluatorId].includes(actor.actorId), 'forbidden');
        requireThat(proofId === `eip155:31337:${this.contracts.token.toLowerCase()}:${this.contracts.escrow.toLowerCase()}:${b.hash}`, 'legacy_proof_identity');
        return this.store.transaction(async () => {
            const e = await this.evidence(b), base = { originalProofId: proofId, quoteDigest: digest(q), requiresExplicitMigration: true };
            if (!e)
                return { ...base, state: 'unknown', txRef: null };
            const auth = e.events.find(x => x.eventName === 'PaymentAuthorized');
            if (!auth || auth.transactionHash !== b.authorizationTx || auth.args.amount !== BigInt(q.gross) || digest(stored(auth.args.paymentInfo)) !== digest(b.payment))
                return { ...base, state: 'unknown', txRef: null };
            const terminal = e.events.find(x => ['PaymentCaptured', 'PaymentVoided', 'PaymentReclaimed', 'PaymentRefunded'].includes(x.eventName));
            if (terminal)
                return { ...base, state: terminal.eventName === 'PaymentCaptured' ? 'incident' : 'closed', txRef: `${terminal.transactionHash}:${terminal.logIndex}` };
            return { ...base, state: e.state[1] === BigInt(q.gross) ? 'escrowed' : 'unknown', txRef: `${auth.transactionHash}:${auth.logIndex}` };
        });
    }
    request(rInput) {
        const r = checked('CaptureRequest', rInput), b = this.binding(r.fundingProofId), q = b.quote;
        requireThat(r.tenantId === q.tenantId && r.actorId === q.evaluatorId && r.authorityId === q.settlementAuthorityId && r.quoteId === q.quoteId && r.quoteDigest === digest(q) && r.allocationId === q.canonicalTaskId && digest(r.asset) === digest(q.asset) && r.amount === q.gross && r.feeAmount === q.platformFee && r.feeRecipient === q.feeRecipient && r.payoutDestination === q.payoutDestination && r.escrowTarget === q.fundingTarget, 'capture_request_binding');
        return b;
    }
    /** Signature alone keeps admission closed. Submission has its own durable state and hash. */
    async authorize(proofId, signature, operationId) {
        const b = this.binding(proofId);
        await checkChainIdentity(this.client, { ...this.identity(), asset: b.quote.asset });
        await this.configured();
        if (!b.authorizationTx)
            requireThat(Number((await this.client.getBlock()).timestamp) < Date.parse(b.quote.expiresAt) / 1000, 'quote_expired');
        let intent;
        await this.store.transaction(async () => {
            this.store.fence('funding-op', proofId, { operationId }, 'funding_operation_conflict');
            const current = this.binding(proofId);
            requireThat(!current.quarantined, 'funding_quarantined');
            if (current.authorizationTx) {
                // Recover the original signed operation. A second wallet signature
                // (including a randomized hardware signature) cannot replace its data.
                intent = this.store.get('tx', `fund:${proofId}`);
                requireThat(intent && intent.txId === current.authorizationTx, 'funding_tx_conflict');
            }
            else {
                const data = encodeFunctionData({ abi: this.contracts.abi, functionName: 'authorize', args: [payment(current.payment), BigInt(current.quote.gross), this.contracts.collector, signature] });
                intent = await prepareIntent(this.store, `fund:${proofId}`, digest({ proofId, data }), this.client, this.operator, this.contracts.escrow, data, this.intentIdentity());
            }
            current.authorizationTx = intent.txId;
            current.stage = 'submitted';
            this.store.put('funding', proofId, current);
        });
        await broadcast(this.client, intent, this.intentIdentity());
        return this.readProof(proofId);
    }
    /** Wallet, BYOW, and review authority do not call this. Any holder of the rail can, so the first tx is checked. authorize() journals its own intent and does not come through here. */
    async authorizeTxMatches(b, txId) {
        let tx = null;
        try {
            tx = await this.client.getTransaction({ hash: txId });
        }
        catch {
            requireThat(false, 'funding_tx_unverified');
        }
        requireThat(tx?.to && tx.to.toLowerCase() === this.contracts.escrow.toLowerCase() && tx.input && tx.input !== '0x', 'funding_tx_unverified');
        let decoded;
        try {
            decoded = decodeFunctionData({ abi: this.contracts.abi, data: tx.input });
        }
        catch {
            requireThat(false, 'funding_tx_unverified');
        }
        requireThat(decoded.functionName === 'authorize' && decoded.args && decoded.args.length >= 3, 'funding_tx_unverified');
        const [info, amount, collector] = decoded.args;
        const hash = await this.client.readContract({ address: this.contracts.escrow, abi: this.contracts.abi, functionName: 'getHash', args: [info] });
        requireThat(hash === b.hash && amount === BigInt(b.quote.gross) && String(collector).toLowerCase() === this.contracts.collector.toLowerCase(), 'funding_tx_unverified');
    }
    /** Tracks an externally submitted authorize transaction without promoting it to usable funding. A different second tx stays refused. */
    async submitted(proofId, txId) {
        await this.store.transaction(async () => {
            const b = this.binding(proofId);
            requireThat(!b.authorizationTx || b.authorizationTx === txId, 'funding_tx_conflict');
            if (b.authorizationTx === txId)
                return;
            await this.authorizeTxMatches(b, txId);
            const current = this.binding(proofId);
            requireThat(!current.authorizationTx, 'funding_tx_conflict');
            current.authorizationTx = txId;
            current.stage = 'submitted';
            this.store.put('funding', proofId, current);
        });
    }
    async stage(proofId) { await this.readProof(proofId); return this.binding(proofId).stage; }
    /** Unix second when this proof's escrow authorization ends. Claim compares it with observed chain time. */
    async authorizationDeadline(proofId) {
        const expiry = this.binding(proofId).payment.authorizationExpiry;
        requireThat(Number.isSafeInteger(expiry) && expiry > 0, 'funding_not_final');
        return expiry;
    }
    async authorizationTimestamp(proofId) {
        const b = this.binding(proofId), proof = await this.readProof(proofId);
        if (proof?.state !== 'confirmed' || !b.authorizationTx)
            return null;
        const receipt = await this.client.getTransactionReceipt({ hash: b.authorizationTx });
        const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
        requireThat(receipt.blockHash === block.hash && receipt.status === 'success', 'funding_tx_unverified');
        return Number(block.timestamp);
    }
    async observedTimestamp() {
        await checkChainIdentity(this.client, this.identity(), false);
        return Number((await this.client.getBlock()).timestamp);
    }
    async evidence(b) {
        try {
            await this.configured();
            if (b.quarantined)
                return null;
            // Revalidate every earlier observation, including confirmed ones, on every read/restart.
            for (const seen of b.seen) {
                const block = await this.client.getBlock({ blockNumber: BigInt(seen.height) });
                if (block.hash !== seen.block) {
                    b.quarantined = true;
                    b.stage = 'quarantined';
                    this.store.put('funding', b.proofId, b);
                    return null;
                }
            }
            // A retained result must not depend on querying an ever-growing RPC log
            // range. Re-read the original operations and every previously seen effect.
            const hashes = new Set(b.seen.map(seen => seen.tx));
            if (b.authorizationTx)
                hashes.add(b.authorizationTx);
            for (const prefix of ['capture', 'refund', 'void']) {
                const intent = this.store.get('tx', `${prefix}:${b.proofId}`);
                if (intent)
                    hashes.add(intent.txId);
            }
            const events = [];
            for (const hash of hashes) {
                let receipt;
                try {
                    receipt = await this.client.getTransactionReceipt({ hash });
                }
                catch (error) {
                    if (error?.name === 'TransactionReceiptNotFoundError' && !b.seen.some(seen => seen.tx === hash))
                        continue;
                    throw error;
                }
                for (const log of receipt.logs) {
                    if (log.address.toLowerCase() !== this.contracts.escrow.toLowerCase())
                        continue;
                    try {
                        const decoded = decodeEventLog({ abi: this.contracts.abi, data: log.data, topics: log.topics });
                        events.push({ ...log, eventName: decoded.eventName, args: decoded.args });
                    }
                    catch { /* Other escrow events do not prove this payment. */ }
                }
            }
            const state = await this.client.readContract({ address: this.contracts.escrow, abi: this.contracts.abi, functionName: 'paymentState', args: [b.hash] });
            const latest = await this.client.getBlockNumber({ cacheTime: 0 });
            const own = events.filter(e => e.args.paymentInfoHash === b.hash), sum = (name) => own.filter(e => e.eventName === name).reduce((n, e) => n + e.args.amount, 0n);
            const captured = sum('PaymentCaptured'), refunded = sum('PaymentRefunded'), closed = own.some(e => ['PaymentVoided', 'PaymentReclaimed'].includes(e.eventName));
            const explained = state[0] && (closed ? state[1] === 0n : captured === BigInt(b.quote.gross) ? state[1] === 0n && state[2] === captured - refunded : captured === 0n && state[1] === BigInt(b.quote.gross));
            if (!explained) {
                const fromBlock = latest > 999n ? latest - 999n : 0n;
                events.push(...await this.client.getContractEvents({ address: this.contracts.escrow, abi: this.contracts.abi, fromBlock, toBlock: latest }));
            }
            const unique = new Map(events.filter(e => e.args.paymentInfoHash === b.hash).map(e => [`${e.transactionHash}:${e.logIndex}`, e]));
            const selected = [...unique.values()].sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
            const head = this.qualification === 'production' ? (await this.client.getBlock({ blockTag: 'finalized' })).number : latest;
            for (const e of selected) {
                const receipt = await this.client.getTransactionReceipt({ hash: e.transactionHash });
                const block = await this.client.getBlock({ blockNumber: e.blockNumber });
                if (receipt.status !== 'success' || receipt.blockHash !== e.blockHash || block.hash !== e.blockHash)
                    return null;
                if (!b.seen.some(s => s.tx === e.transactionHash))
                    b.seen.push({ tx: e.transactionHash, block: e.blockHash, height: e.blockNumber.toString() });
            }
            this.store.put('funding', b.proofId, b);
            return { events: selected, state, head };
        }
        catch (error) {
            // A disappeared observed block/tx is sticky quarantine, not permission to fund or pay again.
            if (b.seen.length && error instanceof Error && ['BlockNotFoundError', 'TransactionReceiptNotFoundError'].includes(error.name)) {
                b.quarantined = true;
                b.stage = 'quarantined';
                this.store.put('funding', b.proofId, b);
            }
            return null;
        }
    }
    async readProof(proofId) {
        if (!this.store.get('funding', proofId))
            return null;
        return this.store.transaction(async () => {
            const b = this.binding(proofId), q = b.quote, e = await this.evidence(b);
            let state = 'pending', finalityRef = null;
            if (!e) {
                state = 'unknown';
                b.stage = 'quarantined';
            }
            else {
                const authorization = e.events.find(x => x.eventName === 'PaymentAuthorized');
                const [collected, capturable] = e.state;
                const terminal = e.events.some(x => ['PaymentVoided', 'PaymentReclaimed', 'PaymentCaptured', 'PaymentRefunded'].includes(x.eventName));
                if (authorization && b.authorizationTx === authorization.transactionHash && authorization.args.amount === BigInt(q.gross) && digest(stored(authorization.args.paymentInfo)) === digest(b.payment) && authorization.args.tokenCollector.toLowerCase() === this.contracts.collector.toLowerCase() && collected && capturable === BigInt(q.gross)) {
                    if (e.head - authorization.blockNumber + 1n >= this.confirmationDepth && Number((await this.client.getBlock()).timestamp) < b.payment.authorizationExpiry) {
                        state = 'confirmed';
                        b.stage = 'confirmed_usable';
                        finalityRef = `${this.qualification === 'production' ? 'public:' + this.contracts.chain : 'local'}:${authorization.blockHash}:${authorization.transactionHash}:${authorization.logIndex}`;
                    }
                    else {
                        state = 'pending';
                        b.stage = 'submitted';
                    }
                }
                else if (terminal) {
                    state = 'failed';
                    b.stage = 'closed';
                }
                else if (collected) {
                    state = 'unknown';
                    b.stage = 'quarantined';
                }
            }
            this.store.put('funding', proofId, b);
            return checked('FundingProofV2', { schemaVersion: 'pilot.agent-economy.v2', proofId, tenantId: q.tenantId, allocationId: q.canonicalTaskId, quoteId: q.quoteId, taskId: q.taskId, requesterId: q.requesterId, fundingAuthorityId: q.fundingAuthorityId, asset: q.asset, recipient: q.fundingTarget, amount: q.gross, state, finalityRef, backing: 'escrowed', quoteDigest: digest(q) });
        });
    }
    async readback(rInput) {
        const r = checked('CaptureRequest', rInput);
        this.request(r);
        return this.store.transaction(async () => {
            const b = this.request(r), e = await this.evidence(b);
            if (!e)
                return unknown(r);
            const [collected, capturable, refundable] = e.state;
            if (!collected)
                return unknown(r);
            const auth = e.events.find(x => x.eventName === 'PaymentAuthorized');
            if (!auth || auth.transactionHash !== b.authorizationTx || auth.args.amount !== BigInt(r.amount) || digest(stored(auth.args.paymentInfo)) !== digest(b.payment) || auth.args.tokenCollector.toLowerCase() !== this.contracts.collector.toLowerCase())
                return unknown(r);
            const captures = e.events.filter(x => x.eventName === 'PaymentCaptured'), refunds = e.events.filter(x => x.eventName === 'PaymentRefunded');
            const reclaimed = e.events.find(x => ['PaymentVoided', 'PaymentReclaimed'].includes(x.eventName));
            const sum = (events, field) => events.reduce((n, x) => n + x.args[field], 0n);
            if (refunds.length) {
                // Partial refunds/mixed lifecycles are outside F1's whole-capture outcome; quarantine the join.
                if (sum(refunds, 'amount') !== BigInt(r.amount) || refundable !== 0n)
                    return unknown(r);
                const last = refunds.at(-1);
                return checked('CaptureOutcome', { ...this.common(r), state: 'refunded', txRef: `${last.transactionHash}:${last.logIndex}` });
            }
            if (captures.length) {
                // Unjournaled operator capture is an incident, not authorized application acceptance.
                const op = this.store.get('capture-op', b.proofId);
                const intent = this.store.get('tx', `capture:${b.proofId}`);
                if (!op || !intent || captures.some(x => x.transactionHash !== intent.txId))
                    this.store.put('incident', b.proofId, { reason: 'capture_without_authorized_intent', proofId: b.proofId, quoteDigest: digest(b.quote), txRefs: captures.map(x => `${x.transactionHash}:${x.logIndex}`) });
                else if (captures.length !== 1 || reclaimed || sum(captures, 'amount') !== BigInt(r.amount))
                    this.store.put('incident', b.proofId, { reason: 'unsupported_partial_or_mixed_capture', proofId: b.proofId, quoteDigest: digest(b.quote), txRefs: captures.map(x => `${x.transactionHash}:${x.logIndex}`) });
                if (!op || !intent || captures.length !== 1 || captures[0].transactionHash !== intent.txId || digest(op.request) !== digest(r) || reclaimed || sum(captures, 'amount') !== BigInt(r.amount) || sum(captures, 'feeAmount') !== BigInt(r.feeAmount) || captures.some(x => x.args.feeReceiver.toLowerCase() !== r.feeRecipient.toLowerCase()) || capturable !== 0n || refundable !== BigInt(r.amount))
                    return unknown(r);
                const last = captures.at(-1), final = e.head - last.blockNumber + 1n >= this.confirmationDepth;
                return checked('CaptureOutcome', { ...this.common(r), state: 'captured', amount: r.amount, feeAmount: r.feeAmount, feeRecipient: r.feeRecipient, txRef: `${last.transactionHash}:${last.logIndex}`, finality: final ? 'final' : 'pending', finalityRef: final ? `${this.qualification === 'production' ? 'public:' + this.contracts.chain : 'local'}:${last.blockHash}:${last.blockNumber}` : null });
            }
            if (reclaimed && capturable === 0n)
                return checked('CaptureOutcome', { ...this.common(r), state: 'expired_reclaimed', txRef: `${reclaimed.transactionHash}:${reclaimed.logIndex}` });
            const timestamp = Number((await this.client.getBlock()).timestamp);
            if (capturable !== BigInt(r.amount) || timestamp >= b.payment.authorizationExpiry || e.head - auth.blockNumber + 1n < this.confirmationDepth)
                return unknown(r);
            return checked('CaptureOutcome', { ...this.common(r), state: 'authorized', backing: 'escrowed', authorizationRef: b.proofId, expiresAt: new Date(b.payment.authorizationExpiry * 1000).toISOString() });
        });
    }
    async captureOutcome(request) { return this.readback(request); }
    readIncident(proofId) { return this.store.get('incident', proofId); }
    async capture(rInput) {
        const r = checked('CaptureRequest', rInput);
        this.request(r);
        await checkChainIdentity(this.client, { ...this.identity(), asset: r.asset });
        await this.approve(r);
        let intent;
        await this.store.transaction(() => this.store.fence('capture-op', r.fundingProofId, { request: r }, 'capture_operation_conflict'));
        const before = await this.readback(r);
        if (before.state !== 'authorized')
            return before;
        await this.store.transaction(async () => {
            const b = this.request(r), data = encodeFunctionData({ abi: this.contracts.abi, functionName: 'capture', args: [payment(b.payment), BigInt(r.amount), BigInt(r.feeAmount), r.feeRecipient] });
            intent = await prepareIntent(this.store, `capture:${b.proofId}`, digest(r), this.client, this.operator, this.contracts.escrow, data, this.intentIdentity());
        });
        // Authenticated application approval is checked again at the broadcast boundary.
        await this.approve(r);
        await broadcast(this.client, intent, this.intentIdentity());
        return this.readback(r);
    }
    /** Refund uses operator-owned liquidity and independent authority. It never writes or erases old debt. */
    async refund(rInput, operationId, authorizeRefund) {
        const r = checked('CaptureRequest', rInput);
        this.request(r);
        await checkChainIdentity(this.client, { ...this.identity(), asset: r.asset });
        await authorizeRefund();
        let intent;
        await this.store.transaction(() => this.store.fence('refund-op', r.fundingProofId, { operationId, requestDigest: digest(r) }, 'refund_operation_conflict'));
        const before = await this.readback(r);
        if (before.state === 'refunded' || before.state === 'unknown')
            return before;
        requireThat(before.state === 'captured', 'refund_requires_capture');
        await this.store.transaction(async () => {
            const b = this.request(r), data = encodeFunctionData({ abi: this.contracts.abi, functionName: 'refund', args: [payment(b.payment), BigInt(r.amount), this.contracts.refundCollector, '0x'] });
            intent = await prepareIntent(this.store, `refund:${b.proofId}`, digest({ r, operationId }), this.client, this.operator, this.contracts.escrow, data, this.intentIdentity());
        });
        await authorizeRefund();
        await broadcast(this.client, intent, this.intentIdentity());
        return this.readback(r);
    }
}
