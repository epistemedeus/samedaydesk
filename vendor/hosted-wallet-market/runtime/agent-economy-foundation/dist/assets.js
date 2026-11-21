import { checked, immutable, requireThat } from './contracts.js';
export const BASE_USDC = Object.freeze({ chain: 'eip155:8453', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' });
/** Controller configuration, never inferred from a quote, RPC response or public task text. */
export class AssetRegistry {
    environment;
    entries;
    constructor(environment, entries) {
        this.environment = environment;
        requireThat(environment === 'production' || environment === 'sandbox', 'asset_registry_environment');
        requireThat(entries.length > 0, 'empty_asset_registry');
        const copies = entries.map(e => {
            const asset = checked('Asset', e.asset);
            requireThat(e.environment === environment, 'asset_registry_environment');
            requireThat(environment !== 'production' || asset.chain !== 'eip155:31337', 'sandbox_not_production');
            requireThat(typeof e.canonical.asset === 'string' && e.canonical.asset.length > 0 &&
                typeof e.canonical.network === 'string' && e.canonical.network.length > 0, 'canonical_asset_registration');
            if (environment === 'sandbox')
                requireThat(e.canonical.network !== 'base', 'sandbox_canonical_network');
            return { asset, environment, canonical: { ...e.canonical } };
        });
        for (let i = 0; i < copies.length; i++)
            for (let j = 0; j < i; j++) {
                requireThat(copies[i].asset.chain !== copies[j].asset.chain || copies[i].asset.token !== copies[j].asset.token, 'duplicate_asset_registration');
            }
        this.entries = immutable(copies);
        Object.freeze(this);
    }
    hasExact(asset) {
        return this.entries.some(e => e.asset.chain === asset.chain && e.asset.token === asset.token &&
            e.asset.decimals === asset.decimals && e.asset.symbol === asset.symbol);
    }
    registration(asset) {
        requireThat(this.hasExact(asset), 'asset_not_registered');
        return this.entries.find(e => e.asset.chain === asset.chain && e.asset.token === asset.token);
    }
    requireProduction() { requireThat(this.environment === 'production', 'sandbox_not_production'); }
}
export const PRODUCTION_ASSETS = new AssetRegistry('production', [{ asset: BASE_USDC, environment: 'production', canonical: { asset: 'USDC', network: 'base' } }]);
