// Exact reward profile. No zero-address token alias and no inferred denomination.
export const BASE_NATIVE_ETH=Object.freeze({schema:'pilot.reward-asset.v1',kind:'native',chainId:8453,symbol:'ETH',decimals:18,denomination:'wei'});
export function isNativeRewardAsset(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===Object.keys(BASE_NATIVE_ETH).length&&Object.entries(BASE_NATIVE_ETH).every(([k,v])=>value[k]===v);}
export const isNativeCoinIntent=intent=>intent?.schema==='pilot.native-obligation.intent.v2';
export const NATIVE_PROOF_KIND='native_value_transfer';
