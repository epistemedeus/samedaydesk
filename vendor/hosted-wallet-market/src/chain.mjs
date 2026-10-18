import http from 'node:http';
import https from 'node:https';

export const PUBLIC_CHAINS = new Set(['eip155:1', 'eip155:8453', 'eip155:84532']);

function refuse(code, extra) {
  throw Object.assign(new Error(code), {codeName: code, ...extra});
}

export function parseChain(chain) {
  if (typeof chain !== 'string' || !/^eip155:[0-9]+$/.test(chain)) refuse('chain_refused');
  if (PUBLIC_CHAINS.has(chain)) refuse('chain_refused', {chainId: chain.slice('eip155:'.length)});
  return chain;
}

/** Private chains stay on parseChain. Base is a read target only, and only while payments stay off. */
export function acceptProfileChain(chain) {
  if (chain === 'eip155:8453' || chain === 'eip155:84532') return {chain, publicChain: true};
  return {chain: parseChain(chain), publicChain: false};
}

export async function publicRead(raw, method, params = [], timeoutMs = 20000) {
  if (!PUBLIC_READ_METHODS.has(method)) refuse('chain_method_refused');
  return rpc(assertRpcUrl(raw), method, params, timeoutMs);
}

export function assertRpcUrl(raw) {
  let url;
  try { url = new URL(raw); }
  catch { refuse('chain_url_refused'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
    refuse('chain_url_refused');
  }
  return url;
}

/** Disposable-harness RPC guard. The deployment profile uses assertRpcUrl. */
export function assertLoopbackRpc(raw) {
  const url = assertRpcUrl(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') refuse('chain_url_refused');
  return url;
}

const REFUSED_METHODS = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_sign',
  'eth_signTransaction',
  'personal_sign',
]);
const PUBLIC_READ_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_getLogs',
  'eth_call',
]);
const BASE_READ_TOKEN = {
  'eip155:8453': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  'eip155:84532': '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
};

function rpc(url, method, params = [], timeoutMs = 20000) {
  if (REFUSED_METHODS.has(method)) refuse('chain_method_refused');
  const body = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: 1, method, params}));
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const failed = () => Object.assign(new Error('chain_rpc_refused'), {codeName: 'chain_rpc_refused'});
    const request = transport.request(url, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'content-length': String(body.length), 'user-agent': 'root71-hosted-wallet-market'},
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) request.destroy(failed());
        else chunks.push(chunk);
      });
      response.on('error', () => request.destroy(failed()));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString());
          if (response.statusCode !== 200 || !parsed || Array.isArray(parsed) || parsed.jsonrpc !== '2.0' || parsed.id !== 1 || parsed.error || parsed.result === undefined) {
            throw Object.assign(failed(), {rpcCode: Number.isInteger(parsed?.error?.code) ? parsed.error.code : null, httpStatus:response.statusCode});
          }
          resolve(parsed.result);
        } catch (error) { reject(error?.codeName ? error : failed()); }
      });
    });
    // A deadline bounds streaming responses too. No redirects, bearer forwarding,
    // proxy environment, or credentials other than the configured endpoint.
    const deadline = setTimeout(() => request.destroy(Object.assign(new Error('chain_unreachable'),{codeName:'chain_unreachable'})), timeoutMs);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', error => { clearTimeout(deadline); reject(error?.codeName ? error : Object.assign(new Error('chain_unreachable'), {codeName:'chain_unreachable'})); });
    request.end(body);
  });
}

async function readRpc(url) {
  const chainId = await rpc(url, 'eth_chainId');
  const block = await rpc(url, 'eth_blockNumber');
  if (typeof chainId !== 'string' || typeof block !== 'string') refuse('chain_rpc_refused');
  let id;
  try { id = BigInt(chainId); }
  catch { refuse('chain_refused'); }
  if (!/^[0-9]+$/.test(block.replace(/^0x/, '')) && !/^0x[0-9a-f]+$/i.test(block)) refuse('chain_rpc_refused');
  return {id, blockNumber: BigInt(block).toString()};
}

