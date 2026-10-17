// Supplies the existing installed journey's canonical-receiving port. The
// journey keeps its original accepted-work and settlement validator. This port
// consumes the durable projection and rechecks its original registry authority.
import {createHash} from 'node:crypto';
import {digest} from './canonical.mjs';
import {readAuthoritativeDischarge} from './discharge-authority.mjs';
import {consumerContractSha256, installedSourceSha256} from './native-debt.mjs';
import {readRailTransfer} from './chain.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const decimal = amount => `${BigInt(amount)/1000000n}.${(BigInt(amount)%1000000n).toString().padStart(6,'0')}`;
export function createCanonicalReceiving({consumer, withReadClient, registryRoot, rpcUrl}) {
  const pin = Object.freeze({family: 'opportunity', sourceId: 'root191-native-debt',
    sourceRevision: consumerContractSha256(), sourceSha256: installedSourceSha256()});
  async function records(where, params) {
    return withReadClient(async tx => {
      await consumer.assertBinding(tx);
      const rows = (await tx.query(`SELECT d.*, o.round_id, c.contributor_token_id, w.work_id, w.account_id, j.requester_account_id
        FROM hosted_wallet_market.native_debt_dispositions d
        JOIN opportunity_obligations o ON o.id=d.obligation_id
        JOIN opportunity_claims c ON c.id=o.claim_id
        JOIN journey_work_links w ON w.reservation_id=c.id
        JOIN journey_task_links j ON j.task_id=w.task_id
        WHERE d.obligation_family='opportunity' AND ${where}`, params)).rows;
      return rows.map(d => {
        const body = {importContractSha256: d.import_contract_sha256, tenant: d.tenant, obligationId: d.obligation_id,
          reservationId: d.reservation_id, taskId: d.task_id, termsVersion: d.terms_version, network: d.network, token: d.token,
          transactionHash: d.transaction_hash, logIndex: d.log_index, blockNumber: d.block_number, amountAtomic: d.amount_atomic,
          receiptId: d.receipt_id, receivedAt: new Date(d.received_at).toISOString()};
        const {receipt} = readAuthoritativeDischarge(registryRoot, body);
        if (digest(receipt) !== d.authority_receipt_sha256) throw new Error('disposition_hold');
        const work = {workId: d.work_id, taskId: d.task_id, reservationId: d.claim_id, submissionId: d.submission_id,
          obligationId: d.obligation_id, verdictId: d.verdict_id, termsVersion: d.terms_version,
          artifactDigestSha256: d.artifact_digest_sha256, roundId: d.round_id, accountId: d.account_id,
          requesterAccountId: d.requester_account_id, contributorPrincipalId: d.contributor_token_id};
        const settlement = {...work, transactionHash: d.transaction_hash, blockNumber: Number(d.block_number), blockHash: d.block_hash,
          logIndex: d.log_index, timestamp: new Date(d.block_timestamp).toISOString(), sourceSha256: sha(d.observed_source), destinationSha256: sha(d.recipient)};
        return {source: pin, state: 'accepted', work, authorizedSourceSha256: settlement.sourceSha256,
          authorizedDestinationSha256: settlement.destinationSha256, evidenceClass: 'unclassified', actorRelation: 'unknown', settlement};
      });
    });
  }
  return Object.freeze({pin,
    observer: {source: 'configured_base_rpc', async observe(transactionHash) {
      const row = (await withReadClient(tx => tx.query('SELECT * FROM hosted_wallet_market.native_debt_dispositions WHERE transaction_hash=$1', [transactionHash]))).rows;
      if (row.length !== 1) return {ok: false};
      const d = row[0];
      const seen = await readRailTransfer(rpcUrl, {transactionHash, blockNumber: d.block_number, logIndex: d.log_index});
      return {ok: true, observation: {chainId: '8453', source: seen.source, destination: seen.recipient, transactionFrom: seen.source,
        amountAtomic: seen.amountAtomic, canonicalReceipt: {addressesIncluded: false, transferCount: 1, status: 'success', network: 'base',
          asset: 'USDC', tokenContract: d.token, transactionHash, blockNumber: Number(seen.blockNumber), blockHash: seen.blockHash,
          logIndex: seen.logIndex, timestamp: seen.blockTimestamp, amount: decimal(seen.amountAtomic), amountBaseUnits: seen.amountAtomic}}};
    }},
    async readAcceptedWork(query) {
      const rows = await records('d.obligation_id=$1', [query.obligationId]);
      return rows.length === 1 && digest(rows[0].work) === digest(query) ? rows[0] : null;
    },
    async readReceiptAllocations(tx, index) { return records('d.transaction_hash=$1 AND d.log_index=$2', [tx, index]); },
  });
}
