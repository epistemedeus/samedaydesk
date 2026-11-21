import { requireThat } from '../../agent-economy-foundation/dist/index.js';

/** Existing contributor-account service authenticates; installed tenant enrollment
 * supplies membership. This adapter neither issues accounts nor alters bindings. */
export class CanonicalMarketAccounts {
  constructor({service,database,kernel,membership,sessionToken}) {
    Object.assign(this,{service,database,kernel,membership,sessionToken});
  }
  async authenticate(context) {
    const result=await this.service.authenticate(this.sessionToken(context));
    if(!result.ok)return null;
    const member=await this.membership.byAccount(result.value.accountId,context);
    if(!member)return null;
    requireThat(member.actorId===result.value.accountId,'account_binding');
    return {actorId:member.actorId,tenantId:member.tenantId};
  }
  async resolve(tenantId,actorId) {
    const m=await this.membership.resolve(tenantId,actorId);
    if(!m || m.actorId!==actorId || m.tenantId!==tenantId)return null;
    const exists=await this.database.withOpportunityClient(async client=>(await client.query('SELECT 1 FROM journey_accounts WHERE id=$1',[actorId])).rows.length>0,'read');
    return exists?m:null;
  }
  async principal(tenantId,actorId,canonicalTaskId) {
    if(!await this.resolve(tenantId,actorId))return null;
    const binding=await this.database.withOpportunityClient(async client=>(await client.query('SELECT public_id,token_hash,principal_id,kernel_scope FROM journey_account_kernel_bindings WHERE account_id=$1 AND earned_task_id=$2 AND kernel_scope=$2',[actorId,canonicalTaskId])).rows[0]??null,'read');
    if(!binding)return null;
    // The owning kernel revalidates the stored token hash and its expiry/revocation.
    const p=await this.kernel.findContributorByTokenHash(binding.token_hash);
    requireThat(p && p.id===binding.principal_id && p.publicId===binding.public_id && p.taskScope===canonicalTaskId,'principal_binding');
    return p;
  }
}
