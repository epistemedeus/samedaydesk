// One cancellable projection per installed adapter, no queue and no late paid
// result. An uncooperative dependency retains this one slot until its promise
// settles; clearing the slot at abort is not cancellation. A query that has
// already entered bindReadLifetime runs until that call settles. A cooperating
// Postgres statement is bounded by the read transaction's statement_timeout.
// This module does not cancel another backend or borrow another connection.
export function boundedReview({timeoutMs=3000}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('review_deadline_refused');
  let active=null,last={outcome:'idle',phase:'idle',cancelRequested:false,drained:true};
  return {
    status:()=>({...last,active:active?1:0,capacity:1,timeoutMs}),
    async read(run,fallback,parent){
      if(active)return fallback('busy');
      // Already cancelled: do not start the dependency or take the slot.
      if(parent?.aborted)return fallback('cancelled');
      const controller=new AbortController();let timer=null,settled=false;
      const state={outcome:'running',phase:'source',cancelRequested:false,drained:false};last=state;
      let resolveDeadline=()=>{};
      const deadline=new Promise(resolve=>{resolveDeadline=resolve;});
      const finish=reason=>{
        if(settled)return;
        settled=true;state.outcome=reason;state.cancelRequested=true;controller.abort();
        clearTimeout(timer);resolveDeadline({expired:true});
      };
      const onParent=()=>finish('cancelled');
      if(parent)parent.addEventListener('abort',onParent,{once:true});
      const task=Promise.resolve().then(()=>run(controller.signal,phase=>{state.phase=phase;}));
      active=task;
      const drained=task.then(value=>({value}),error=>({failed:error})).finally(()=>{state.drained=true;if(active===task)active=null;});
      timer=setTimeout(()=>finish('timeout'),timeoutMs);
      try{
        const result=await Promise.race([drained,deadline]);
        settled=true;clearTimeout(timer);
        if(result?.expired)return fallback(state.outcome==='cancelled'?'cancelled':'timeout');
        state.outcome=result.failed?'unavailable':'received';
        return result.failed?fallback('unavailable',result.failed):result.value;
      }finally{parent?.removeEventListener('abort',onParent);}
    },
  };
}

const refuseCancelled=()=>{throw Object.assign(new Error('read_cancelled'),{codeName:'read_cancelled'});};

// The fenced query port is the only client a nested read may hold. close()
// refuses every query that has not yet entered. quiesce() then waits for the
// queries that already entered so the owner can commit or release afterwards.
export function bindReadLifetime(client){
  if(!client||typeof client.query!=='function')throw Error('read_client_required');
  let closed=false,inflight=0;const waiters=[];
  const wake=()=>{if(inflight===0)for(const resolve of waiters.splice(0))resolve();};
  return {
    get closed(){return closed;},
    close(){closed=true;},
    client:{
      query(...args){
        if(closed)refuseCancelled();
        if(args.length>2||typeof args[1]==='function'||typeof args[2]==='function')refuseCancelled();
        inflight+=1;
        if(closed){inflight-=1;wake();refuseCancelled();}
        try{
          const pending=client.query(...args);
          return Promise.resolve(pending).finally(()=>{inflight-=1;wake();});
        }catch(error){inflight-=1;wake();throw error;}
      },
    },
    async quiesce(){
      closed=true;
      if(inflight===0)return;
      await new Promise(resolve=>waiters.push(resolve));
    },
  };
}
