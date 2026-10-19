// One cancellable projection per installed adapter, no queue and no late paid
// result. An uncooperative dependency retains this one slot until it drains.
export function boundedReview({timeoutMs=3000}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('review_deadline_refused');
  let active=null,last={outcome:'idle',phase:'idle',cancelRequested:false,drained:true};
  return {
    status:()=>({...last,active:active?1:0,capacity:1,timeoutMs}),
    async read(run,fallback){
      if(active)return fallback('busy');
      const controller=new AbortController();let timer;
      const state={outcome:'running',phase:'source',cancelRequested:false,drained:false};last=state;
      const task=Promise.resolve().then(()=>run(controller.signal,phase=>{state.phase=phase;}));
      active=task;
      const drained=task.then(value=>({value}),error=>({failed:error})).finally(()=>{state.drained=true;if(active===task)active=null;});
      const deadline=new Promise(resolve=>{timer=setTimeout(()=>{state.outcome='timeout';state.cancelRequested=true;controller.abort();resolve({expired:true});},timeoutMs);});
      const result=await Promise.race([drained,deadline]);clearTimeout(timer);
      if(result.expired)return fallback('timeout');
      state.outcome=result.failed?'unavailable':'received';
      return result.failed?fallback('unavailable',result.failed):result.value;
    },
  };
}
