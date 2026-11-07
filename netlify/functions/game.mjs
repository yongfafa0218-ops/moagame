import {getStore} from '@netlify/blobs';
import {dispatch} from '../../server/room-service.js';
import {GameError} from '../../server/games/common.js';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
export default async function handler(request){
 if(request.method==='GET')return new Response(JSON.stringify({ok:true,service:'moa'}),{headers});
 if(request.method!=='POST')return new Response(JSON.stringify({ok:false,error:'허용되지 않은 요청이에요.'}),{status:405,headers});
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return new Response(JSON.stringify({ok:false,error:'요청 출처를 확인해 주세요.'}),{status:403,headers});
  const raw=await request.text();if(raw.length>65536)return new Response(JSON.stringify({ok:false,error:'요청이 너무 커요.'}),{status:413,headers});
  const body=JSON.parse(raw);
  const store=getStore({name:'moa-rooms-v2',consistency:'strong'});
  return new Response(JSON.stringify(await dispatch(store,body)),{headers});
 }catch(err){
  if(!(err instanceof GameError))console.error('game function error',err);
  return new Response(JSON.stringify({ok:false,error:err instanceof GameError?err.message:'서버 연결에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'}),{status:err instanceof GameError?200:500,headers});
 }
}
export const config={path:'/api/game',rateLimit:{windowLimit:420,windowSize:60,aggregateBy:['ip','domain']}};
