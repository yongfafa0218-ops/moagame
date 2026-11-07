import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../server/room-service.js';
import {MemoryStore} from '../scripts/memory-store.mjs';
const command=(store,cmd,code,token,data={},opId)=>dispatch(store,{cmd,code,token,data,opId});
async function setup(store,type='tile'){
 const host=await command(store,'room:create','','',{name:'방장',game:type});
 const guests=await Promise.all(Array.from({length:5},(_,i)=>command(store,'room:join',host.code,'',{code:host.code,name:`친구${i+1}`})));
 return [host,...guests];
}
test('concurrent 6-person joins are atomic, seventh is rejected, hands remain private',async()=>{
 const store=new MemoryStore(),cs=await setup(store);const host=cs[0],code=host.code;assert.equal(new Set(cs.map(x=>x.playerId)).size,6);assert.equal(host.code.length,8);
 await assert.rejects(()=>command(store,'room:join',code,'',{code,name:'초과'}),/6명/);
 await command(store,'room:start',code,host.token);
 const states=await Promise.all(cs.map(c=>command(store,'room:state',code,c.token)));
 assert.ok(states.every(s=>s.room.players.length===6));assert.ok(states.every(s=>s.room.game.rack.length===14));assert.equal(new Set(states.flatMap(s=>s.room.game.rack.map(t=>t.id))).size,84);
 for(const state of states){assert.equal(state.room.game.hands,undefined);assert.equal(state.room.game.tiles,undefined);assert.ok(state.room.players.every(p=>p.token===undefined));}
 await assert.rejects(()=>command(store,'room:state',code,'fake'),/참가 자격/);
 const reconnect=await command(store,'room:join',code,'',{code,token:cs[2].token,name:'무시됨'});assert.equal(reconnect.playerId,cs[2].playerId);assert.deepEqual(reconnect.room.game.rack,states[2].room.game.rack);
 const noChange=await dispatch(store,{cmd:'room:state',code,token:host.token,knownVersion:states[0].version,knownPresence:states[0].presence});assert.equal(noChange.unchanged,true);assert.equal(noChange.room,undefined);
});
test('same retried action is applied once, stale/forged/out-of-turn actions are rejected',async()=>{
 const store=new MemoryStore(),cs=await setup(store),host=cs[0],code=host.code;await command(store,'room:start',code,host.token);
 await assert.rejects(()=>command(store,'game:action',code,cs[1].token,{type:'draw'}),/차례/);
 const id='same-operation-id-123';const pair=await Promise.all([command(store,'game:action',code,host.token,{type:'draw'},id),command(store,'game:action',code,host.token,{type:'draw'},id)]);
 assert.ok(pair.every(x=>x.ok));assert.ok(pair.some(x=>x.replayed));const state=await command(store,'room:state',code,host.token);assert.equal(state.room.game.rack.length,15);assert.equal(state.room.game.turn,cs[1].playerId);
});
test('6 players complete island placement through storage service and enter first turn',async()=>{
 const store=new MemoryStore(),cs=await setup(store,'island'),host=cs[0],code=host.code;await command(store,'room:start',code,host.token);let view=(await command(store,'room:state',code,host.token)).room.game,moves=0;
 while(view.phase.startsWith('setup_')){
  const current=cs.find(c=>c.playerId===view.turn);const own=(await command(store,'room:state',code,current.token)).room.game;const settle=own.phase==='setup_settlement',targets=settle?own.legal.settlements:own.legal.roads;assert.ok(targets.length);
  await command(store,'game:action',code,current.token,settle?{type:'setup_settlement',vertex:targets[0]}:{type:'setup_road',edge:targets[0]});view=(await command(store,'room:state',code,host.token)).room.game;assert.ok(++moves<=24);
 }
 assert.equal(moves,24);assert.equal(view.phase,'roll');assert.equal(view.tiles.length,30);assert.equal(view.ports.length,11);
});
test('host can remove lobby player; join token cannot read after removal',async()=>{
 const store=new MemoryStore(),cs=await setup(store),host=cs[0],code=host.code;await command(store,'room:remove',code,host.token,{playerId:cs[2].playerId});await assert.rejects(()=>command(store,'room:state',code,cs[2].token),/참가 자격/);
});
test('a missing ETag fails closed instead of silently overwriting room data',async()=>{
 const store=new MemoryStore(),host=await command(store,'room:create','','',{name:'호스트',game:'tile'});const realGet=store.getWithMetadata.bind(store);
 store.getWithMetadata=async(...args)=>{const entry=await realGet(...args);if(entry)delete entry.etag;return entry;};
 await assert.rejects(()=>command(store,'room:join',host.code,'',{code:host.code,name:'손님'}),/refusing unsafe/);
 const saved=await realGet(`rooms/${host.code}`);assert.equal(saved.data.players.length,1);
});
test('prototype names cannot be used as forged game modes',async()=>{
 const store=new MemoryStore();for(const game of ['__proto__','constructor','toString'])await assert.rejects(()=>command(store,'room:create','','',{name:'x',game}),/게임을 선택/);
 const host=await command(store,'room:create','','',{name:'x',game:'tile'});await assert.rejects(()=>command(store,'room:change_game',host.code,host.token,{game:'constructor'}),/게임을 선택/);
});
test('six simultaneous robber discards all survive conditional-write conflicts',async()=>{
 const store=new MemoryStore(),cs=await setup(store,'island'),host=cs[0],code=host.code;await command(store,'room:start',code,host.token);
 const key=`rooms/${code}`,entry=await store.getWithMetadata(key),g=entry.data.game;g.phase='discard';g.pendingDiscards=Object.fromEntries(g.players.map(id=>[id,4]));g.afterRobber='main';
 for(const id of g.players)for(const r of ['wood','brick','wheat','sheep']){g.data[id].resources[r]=2;g.bank[r]-=2;}
 await store.setJSON(key,entry.data,{onlyIfMatch:entry.etag});
 await Promise.all(cs.map(c=>command(store,'game:action',code,c.token,{type:'discard',cards:{wood:1,brick:1,wheat:1,sheep:1}})));
 const state=(await command(store,'room:state',code,host.token)).room.game;assert.equal(state.phase,'robber');assert.equal(state.pendingCount,0);for(const c of cs)assert.equal(state.publicPlayers[c.playerId].resourceCount,4);for(const r of ['wood','brick','wheat','sheep'])assert.equal(state.bank[r],18);
});