export async function readConfiguredChain(raw, expectedChain) {
  const expected = parseChain(expectedChain);
  const url = assertRpcUrl(raw);
  const observed = await readRpc(url);
  const chain = `eip155:${observed.id}`;
  if (PUBLIC_CHAINS.has(chain) || chain !== expected) refuse('chain_refused', {chainId: observed.id.toString()});
  return {chain, chainId: observed.id.toString(), blockNumber: observed.blockNumber};
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topicAddress(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

/**
 * Confirms a USDC Transfer of the quoted gross from the bound payer to the
 * server recipient, emitted by the configured token on the configured chain.
 * Native transaction value is not a funding condition. A missing or mismatched
 * log is deposit_unverified. A transaction sender other than the payer is
 * payer_unbound. This does not enable a payment rail.
 */
export async function readPublicChain(raw, expectedChain, timeoutMs = 20000) {
  if (expectedChain !== 'eip155:8453' && expectedChain !== 'eip155:84532') refuse('chain_refused');
  const chainId = await publicRead(raw, 'eth_chainId', [], timeoutMs);
  const block = await publicRead(raw, 'eth_blockNumber', [], timeoutMs);
  if (typeof chainId !== 'string' || typeof block !== 'string') refuse('chain_rpc_refused');
  let id;
  try { id = BigInt(chainId); }
  catch { refuse('chain_refused'); }
  const chain = `eip155:${id}`;
  if (chain !== expectedChain) refuse('chain_refused', {chainId: id.toString()});
  return {chain, chainId: id.toString(), blockNumber: BigInt(block).toString()};
}

export async function readBaseTokenDecimals(raw, chain) {
  const token = BASE_READ_TOKEN[chain];
  if (!token) refuse('chain_refused');
  const data = await publicRead(raw, 'eth_call', [{to: token, data: '0x313ce567'}, 'latest']);
  let decimals;
  try { decimals = BigInt(data); }
  catch { refuse('chain_rpc_refused'); }
  if (decimals !== 6n) refuse('chain_rpc_refused');
  return decimals.toString();
}

export async function readAccountCode(raw, address) {
  const code = String(await rpc(assertRpcUrl(raw), 'eth_getCode', [address, 'latest'])).toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(code)) refuse('chain_rpc_refused');
  return code;
}

export async function verifyDeposit(raw, {expectedChain, proofId, feeRecipient, settlementToken, grossAtomic, payer}) {
  if (PUBLIC_CHAINS.has(expectedChain)) refuse('funding_refused');
  if (typeof proofId !== 'string' || !/^0x[a-f0-9]{64}$/.test(proofId)) refuse('deposit_unverified');
  if (typeof feeRecipient !== 'string' || !/^0x[a-f0-9]{40}$/.test(feeRecipient)) refuse('deposit_unverified');
  if (typeof settlementToken !== 'string' || !/^0x[a-f0-9]{40}$/.test(settlementToken)) refuse('deposit_unverified');
  if (typeof payer !== 'string' || !/^0x[a-f0-9]{40}$/.test(payer)) refuse('deposit_unverified');
  const configured = await readConfiguredChain(raw, expectedChain);
  const url = assertRpcUrl(raw);
  const tx = await rpc(url, 'eth_getTransactionByHash', [proofId]);
  const receipt = await rpc(url, 'eth_getTransactionReceipt', [proofId]);
  const head = await rpc(url, 'eth_blockNumber');
  if (!tx || typeof tx !== 'object' || !receipt || typeof receipt !== 'object') refuse('deposit_unverified');
  let status;
  let gross;
  let txBlock;
  let receiptBlock;
  let headBlock;
  try {
    status = BigInt(receipt.status);
    gross = BigInt(grossAtomic);
    txBlock = BigInt(tx.blockNumber);
    receiptBlock = BigInt(receipt.blockNumber);
    headBlock = BigInt(head);
  } catch {
    refuse('deposit_unverified');
  }
  if (status !== 1n) refuse('deposit_unverified');
  if (tx.blockNumber == null || receipt.blockNumber == null) refuse('deposit_unverified');
  if (txBlock !== receiptBlock || receiptBlock > headBlock) refuse('deposit_unverified');
  if (String(tx.from || '').toLowerCase() !== payer) refuse('payer_unbound');
  const fromTopic = topicAddress(payer);
  const toTopic = topicAddress(feeRecipient);
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  let logIndex = null;
  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index];
    if (!log || String(log.address || '').toLowerCase() !== settlementToken) continue;
    const topics = Array.isArray(log.topics) ? log.topics.map(item => String(item).toLowerCase()) : [];
    if (topics[0] !== TRANSFER_TOPIC || topics[1] !== fromTopic || topics[2] !== toTopic) continue;
    if (typeof log.data !== 'string' || !/^0x[0-9a-f]+$/.test(log.data)) continue;
    let moved;
    try { moved = BigInt(log.data); }
    catch { continue; }
    if (moved !== gross) continue;
    logIndex = log.logIndex == null ? String(index) : BigInt(log.logIndex).toString();
    break;
  }
  if (logIndex == null) refuse('deposit_unverified');
  return {
    chain: configured.chain,
    chainId: configured.chainId,
    blockNumber: receiptBlock.toString(),
    proofId,
    logIndex,
    asset: 'USDC',
  };
}

