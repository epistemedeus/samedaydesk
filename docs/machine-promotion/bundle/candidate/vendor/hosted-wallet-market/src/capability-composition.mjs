// A second admitted capability beside the default unfunded document.
// Selection is not payment authority and does not replace the public profile.
import {admitMachineCapability} from './machine-profile-document.mjs';

const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 409}); };

export function admitQualifiedMember(input, {sdsRoot, origin, tenant, paired} = {}) {
  if (paired?.money !== 'unfunded') refuse('capability_composition_refused');
  if (input === undefined || input === null || input === '') return {document: null, fault: null};
  let document;
  try { document = admitMachineCapability(input, {sdsRoot, origin, tenant}); }
  catch (error) {
    const named = error.codeName || error.code;
    return {document: null, fault: typeof named === 'string' && /^[a-zA-Z0-9_]{1,96}$/.test(named) ? named : 'machine_profile_refused'};
  }
  if (!document || document.money !== 'qualified' || document.participation) return {document: null, fault: 'capability_composition_refused'};
  return {document, fault: null};
}
