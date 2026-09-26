import { createRequire } from 'node:module';
import { IntegrationStore } from './store.mjs';
import { createIntegrationRouter } from './router.mjs';
import { WorkCellStore, createWorkCellRouter } from '../../../../services/correspondence/dist/visitor-work-cells/index.js';
const require=createRequire(new URL('../../../../services/correspondence/package.json',import.meta.url));
const {Router}=require('express');
/** Existing host mount/lifecycle adapter. Disabled unless explicitly installed.
 * No migration, enrollment, arbitrary execution or production enablement. */
export async function createFoundryExtension({enabled=false,databaseUrl,schema,poolMax=2,participationKey}={}) {
  if(enabled!==true) throw new Error('foundry extension requires explicit opt-in');
  const integration=new IntegrationStore(databaseUrl,{schema,poolMax});
  const cells=new WorkCellStore(databaseUrl,{schema,poolMax,resolveReceipt:input=>integration.resolveReceipt(input)});
  integration.workCells=cells;integration.participationKey=participationKey;
  const router=Router();router.use(createWorkCellRouter(cells));router.use(createIntegrationRouter(integration));
  return {router,integration,cells,async checkReady(){await cells.checkReady();await integration.checkReady();},
    async close(){await cells.close();await integration.close();}};
}
