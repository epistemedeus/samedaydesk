import {boundedReview} from './bounded-review.mjs';
// Supplies the existing installed journey's canonical-receiving port. The
// journey keeps its original accepted-work and settlement validator. This port
// consumes the durable projection and rechecks its original registry authority.
import {createHash} from 'node:crypto';
import {digest} from './canonical.mjs';
import {readAuthoritativeDischarge} from './discharge-authority.mjs';
import {consumerContractSha256, installedSourceSha256} from './native-debt.mjs';
import {readRailTransfer} from './chain.mjs';
import {storedDebt,matchDebt} from './debt-source.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const proofFields=d=>d.proof_kind==='native_value_transfer'?{proofKind:d.proof_kind,rewardAsset:d.reward_asset}:{};
const decimal = amount => `${BigInt(amount)/1000000n}.${(BigInt(amount)%1000000n).toString().padStart(6,'0')}`;
export function createCanonicalReceiving({consumer, withReadClient, registryRoot, rpcUrl,readAcceptedSource}) {
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
        const body = {...proofFields(d),importContractSha256: d.import_contract_sha256, tenant: d.tenant, obligationId: d.obligation_id,
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
  const review=boundedReview();
  const port=Object.freeze({pin,
    // External correspondence has no journey account or work-link row. Join
    // the original native IOU to its installed discharge instead of requiring
    // signup retroactively. Registry and current finalized chain proof remain
    // mandatory; the projection's paid Boolean alone is never authority.
    async readExternalDischarge(query,{signal}={}) {
      const read=()=>withReadClient(async tx=>{
        await consumer.assertBinding(tx);
        const view=await consumer.readNativeDebt(tx,query.obligationId);
        if(view.state!=='bound')return {source:pin,query,state:view.state==='hold'?'pending':'not_observed'};
        const found=(await tx.query(`SELECT d.*,o.round_id,c.contributor_token_id,j.requester_account_id
          FROM hosted_wallet_market.native_debt_dispositions d
          JOIN opportunity_obligations o ON o.id=d.obligation_id AND o.claim_id=d.claim_id
          JOIN opportunity_claims c ON c.id=o.claim_id AND c.round_id=o.round_id
          JOIN journey_task_links j ON j.task_id=d.task_id AND j.opportunity_round_id=o.round_id
          WHERE d.obligation_id=$1 AND d.obligation_family='opportunity'`,[query.obligationId])).rows;
        if(found.length!==1)throw Error('disposition_hold');
        const d=found[0],expected={taskId:d.task_id,reservationId:d.claim_id,submissionId:d.submission_id,
          obligationId:d.obligation_id,verdictId:d.verdict_id,termsVersion:d.terms_version,
          artifactDigestSha256:d.artifact_digest_sha256,roundId:d.round_id,
          requesterAccountId:d.requester_account_id,contributorPrincipalId:d.contributor_token_id};
        if(digest(query)!==digest(expected))throw Error('disposition_hold');
        const body={...proofFields(d),importContractSha256:d.import_contract_sha256,tenant:d.tenant,obligationId:d.obligation_id,
          reservationId:d.reservation_id,taskId:d.task_id,termsVersion:d.terms_version,network:d.network,token:d.token,
          transactionHash:d.transaction_hash,logIndex:d.log_index,blockNumber:d.block_number,amountAtomic:d.amount_atomic,
          receiptId:d.receipt_id,receivedAt:new Date(d.received_at).toISOString()};
        const {receipt}=readAuthoritativeDischarge(registryRoot,body);
        const native=await storedDebt(tx,query.obligationId,{readAcceptedSource});
        matchDebt(native,receipt);
        if(digest(receipt)!==d.authority_receipt_sha256)throw Error('disposition_hold');
        for(const [key,value]of Object.entries({obligationId:query.obligationId,taskId:query.taskId,
          claimId:query.reservationId,submissionId:query.submissionId,verdictId:query.verdictId,
          termsVersion:query.termsVersion,artifactDigestSha256:query.artifactDigestSha256,roundId:query.roundId})){
          if(receipt[key]!==value)throw Error('disposition_hold');
        }
        return {body,receipt};
      },{signal});
      const result=await read();
      if(!result.receipt)return result;
      const observed=await readRailTransfer(rpcUrl,result.body,{signal});
      for(const key of ['source','recipient','amountAtomic','blockNumber','blockHash','blockTimestamp','logIndex']){
        if(observed[key]!==result.receipt[key])throw Error('disposition_hold');
      }
      // Recheck the original installed authority after the asynchronous RPC.
      if(digest(await read())!==digest(result))throw Error('disposition_hold');
      return {source:pin,query,state:'verified_paid',transactionHash:result.body.transactionHash,
        ...proofFields({proof_kind:result.body.proofKind,reward_asset:result.body.rewardAsset}),logIndex:result.body.logIndex,receiptId:result.body.receiptId};
    },
    reviewReceivingStatus:review.status,
    async reviewFulfillment(handoff) {
      const unknown=()=>({...handoff,state:'unknown',verifierVersion:'canonical-receiving/v2'});
      return review.read(async(signal,phase)=>{
        const query=await withReadClient(async tx=>{
          await consumer.assertBinding(tx);
          const native=await storedDebt(tx,handoff.obligationId,{readAcceptedSource});
          const bound={taskId:native.taskId,reservationId:native.claimId,workId:native.submissionId,obligationId:native.obligationId,termsVersion:native.termsVersion,verdictId:native.verdictId};
          if(digest(bound)!==digest(handoff)||native.family!=='opportunity')throw Error('disposition_hold');
          const rows=(await tx.query(`SELECT c.contributor_token_id,j.requester_account_id FROM opportunity_claims c
            JOIN journey_task_links j ON j.opportunity_round_id=c.round_id AND j.task_id=$2 WHERE c.id=$1`,[native.claimId,native.taskId])).rows;
          if(rows.length!==1)throw Error('disposition_hold');
          return {taskId:native.taskId,reservationId:native.claimId,submissionId:native.submissionId,obligationId:native.obligationId,verdictId:native.verdictId,termsVersion:native.termsVersion,artifactDigestSha256:native.artifactDigestSha256,roundId:native.roundId,requesterAccountId:rows[0].requester_account_id,contributorPrincipalId:rows[0].contributor_token_id};
        },{signal});
        phase('discharge_registry_and_chain');
        const proof=await port.readExternalDischarge(query,{signal});
        signal.throwIfAborted();
        return {...handoff,state:proof.state,verifierVersion:'canonical-receiving/v2',...(proof.state==='verified_paid'?{transactionHash:proof.transactionHash,...(proof.proofKind?{proofKind:proof.proofKind,rewardAsset:proof.rewardAsset}:{}),logIndex:proof.logIndex,receiptId:proof.receiptId}:{})};
      },unknown);
    },
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
  return port;
}
