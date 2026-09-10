import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMatrix, routeJob} from './route-job.mjs';

test('fixture processing is distinct from complete acquisition and criteria remain unassessed', () => {
 const r=routeJob({type:'supplied_issue_brief', constraints:['offline_only'], acceptance:['must be current and complete']});
 assert.equal(r.selected.offerId,'neo.agent_task_kit');
 assert.equal(r.criteriaAssessment,'not_evaluated');
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.requiresHostedWorkflow,false);
 assert.match(r.selected.limits.join(' '),/does not fetch or certify complete comments/);
});
test('notFor and complete-issue hard rule filter candidates, not just annotate them', () => {
 const matrix=loadMatrix();
 for(const o of matrix.offers)o.supportsJobTypes.push('complete_issue_discussion');
 assert.equal(routeJob({type:'complete_issue_discussion'},{matrix}).selected,null);
 const kit=matrix.offers.find(o=>o.id==='neo.agent_task_kit');kit.notFor.push('cross_workspace_correction');
 assert.equal(routeJob({type:'cross_workspace_correction'},{matrix}).selected,null);
});
test('no-payment and offline-only never fall back to a paid merchant', () => {
 for(const constraint of ['no_payment','offline_only']){
 const r=routeJob({type:'bounded_html_observation',constraints:[constraint]});
 assert.equal(r.ok,false);assert.equal(r.selected,null);assert.equal(r.paid,false);
 }
});
test('published download and browser page do not imply hosted worker service', () => {
 const matrix=loadMatrix();const sdk=matrix.offers.find(o=>o.id==='neo.moltjobs_openai_agents_sample');
 assert.match(sdk.limits.join(' '),/refuses --live/);
 assert.equal(sdk.archiveSha256,undefined);
 assert.equal(matrix.offers.find(o=>o.id==='neo.trial_brief_builder').hosting,'hosted_browser_local');
 assert.deepEqual(matrix.offers.find(o=>o.id==='sdd.result_reuse_offline').supportsJobTypes,[]);
});
