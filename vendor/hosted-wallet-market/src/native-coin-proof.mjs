import assert from 'node:assert/strict';
import {isNativeRewardAsset} from './reward-asset.mjs';
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)?x.toLowerCase():null;
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x)?x.toLowerCase():null;
const q=x=>{assert((typeof x==='string'&&(/^(0|[1-9][0-9]*)$/.test(x)||/^0x[0-9a-f]+$/i.test(x)))||typeof x==='bigint'||Number.isSafeInteger(x),'native_quantity_refused');return BigInt(x);};
export function verifyNativeCoinProof({body,chainId,head,receipt,transaction,header,finalized}){
  assert(isNativeRewardAsset(body.rewardAsset)&&body.proofKind==='native_value_transfer'&&body.token===null&&body.logIndex===null,'unsupported_reward_asset');
  assert(q(chainId)===8453n&&q(transaction?.chainId)===8453n,'wrong_chain');
  const block=q(receipt?.blockNumber),blockHash=hash(receipt?.blockHash);
  assert(blockHash&&q(receipt.status)===1n&&hash(receipt.transactionHash)===body.transactionHash,'native_receipt_unverified');
  assert(hash(transaction.hash)===body.transactionHash&&hash(transaction.blockHash)===blockHash&&q(transaction.blockNumber)===block,'native_transaction_unverified');
  assert(q(header?.number)===block&&hash(header.hash)===blockHash&&block.toString()===body.blockNumber,'native_reorg');
  const final=q(finalized?.number);
  assert(final>=block&&final<=q(head)&&hash(finalized.hash)&&(final!==block||hash(finalized.hash)===blockHash),'native_not_finalized');
  const source=address(transaction.from),recipient=address(transaction.to),timestamp=q(header.timestamp);
  assert(source&&recipient&&source!==recipient&&address(receipt.from)===source&&address(receipt.to)===recipient,'native_destination_unverified');
  if(body.nonce!==undefined)assert(q(transaction.nonce)===q(body.nonce),'native_nonce_unverified');
  assert(transaction.input==='0x'&&q(transaction.value)>0n&&q(transaction.value).toString()===body.amountAtomic,'native_value_unverified');
  assert(timestamp<=BigInt(Math.floor(Date.now()/1000)+5),'native_timestamp_refused');
  const l2=q(receipt.gasUsed)*q(receipt.effectiveGasPrice),l1=receipt.l1Fee==null?null:q(receipt.l1Fee),operator=receipt.operatorFee==null?null:q(receipt.operatorFee);
  return {chain:'eip155:8453',proofKind:'native_value_transfer',rewardAsset:body.rewardAsset,source,recipient,amountAtomic:q(transaction.value).toString(),
    blockNumber:block.toString(),blockHash,logIndex:null,blockTimestamp:new Date(Number(timestamp)*1000).toISOString(),blockTimestampMs:Number(timestamp)*1000,
    l2FeeWei:l2.toString(),l1FeeWei:l1?.toString()??null,operatorFeeWei:operator?.toString()??null,knownFeeWei:(l2+(l1??0n)+(operator??0n)).toString(),
    feeCompleteness:l1===null||operator===null?'missing_fee_components':'all_returned_components'};
}
