// Local-only approximation of the Netlify routes and a temporary in-memory Blobs store.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {dispatch} from '../server/room-service.js';
import {GameError} from '../server/games/common.js';
import qr from '../netlify/functions/qr.mjs';
import {MemoryStore} from './memory-store.mjs';
const store=new MemoryStore(),root=path.resolve('public'),port=Number(process.env.PORT)||3001;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/api/game'){
   res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
   if(req.method==='GET'){res.end(JSON.stringify({ok:true,service:'moa-local'}));return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)throw new Error('too large');}
   try{res.end(JSON.stringify(await dispatch(store,JSON.parse(body))));}catch(err){if(!(err instanceof GameError))console.error(err);res.statusCode=err instanceof GameError?200:500;res.end(JSON.stringify({ok:false,error:err instanceof GameError?err.message:'서버 오류'}));}return;
  }
  if(url.pathname==='/api/qr'){
   const response=await qr(new Request(url.toString()));res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,''),file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep))throw new Error('bad path');
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Robots-Tag':'noindex, nofollow'});res.end(content);
 }catch(err){res.statusCode=404;res.end('Not found');}
});
server.listen(port,'0.0.0.0',()=>console.log(`MOA local preview: http://0.0.0.0:${port}`));
