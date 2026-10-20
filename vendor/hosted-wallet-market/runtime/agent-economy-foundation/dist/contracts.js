import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
export class BoundaryError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
export function requireThat(test, code) {
    if (!test)
        throw new BoundaryError(code);
}
const schemas = ['v1', 'v2', 'v3'].map(v => JSON.parse(readFileSync(new URL(`./schema/foundation.${v}.json`, import.meta.url), 'utf8')));
const ajv = new Ajv2020({ strict: true, allErrors: true });
formats(ajv);
for (const schema of schemas)
    ajv.addSchema(schema);
export function checked(name, value) {
    const schema = schemas.find(s => name in s.$defs);
    const validate = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
    requireThat(validate(value), `invalid_${name}`);
    return structuredClone(value);
}
export function checkedWallet(value) {
    return value?.schemaVersion === 'pilot.agent-economy.v3' ? checked('WalletV3', value) : checked('Wallet', value);
}
export function checkedFundingProof(value) {
    return value?.schemaVersion === 'pilot.agent-economy.v2' ? checked('FundingProofV2', value) : checked('FundingProof', value);
}
export function checkedQuote(value) {
    return value?.schemaVersion === 'pilot.agent-economy.v2' ? checked('QuoteV2', value) : checked('Quote', value);
}
export function immutable(v) {
    if (v && typeof v === 'object') {
        for (const child of Object.values(v))
            immutable(child);
        Object.freeze(v);
    }
    return v;
}
