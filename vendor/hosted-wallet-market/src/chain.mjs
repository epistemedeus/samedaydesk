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

export async function publicRead(raw, method, params = []) {
  if (!PUBLIC_READ_METHODS.has(method)) refuse('chain_method_refused');
  return rpc(assertRpcUrl(raw), method, params);
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

function rpc(url, method, params = []) {
  if (REFUSED_METHODS.has(method)) refuse('chain_method_refused');
  const body = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: 1, method, params}));
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
        'user-agent': 'root71-hosted-wallet-market',
      },
      timeout: 20000,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString());
          if (parsed.error || parsed.result === undefined) {
            const rpcCode = Number.isInteger(parsed.error?.code) ? parsed.error.code : null;
            reject(Object.assign(new Error('chain_rpc_refused'), {codeName: 'chain_rpc_refused', rpcCode}));
          } else resolve(parsed.result);
        } catch {
          reject(Object.assign(new Error('chain_rpc_refused'), {codeName: 'chain_rpc_refused'}));
        }
      });
    });
    request.on('error', () => reject(Object.assign(new Error('chain_unreachable'), {codeName: 'chain_unreachable'})));
    request.on('timeout', () => request.destroy());
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
export async function readPublicChain(raw, expectedChain) {
  if (expectedChain !== 'eip155:8453' && expectedChain !== 'eip155:84532') refuse('chain_refused');
  const chainId = await publicRead(raw, 'eth_chainId');
  const block = await publicRead(raw, 'eth_blockNumber');
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
  const value = String(topic || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(value)) return null;
  return `0x${value.slice(-40)}`;
}

function hexQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try { return BigInt(value); }
  catch { return null; }
}

/**
 * Read-only Base/USDC transfer check for an enrolled debt receipt.
 * Uses the process profile RPC. Matches log.logIndex, not the array position.
 * Does not accept a caller URL and does not send a transaction.
 */
export async function readRailTransfer(raw, body) {
  const chain = await readPublicChain(raw, 'eip155:8453');
  if (chain.chain !== 'eip155:8453') refuse('chain_refused');
  const receipt = await publicRead(raw, 'eth_getTransactionReceipt', [body.transactionHash]);
  if (!receipt || typeof receipt !== 'object') refuse('transfer_unverified');
  const status = hexQuantity(String(receipt.status || ''));
  const block = hexQuantity(String(receipt.blockNumber || ''));
  if (status !== 1n || block == null) refuse('transfer_unverified');
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const log = logs.find(item => {
    const index = hexQuantity(String(item?.logIndex || ''));
    return index != null && index === BigInt(body.logIndex);
  });
  if (!log) refuse('transfer_unverified');
  const topics = Array.isArray(log.topics) ? log.topics.map(item => String(item).toLowerCase()) : [];
  if (String(log.address || '').toLowerCase() !== '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') refuse('transfer_unverified');
  if (topics[0] !== TRANSFER_TOPIC) refuse('transfer_unverified');
  const source = topicToAddress(topics[1]);
  const recipient = topicToAddress(topics[2]);
  const amount = hexQuantity(String(log.data || ''));
  if (!source || !recipient || amount == null) refuse('transfer_unverified');
  const header = await publicRead(raw, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
  const timestamp = hexQuantity(String(header?.timestamp || ''));
  if (timestamp == null) refuse('transfer_unverified');
  return {
    chain: 'eip155:8453',
    source,
    recipient,
    amountAtomic: amount.toString(),
    blockNumber: block.toString(),
    logIndex: body.logIndex,
    blockTimestampMs: Number(timestamp * 1000n),
  };
}

export async function readLocalChain(raw) {
  const url = assertLoopbackRpc(raw);
  const observed = await readRpc(url);
  if (observed.id !== 31337n) refuse('chain_refused', {chainId: observed.id.toString()});
  return {chain: 'eip155:31337', chainId: observed.id.toString(), blockNumber: observed.blockNumber};
}