function topicToAddress(topic) {
  return typeof topic === 'string' && /^0x0{24}[0-9a-f]{40}$/i.test(topic) ? `0x${topic.slice(-40).toLowerCase()}` : null;
}

function hexQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}
const hashOf = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null;

/** Canonical, finalized read only. Caller URLs and signing methods are absent.
 * A prior authenticated review took 21703ms. Receiving waits 60000ms before an
 * unanswered read is chain_unreachable. That deadline is not a failed transfer. */
export async function readRailTransfer(raw, body) {
  const timeoutMs = 60000;
  const chain = await readPublicChain(raw, 'eip155:8453', timeoutMs);
  const receipt = await publicRead(raw, 'eth_getTransactionReceipt', [body.transactionHash], timeoutMs);
  const block = hexQuantity(receipt?.blockNumber);
  const blockHash = hashOf(receipt?.blockHash);
  if (hexQuantity(receipt?.status) !== 1n || block === null || !blockHash || hashOf(receipt?.transactionHash) !== body.transactionHash) refuse('transfer_unverified');
  if (block > BigInt(chain.blockNumber) || block.toString() !== body.blockNumber) refuse('transfer_unverified');
  const [header, finalized, transaction] = await Promise.all([
    publicRead(raw, 'eth_getBlockByNumber', [receipt.blockNumber, false], timeoutMs),
    publicRead(raw, 'eth_getBlockByNumber', ['finalized', false], timeoutMs),
    rpc(assertRpcUrl(raw), 'eth_getTransactionByHash', [body.transactionHash], timeoutMs),
  ]);
  const timestamp = hexQuantity(header?.timestamp);
  const finalBlock = hexQuantity(finalized?.number);
  if (hexQuantity(header?.number) !== block || hashOf(header?.hash) !== blockHash || timestamp === null || timestamp > BigInt(Math.floor(Date.now() / 1000) + 5)) refuse('transfer_unverified');
  if (finalBlock === null || finalBlock < block || finalBlock > BigInt(chain.blockNumber) || !hashOf(finalized?.hash) || (finalBlock === block && hashOf(finalized.hash) !== blockHash)) refuse('transfer_unverified');
  if (hashOf(transaction?.hash) !== body.transactionHash || hashOf(transaction?.blockHash) !== blockHash || hexQuantity(transaction?.blockNumber) !== block) refuse('transfer_unverified');
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const matches = logs.filter(log => hexQuantity(log?.logIndex) === BigInt(body.logIndex));
  if (matches.length !== 1) refuse('transfer_unverified');
  const log = matches[0];
  if (log.removed === true || hashOf(log.transactionHash) !== body.transactionHash || hashOf(log.blockHash) !== blockHash || hexQuantity(log.blockNumber) !== block) refuse('transfer_unverified');
  const topics = log.topics;
  if (String(log.address || '').toLowerCase() !== BASE_READ_TOKEN['eip155:8453'] || !Array.isArray(topics) || topics.length !== 3 || String(topics[0]).toLowerCase() !== TRANSFER_TOPIC) refuse('transfer_unverified');
  const source = topicToAddress(topics[1]), recipient = topicToAddress(topics[2]);
  if (!source || !recipient || source === recipient || String(transaction.from || '').toLowerCase() !== source || !/^0x[0-9a-f]{64}$/i.test(log.data || '')) refuse('transfer_unverified');
  const amount = BigInt(log.data);
  if (amount <= 0n) refuse('transfer_unverified');
  const exact = logs.filter(item => item?.removed !== true && String(item.address || '').toLowerCase() === BASE_READ_TOKEN['eip155:8453'] &&
    Array.isArray(item.topics) && item.topics.length === 3 && String(item.topics[0]).toLowerCase() === TRANSFER_TOPIC &&
    topicToAddress(item.topics[1]) === source && topicToAddress(item.topics[2]) === recipient &&
    /^0x[0-9a-f]{64}$/i.test(item.data || '') && BigInt(item.data) === amount);
  if (exact.length !== 1) refuse('transfer_unverified');
  return {chain: 'eip155:8453', source, recipient, amountAtomic: amount.toString(), blockHash,
    blockNumber: block.toString(), logIndex: body.logIndex, blockTimestamp: new Date(Number(timestamp * 1000n)).toISOString(),
    blockTimestampMs: Number(timestamp * 1000n)};
}

export async function readLocalChain(raw) {
  const url = assertLoopbackRpc(raw);
  const observed = await readRpc(url);
  if (observed.id !== 31337n) refuse('chain_refused', {chainId: observed.id.toString()});
  return {chain: 'eip155:31337', chainId: observed.id.toString(), blockNumber: observed.blockNumber};
}
