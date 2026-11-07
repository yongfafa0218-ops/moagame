import test from 'node:test';
import assert from 'node:assert/strict';
import {getStore} from '@netlify/blobs';
import {dispatch} from '../server/room-service.js';

test('installed Netlify Blobs SDK sends If-Match/If-None-Match and uses the strong-read endpoint',async()=>{
 const values=new Map(),calls=[];let counter=0;
 const fakeFetch=async(url,options)=>{
  const u=new URL(url),headers=new Headers(options.headers),method=options.method.toUpperCase(),key=u.pathname;
  calls.push({origin:u.origin,method,match:headers.get('if-match'),none:headers.get('if-none-match')});const prior=values.get(key);
  if(method==='GET')return prior?new Response(prior.body,{headers:{etag:prior.etag,'content-type':'application/json'}}):new Response(null,{status:404});
  if(method==='PUT'){
   if(headers.get('if-none-match')==='*'&&prior||headers.get('if-match')&&prior?.etag!==headers.get('if-match'))return new Response(null,{status:412});
   const etag=`"v${++counter}"`;values.set(key,{body:options.body,etag});return new Response(null,{status:200,headers:{etag}});
  }throw Error(`unexpected ${method}`);
 };
 const store=getStore({name:'test',siteID:'test',token:'test',edgeURL:'https://edge.invalid',uncachedEdgeURL:'https://strong.invalid',consistency:'strong',fetch:fakeFetch});
 const host=await dispatch(store,{cmd:'room:create',data:{name:'호스트',game:'tile'}});
 const guests=await Promise.all(Array.from({length:5},(_,i)=>dispatch(store,{cmd:'room:join',data:{code:host.code,name:`친구${i}`}})));
 const final=await dispatch(store,{cmd:'room:state',code:host.code,token:host.token});assert.equal(final.room.players.length,6);assert.equal(new Set(guests.map(x=>x.playerId)).size,5);
 assert.ok(calls.some(c=>c.method==='PUT'&&c.none==='*'));assert.ok(calls.some(c=>c.method==='PUT'&&c.match));assert.ok(calls.filter(c=>c.method==='GET').every(c=>c.origin==='https://strong.invalid'));
});
