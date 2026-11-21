// Source identity only. Admission must not load the rail's SQLite journal or
// operator paths into ordinary environment/debt administration commands.
import {digest} from '../runtime/agent-economy-foundation/dist/operations.js';
import {versionedSource} from '../runtime/agent-economy-rail/dist/candidate.js';

export function machineNetworkSource(value){
 const source=versionedSource(value?.chain);
 if(digest(source)!==digest(value))throw Object.assign(Error('candidate_identity_changed'),{code:'candidate_identity_changed',codeName:'candidate_identity_changed',http:409});
 return source;
}
