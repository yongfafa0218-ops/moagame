import QRCode from 'qrcode';
export default async function handler(request){
 try{
  const url=new URL(request.url),value=url.searchParams.get('url')||'',link=new URL(value);
  if(value.length>400||link.origin!==url.origin||link.pathname!=='/'||!/^[A-HJ-NP-Z2-9]{8}$/.test(link.searchParams.get('room')||''))return new Response('Invalid invitation',{status:400});
  const png=await QRCode.toBuffer(value,{type:'png',width:280,margin:1,color:{dark:'#213c34',light:'#ffffff'}});
  return new Response(png,{headers:{'content-type':'image/png','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
 }catch{return new Response('Invalid invitation',{status:400});}
}
export const config={path:'/api/qr',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
