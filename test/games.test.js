import test from 'node:test';
import assert from 'node:assert/strict';
import {createTileGame,applyTileAction,tileView,combinationScore} from '../server/games/tile.js';
import {createDiceGame,applyDiceAction,diceScore,diceTotal,DICE_CATEGORIES} from '../server/games/dice.js';
import {createIslandGame,applyIslandAction,islandView,canSettle,canRoad,harborRate,produceResources,RESOURCES} from '../server/games/island.js';
const players=n=>Array.from({length:n},(_,i)=>({id:`p${i}`,name:`P${i}`}));
const t=(number,color,joker=false)=>({number,color,joker});
function setup(g){let moves=0;while(g.phase.startsWith('setup_')){const p=g.setupOrder[g.setupStep];if(g.phase==='setup_settlement'){const v=g.vertices.find(v=>canSettle(g,p,v.id,true));assert.ok(v);applyIslandAction(g,p,{type:'setup_settlement',vertex:v.id});}else{const e=g.edges.find(e=>canRoad(g,p,e.id,g.setupVertex));assert.ok(e);applyIslandAction(g,p,{type:'setup_road',edge:e.id});}assert.ok(++moves<=g.players.length*4);}}

test('tile rules: sequences, groups, joker and 13–1 boundaries',()=>{
 assert.equal(combinationScore([t(10,'blue'),t(11,'blue'),t(12,'blue')]),33);assert.equal(combinationScore([t(4,'blue'),t(4,'gold'),t(4,'coral')]),12);
 assert.equal(combinationScore([t(4,'blue'),t(4,'blue'),t(4,'coral')]),null);assert.equal(combinationScore([t(12,'blue'),t(13,'blue'),t(null,'joker',true)]),null);
 assert.equal(combinationScore([t(10,'blue'),t(null,'joker',true),t(12,'blue')]),33);assert.equal(combinationScore([t(null,'joker',true),t(null,'joker',true),t(null,'joker',true)]),null);
});
test('tile components match 2–4 and 5–6 player counts without exposing other hands',()=>{
 for(const [n,count,jokers] of [[4,106,2],[6,160,4]]){const g=createTileGame(players(n)),v=tileView(g,'p0');assert.equal(Object.keys(g.tiles).length,count);assert.equal(Object.values(g.tiles).filter(t=>t.joker).length,jokers);assert.equal(v.stockCount,count-14*n);assert.equal(v.rack.length,14);assert.equal(v.hands,undefined);assert.equal(new Set(Object.values(g.hands).flat()).size,14*n);}
});
test('tile opening requires 30 with own rack and protects previous board',()=>{
 const g=createTileGame(players(2)),find=n=>Object.values(g.tiles).find(x=>x.number===n&&x.color==='blue').id,low=[find(1),find(2),find(3)],high=[find(10),find(11),find(12)];g.hands.p0=[...low,...high];
 assert.throws(()=>applyTileAction(g,'p0',{type:'commit',board:[low]}),/30점/);applyTileAction(g,'p0',{type:'commit',board:[high]});assert.equal(g.turn,1);assert.equal(g.opened.p0,true);
 assert.throws(()=>applyTileAction(g,'p1',{type:'commit',board:[]}),/다시 테이블/);assert.deepEqual(g.hands.p0,low);
});
test('empty tile pool finishes after passes, counting jokers as 30 and preserving ties',()=>{
 const g=createTileGame(players(3));g.stock=[];const a=Object.values(g.tiles).find(t=>t.number===1&&!t.joker).id,b=Object.values(g.tiles).find(t=>t.number===1&&!t.joker&&t.id!==a).id,j=Object.values(g.tiles).find(t=>t.joker).id;g.hands={p0:[a],p1:[b],p2:[j]};
 for(const id of g.players)applyTileAction(g,id,{type:'draw'});assert.deepEqual(g.winners,['p0','p1']);assert.equal(tileView(g,'p0').penalties.p2,30);
});
test('yacht-style scorecard: combination scores, upper bonus, six-player completion',()=>{
 assert.equal(diceScore('full',[1,1,2,2,2]),8);assert.equal(diceScore('full',[1,1,1,1,1]),0);assert.equal(diceScore('small',[1,2,3,4,6]),15);
 assert.equal(diceScore('small',[1,2,4,5,6]),0);assert.equal(diceScore('large',[1,2,3,4,5]),30);assert.equal(diceScore('yacht',[3,3,3,3,3]),50);
 assert.equal(diceTotal({ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18}),98);
 const g=createDiceGame(players(6));for(const [cat] of DICE_CATEGORIES)for(const pid of g.players){assert.equal(g.players[g.turn],pid);applyDiceAction(g,pid,{type:'roll'});applyDiceAction(g,pid,{type:'score',category:cat});}assert.ok(g.winner);assert.ok(g.players.every(p=>Object.keys(g.scores[p]).length===12));
});
test('island board: 19/30 hexes, ports, resource mix, component counts and no adjacent 6/8',()=>{
 for(const [n,tiles,vertices,edges,ports,deck,bank] of [[3,19,54,72,9,25,19],[6,30,80,109,11,34,24]])for(let trial=0;trial<15;trial++){
  const g=createIslandGame(players(n));assert.equal(g.tiles.length,tiles);assert.equal(g.vertices.length,vertices);assert.equal(g.edges.length,edges);assert.equal(g.ports.length,ports);assert.equal(g.devDeck.length,deck);assert.equal(g.bank.wood,bank);
  assert.ok(g.vertices.every(v=>v.edges.length===2||v.edges.length===3));assert.ok(g.ports.every(p=>g.edges[p.edge].tiles.length===1));
  assert.equal(new Set(g.ports.flatMap(p=>{let e=g.edges[p.edge];return [e.a,e.b];})).size,ports*2);
  assert.ok(!g.edges.some(e=>e.tiles.length===2&&e.tiles.every(id=>[6,8].includes(g.tiles[id].number))));
  const seen=new Set([0]),stack=[0];while(stack.length){const v=g.vertices[stack.pop()];for(const eid of v.edges){const e=g.edges[eid],o=e.a===v.id?e.b:e.a;if(!seen.has(o)){seen.add(o);stack.push(o);}}}assert.equal(seen.size,vertices);
 }
});
test('island setup and card supply conserve bank resources',()=>{
 const g=createIslandGame(players(6));setup(g);assert.equal(g.phase,'roll');assert.equal(g.vertices.filter(v=>v.owner).length,12);assert.equal(g.edges.filter(e=>e.owner).length,12);
 for(const r of RESOURCES)assert.equal(g.bank[r]+g.players.reduce((n,p)=>n+g.data[p].resources[r],0),24);
 const v=islandView(g,'p0');assert.equal(v.data,undefined);assert.equal(v.devDeck,undefined);assert.equal(v.publicPlayers.p1.resources,undefined);assert.throws(()=>applyIslandAction(g,'p1',{type:'roll'}),/차례/);
});
test('harbors adjust rate and bank exchanges preserve limited supply',()=>{
 const g=createIslandGame(players(3)),generic=g.ports.find(p=>p.type==='generic'),wood=g.ports.find(p=>p.type==='wood');
 assert.equal(harborRate(g,'p0','wood'),4);g.vertices[g.edges[generic.edge].a].owner='p0';assert.equal(harborRate(g,'p0','brick'),3);g.vertices[g.edges[wood.edge].a].owner='p0';assert.equal(harborRate(g,'p0','wood'),2);
 g.phase='main';g.data.p0.resources.wood=2;const w=g.bank.wood,b=g.bank.brick;applyIslandAction(g,'p0',{type:'bank_trade',give:'wood',want:'brick'});assert.equal(g.bank.wood,w+2);assert.equal(g.bank.brick,b-1);assert.equal(g.data.p0.resources.brick,1);
 g.bank.brick=0;g.data.p0.resources.wood=2;assert.throws(()=>applyIslandAction(g,'p0',{type:'bank_trade',give:'wood',want:'brick'}),/없어요/);
});
test('scarce bank pays nobody when multiple players need a resource, or remainder to a sole player',()=>{
 const g=createIslandGame(players(3));const tile=g.tiles.find(t=>t.resource==='wood');g.tiles.forEach(t=>t.number=null);tile.number=5;g.robber=g.tiles.find(t=>t.id!==tile.id).id;const [a,b]=tile.vertices;g.vertices[a].owner='p0';g.vertices[a].level=2;g.vertices[b].owner='p1';g.vertices[b].level=1;g.bank.wood=1;
 produceResources(g,5);assert.equal(g.data.p0.resources.wood,0);assert.equal(g.data.p1.resources.wood,0);g.vertices[b].owner=null;produceResources(g,5);assert.equal(g.data.p0.resources.wood,1);assert.equal(g.bank.wood,0);
});
test('5–6 players use old special building phase, no trading, skip non-builders',()=>{
 const g=createIslandGame(players(6));setup(g);for(const p of g.players)for(const r of RESOURCES)g.data[p].resources[r]=0;
 g.data.p1.resources.wood=1;g.data.p1.resources.brick=1;g.data.p4.resources.wheat=1;g.data.p4.resources.sheep=1;g.data.p4.resources.ore=1;g.phase='main';
 applyIslandAction(g,'p0',{type:'end_turn'});assert.equal(g.phase,'special');assert.equal(islandView(g,'p1').turn,'p1');
 assert.throws(()=>applyIslandAction(g,'p1',{type:'bank_trade',give:'wood',want:'brick'}),/은행/);assert.throws(()=>applyIslandAction(g,'p1',{type:'offer_trade',give:{wood:1},want:{ore:1}}),/교환/);
 const edge=g.edges.find(e=>canRoad(g,'p1',e.id));assert.ok(edge);applyIslandAction(g,'p1',{type:'build_road',edge:edge.id});applyIslandAction(g,'p1',{type:'end_turn'});assert.equal(islandView(g,'p4').turn,'p4');
 const old=g.devDeck.length;applyIslandAction(g,'p4',{type:'buy_development'});assert.equal(g.devDeck.length,old-1);applyIslandAction(g,'p4',{type:'end_turn'});assert.equal(g.phase,'roll');assert.equal(g.players[g.turn],'p1');
});
test('development card can be played before rolling and returns to roll after robber',()=>{
 const g=createIslandGame(players(3));g.phase='roll';g.turnNumber=1;g.data.p0.dev.push({type:'knight',boughtTurn:0});applyIslandAction(g,'p0',{type:'play_development',card:'knight'});assert.equal(g.phase,'robber');
 const target=g.tiles.find(t=>t.id!==g.robber).id;applyIslandAction(g,'p0',{type:'move_robber',tile:target});assert.equal(g.phase,'roll');assert.equal(g.devUsed,true);applyIslandAction(g,'p0',{type:'roll'});assert.notEqual(g.phase,'roll');
});
test('island players can exchange multiple resource types without involving the bank',()=>{
 const g=createIslandGame(players(3));g.phase='main';g.data.p0.resources.wood=2;g.data.p0.resources.brick=1;g.data.p1.resources.wheat=2;g.data.p1.resources.sheep=1;const bank={...g.bank};
 applyIslandAction(g,'p0',{type:'offer_trade',give:{wood:2,brick:1},want:{wheat:2,sheep:1}});applyIslandAction(g,'p1',{type:'accept_trade'});
 assert.deepEqual(g.data.p0.resources,{wood:0,brick:0,wheat:2,sheep:1,ore:0});assert.deepEqual(g.data.p1.resources,{wood:2,brick:1,wheat:0,sheep:0,ore:0});assert.deepEqual(g.bank,bank);assert.equal(g.trade,null);
});
test('concurrent robber discards must use exactly the required quantity',()=>{
 const g=createIslandGame(players(3));g.phase='discard';g.afterRobber='main';g.pendingDiscards={p0:4,p1:5};g.data.p0.resources.wood=8;g.data.p1.resources.brick=10;
 assert.throws(()=>applyIslandAction(g,'p0',{type:'discard',cards:{wood:3}}),/4개/);applyIslandAction(g,'p1',{type:'discard',cards:{brick:5}});assert.equal(g.phase,'discard');applyIslandAction(g,'p0',{type:'discard',cards:{wood:4}});assert.equal(g.phase,'robber');assert.equal(g.data.p1.resources.brick,5);
});
