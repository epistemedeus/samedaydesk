import {open} from 'node:fs/promises';
import {constants} from 'node:fs';

function entries(input){
  const rows=Array.isArray(input)?input:input?.env_vars;
  if(!Array.isArray(rows)||rows.length>512)throw new Error('bounded full environment required');
  const map=new Map();
  for(const row of rows){
    if(!row||typeof row.key!=='string'||! /^[A-Z_][A-Z0-9_]{0,127}$/.test(row.key)||
        typeof row.value!=='string'||row.value.length>16384||row.value.includes('\0')||map.has(row.key))
      throw new Error('environment shape refused');
    if(/^\*{4,}$/.test(row.value))throw new Error('masked environment refused');
    map.set(row.key,row.value);
  }
  return map;
}
const payload=map=>({env_vars:[...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,value}))});

/** Pure full-set merge. GET supplies key coverage only, never authoritative values. */
export function prepareContributorEnvironment({existing,listed,overlay}){
  const baseline=entries(existing),changes=entries(overlay);
  const list=Array.isArray(listed)?listed:listed?.data;
  if(!baseline.size||!Array.isArray(list)||list.length>512)throw new Error('authoritative environment and current key inventory required');
  const keys=list.map(row=>row?.key);
  if(keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length||
      keys.length!==baseline.size||keys.some(key=>!baseline.has(key)))throw new Error('existing key coverage differs; refresh authoritative values');
  for(const [key] of changes)if(!/^CONTRIBUTOR_(?:JOURNEY|DESK)_/.test(key))throw new Error('unrelated environment change refused');
  for(const name of ['DATABASE_URL','EARNED_WORK_SCHEMA','CORRESPONDENCE_SCHEMA','STORE_ID','ORIGIN','PREVIEW_ORIGIN',
    'REPLAY_KEY','INTEGRITY_KEY','CURSOR_KEY','OWNER_TOKEN','CORRESPONDENCE_ADMIN_TOKEN']){
    const key='CONTRIBUTOR_JOURNEY_'+name;
    if(baseline.has(key)&&changes.has(key)&&baseline.get(key)!==changes.get(key))
      throw new Error('existing durable binding or stable credential change refused');
  }
  const merged=new Map([...baseline,...changes]);
  if(merged.get('CONTRIBUTOR_JOURNEY_MODE')!=='disabled'||merged.get('CONTRIBUTOR_DESK_MANAGED_ENABLED')!=='0'||
      merged.get('CONTRIBUTOR_JOURNEY_PUBLIC_READS')!=='0')throw new Error('installation packet must remain disabled and public-off');
  return {install:payload(merged),rollback:payload(baseline),receipt:{schema:'neomorphic.contributor-desk.environment-packet.v1',
    existingKeys:baseline.size,contributorKeys:changes.size,totalKeys:merged.size,preservesExistingValues:true,
    sent:false,publicEnabled:false,releaseAccepted:false}};
}

export async function readPrivateJson(file){
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await handle.stat();
    if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>256*1024||process.getuid&&stat.uid!==process.getuid())
      throw new Error('owner-only bounded regular input required');
    return JSON.parse(await handle.readFile('utf8'));
  }finally{await handle.close();}
}
export async function writePrivateJson(file,value){
  const handle=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
}
