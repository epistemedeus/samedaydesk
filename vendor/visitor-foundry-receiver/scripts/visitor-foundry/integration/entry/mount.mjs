import {createFoundryExtension} from '../src/extension.mjs';
import {createEntryMount} from '../../entry/src/mount.mjs';
import {EntryReceiver} from './receiver.mjs';
/** Replacement at the existing correspondence mount. Installation/migrations
 * remain explicit private host operations. Never mount an additional raw app:
 * that would bypass the entry event reservation and grant-scope gate. */
export async function createEntryReuseMount({enabled=false,databaseUrl,schema,correspondence,config,hostProfile,participationKey,poolMax=2}){
 if(enabled!==true)throw new Error('entry reuse requires explicit installation');
 const extension=await createFoundryExtension({enabled:true,databaseUrl,schema,poolMax,participationKey});
 const receiver=new EntryReceiver(extension.integration,hostProfile);
 const mounted=createEntryMount({enabled:true,databaseUrl,schema,correspondence,config,receiver,poolMax});
 mounted.app.use(extension.router);
 return {...mounted,extension,receiver,
  async checkReady(){await mounted.checkReady();await extension.checkReady();await receiver.status();},
  async close(){await mounted.close();await extension.close();}};
}
