/* Netlify serverless transport. The app keeps its event API; updates are polled. */
(() => {
  const POLL_MS=3000, HIDDEN_POLL_MS=12000;
  function io(){
    const handlers=new Map();let code='',token='',version=-1,presence='',connected=false,failures=0,pollTimer=null,polling=false,healthTimer=null,busy=false;
    function fire(event,...args){for(const fn of handlers.get(event)||[])try{fn(...args);}catch(err){console.error(err);}}
    function connection(ok){if(ok){failures=0;if(!connected){connected=true;fire('connect');}}else if(++failures>=2&&connected){connected=false;fire('disconnect');}}
    function schedulePoll(ms=POLL_MS){clearTimeout(pollTimer);if(code&&token)pollTimer=setTimeout(poll,ms);}
    function applyState(resp){
      if(!resp.room)return;
      if(resp.room.code!==code)return;
      // A slower response must not roll the UI back to an older game state.
      if(resp.version<version)return;
      if(resp.version!==version||resp.presence!==presence){version=resp.version;presence=resp.presence;fire('room:state',resp.room);}
    }
    async function fetchApi(payload,ms=16000){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
      try{
        const response=await fetch('/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'서버 응답 오류');
        connection(true);return result;
      }finally{clearTimeout(timer);}
    }
    async function health(){
      clearTimeout(healthTimer);
      try{const r=await fetch('/api/game',{cache:'no-store'});if(!r.ok)throw new Error('offline');connection(true);if(code)schedulePoll(0);}
      catch{connection(false);healthTimer=setTimeout(health,5000);}
    }
    async function poll(){
      if(!code||!token||polling)return;polling=true;const activeCode=code;
      try{
        const result=await fetchApi({cmd:'room:state',code,token,knownVersion:version,knownPresence:presence});
        if(code!==activeCode)return;
        if(!result.ok){
          if(/방에서 나왔|참가 자격|찾지 못했|닫힌 방/.test(result.error||'')){code='';token='';version=-1;presence='';fire('room:removed');return;}
        }else if(!result.unchanged)applyState(result);
      }catch{connection(false);}
      finally{polling=false;if(code)schedulePoll(document.hidden?HIDDEN_POLL_MS:POLL_MS);}
    }
    function opId(){return globalThis.crypto?.randomUUID?.()||`op-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
    const client={
      on(event,fn){if(!handlers.has(event))handlers.set(event,[]);handlers.get(event).push(fn);return client;},
      timeout(){return client;},
      emit(cmd,data={},callback=()=>{}){
        if(busy){callback(null,{ok:false,error:'요청을 처리하는 중이에요. 잠시만 기다려 주세요.'});return client;}
        busy=true;
        const body={cmd,data,code:cmd==='room:join'?data.code:code,token,opId:opId()};
        fetchApi(body).then(result=>{
          if(result.ok&&(cmd==='room:create'||cmd==='room:join')){code=result.code;token=result.token;version=-1;presence='';}
          if(result.ok&&result.left){code='';token='';version=-1;presence='';clearTimeout(pollTimer);}
          else if(result.ok)applyState(result);
          busy=false;callback(null,result);if(code)schedulePoll();
        }).catch(err=>{busy=false;connection(false);callback(err,null);if(code)schedulePoll(3000);else healthTimer=setTimeout(health,4000);});
        return client;
      }
    };
    window.addEventListener('offline',()=>{failures=2;connection(false);});
    window.addEventListener('online',()=>health());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&code)schedulePoll(0);});
    setTimeout(health,0);return client;
  }
  window.io=io;
})();
