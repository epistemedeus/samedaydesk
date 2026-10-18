// Native public joins retain the market's private boundary even with money off.
export async function protectNativeMarket(path,res,{withClient,earnedSchema}){
 if(!path.startsWith('/v1/core/tasks'))return false;
 const rows=await withClient(async client=>{
  const table=`${earnedSchema}.ae14_market_quotes`;
  if(!(await client.query('SELECT to_regclass($1) AS relation',[table])).rows[0].relation)return [];
  return (await client.query(`SELECT allocation_id FROM "${earnedSchema}".ae14_market_quotes`)).rows;
 });
 const ids=new Set(rows.map(row=>row.allocation_id)),task=path.match(/^\/v1\/core\/tasks\/([^/]+)/)?.[1];
 if(task&&ids.has(decodeURIComponent(task)))throw Object.assign(Error('not_found'),{codeName:'not_found',http:404});
 if(path==='/v1/core/tasks'){
  const json=res.json.bind(res);res.json=body=>json(Array.isArray(body?.tasks)?{...body,tasks:body.tasks.filter(task=>!ids.has(task.id))}:body);
 }
 return true;
}
