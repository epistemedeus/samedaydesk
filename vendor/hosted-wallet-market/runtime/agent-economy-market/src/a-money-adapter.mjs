import { checked,checkedFundingProof,COMMERCE_PAYMENTS_PIN,digest,requireThat } from '../../agent-economy-foundation/dist/index.js';

/** Final A exports the F1 CaptureOutcome contract directly. */
export function requesterMoneyFromRail(rail) {
  requireThat(rail && typeof rail.readProof==='function' && typeof rail.captureOutcome==='function' && typeof rail.capture==='function','a_interface_required');
  requireThat(digest(rail.protocol)===digest(COMMERCE_PAYMENTS_PIN),'capture_adapter_pin');
  return {
    authorityId:rail.authorityId,protocol:rail.protocol,qualification:'local_chain',
    async readProof(id){const p=await rail.readProof(id);return p?checkedFundingProof(p):null;},
    async authorizationDeadline(id){return rail.authorizationDeadline(id);},
    async authorizationTimestamp(id){return rail.authorizationTimestamp(id);},
    async observedTimestamp(){return rail.observedTimestamp();},
    async readIncident(id){return rail.readIncident(id);},
    async captureOutcome(request){return checked('CaptureOutcome',await rail.captureOutcome(checked('CaptureRequest',request)));},
    async capture(request){return checked('CaptureOutcome',await rail.capture(checked('CaptureRequest',request)));},
  };
}
