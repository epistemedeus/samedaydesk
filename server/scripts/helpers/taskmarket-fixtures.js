import { parseNetworkInfo, TASKMARKET_NETWORK_INFO } from "../../lib/taskmarket-networks.js";

// Public identity subset from network.info, received 2026-10-23. No task corpus.
export const BASE_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const TEMPO_TOKEN = "0x20c0000000000000000000006a37da5c996874be";
export const networkInfo = () => ({ result: { data: { chains: [
  { chainId: 8453, networkName: "Base", tokenAddress: BASE_TOKEN, tokenSymbol: "USDC", paymentProtocol: "x402", paymentMethod: "eip3009" },
  { chainId: 4217, networkName: "Tempo", tokenAddress: TEMPO_TOKEN, tokenSymbol: "OUSD", paymentProtocol: "mpp", paymentMethod: "mpp-tempo" },
] } } });
export const fixtureMetadata = () => parseNetworkInfo(networkInfo(), "2026-10-23T05:00:00.000Z");
export const withNetworkInfo = fetchImpl => async (url, options) => url === TASKMARKET_NETWORK_INFO ? Response.json(networkInfo()) : fetchImpl(url, options);
export const planSelectors = { chain_id: 8453, token_address: BASE_TOKEN };
export const taskFixture = (overrides = {}) => ({
  id: "0x" + "a".repeat(64), chainId: 8453, description: "# Fixture task\nOnly public evidence", reward: "3142305", netReward: "2775000", status: "open", mode: "bounty", tags: ["research"], expiryTime: "2026-10-24T12:00:00.000Z", submissionCount: 1, ...overrides,
});
