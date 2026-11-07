import { demand, die, GameError, shuffle, randomIndex } from './common.js';

export const RESOURCES = ['wood','brick','wheat','sheep','ore'];
export const COSTS = {
  road:{wood:1,brick:1}, settlement:{wood:1,brick:1,wheat:1,sheep:1},
  city:{wheat:2,ore:3}, development:{wheat:1,sheep:1,ore:1}
};
const emptyResources = () => Object.fromEntries(RESOURCES.map(r=>[r,0]));
const total = r => RESOURCES.reduce((n,k)=>n+(r[k]||0),0);
const canAfford = (resources,cost) => Object.entries(cost).every(([k,n])=>(resources[k]||0)>=n);
const pay = (resources,cost) => { for(const [k,n] of Object.entries(cost)) resources[k]-=n; };
const payBank = (g,resources,cost) => { pay(resources,cost);for(const [k,n] of Object.entries(cost)) g.bank[k]+=n; };
const active = g => g.phase.startsWith('setup_') ? g.setupOrder[g.setupStep]
  : g.phase==='special' ? g.players[(g.turn+g.specialIndex)%g.players.length] : g.players[g.turn];

// Own board art and a randomly shuffled, familiar-size land map.
function makeMap(playerCount) {
  const extended=playerCount>=5, radius=extended?3:2, coords=[];
  for(let r=-radius;r<=radius;r++) for(let q=-radius;q<=radius;q++) {
    // 3/4 players: 19 hexes; 5/6 players: 30 hexes (rows 3,4,5,6,5,4,3).
    const inHex=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=radius;
    const firstQ=Math.max(-radius,-r-radius),rowLength=[3,4,5,6,5,4,3][r+3];
    if(inHex && (!extended || q<firstQ+rowLength)) coords.push({q,r});
  }
  const counts=extended?{wood:6,brick:5,wheat:6,sheep:6,ore:5,desert:2}
    :{wood:4,brick:3,wheat:4,sheep:4,ore:3,desert:1};
  const resources=shuffle(Object.entries(counts).flatMap(([k,n])=>Array(n).fill(k)));
  const vertices=[],vMap=new Map(),edges=[],eMap=new Map(),tiles=[];
  const key=(x,y)=>`${Math.round(x*10000)/10000},${Math.round(y*10000)/10000}`;
  for(let i=0;i<coords.length;i++) {
    const {q,r}=coords[i],x=Math.sqrt(3)*(q+r/2),y=1.5*r;
    const t={id:i,q,r,x,y,resource:resources[i],number:null,vertices:[]};
    for(let corner=0;corner<6;corner++) {
      const angle=(60*corner-30)*Math.PI/180,vx=x+Math.cos(angle),vy=y+Math.sin(angle),k=key(vx,vy);
      if(!vMap.has(k)){vMap.set(k,vertices.length);vertices.push({id:vertices.length,x:vx,y:vy,owner:null,level:0,tiles:[],edges:[]});}
      const vid=vMap.get(k);t.vertices.push(vid);vertices[vid].tiles.push(i);
    }
    for(let side=0;side<6;side++) {
      const a=t.vertices[side],b=t.vertices[(side+1)%6],ek=[a,b].sort((u,v)=>u-v).join(':');
      if(!eMap.has(ek)){const eid=edges.length;eMap.set(ek,eid);edges.push({id:eid,a,b,owner:null,tiles:[]});vertices[a].edges.push(eid);vertices[b].edges.push(eid);}
      edges[eMap.get(ek)].tiles.push(i);
    }
    tiles.push(t);
  }
  const numbers=extended?[2,2,3,3,3,4,4,4,5,5,5,6,6,6,8,8,8,9,9,9,10,10,10,11,11,11,12,12]
    :[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];
  const productive=tiles.filter(t=>t.resource!=='desert');
  // Avoid placing the strongest numbers 6 and 8 on adjacent hexes.
  for(let tries=0;tries<500;tries++) {
    const shuffled=shuffle(numbers);productive.forEach((t,i)=>t.number=shuffled[i]);
    if(!edges.some(e=>e.tiles.length===2&&e.tiles.every(id=>[6,8].includes(tiles[id].number)))) break;
  }
  // Choose distinct coastal edges, spaced around the perimeter, for harbor rates.
  const cx=vertices.reduce((n,v)=>n+v.x,0)/vertices.length,cy=vertices.reduce((n,v)=>n+v.y,0)/vertices.length;
  const coast=edges.filter(e=>e.tiles.length===1).sort((a,b)=>{
    const angle=e=>Math.atan2((vertices[e.a].y+vertices[e.b].y)/2-cy,(vertices[e.a].x+vertices[e.b].x)/2-cx);
    return angle(a)-angle(b);
  });
  const kinds=shuffle([...RESOURCES,...Array(extended?5:4).fill('generic'),...(extended?['sheep']:[])]);
  const used=new Set(),ports=[];
  for(let i=0;i<kinds.length;i++) {
    const start=Math.round(i*coast.length/kinds.length)%coast.length;
    const candidates=coast.map((e,j)=>({e,d:Math.min((j-start+coast.length)%coast.length,(start-j+coast.length)%coast.length)})).sort((a,b)=>a.d-b.d);
    const pick=candidates.find(({e})=>!used.has(e.a)&&!used.has(e.b));
    if(!pick) throw new Error('Unable to place ports');
    used.add(pick.e.a);used.add(pick.e.b);ports.push({edge:pick.e.id,type:kinds[i]});
  }
  return {tiles,vertices,edges,ports,robber:tiles.find(t=>t.resource==='desert').id};
}
function pieceCount(g,pid,level){return g.vertices.filter(v=>v.owner===pid&&v.level===level).length;}
function roadCount(g,pid){return g.edges.filter(e=>e.owner===pid).length;}
function adjacentVertices(g,vid){return g.vertices[vid].edges.map(eid=>{const e=g.edges[eid];return e.a===vid?e.b:e.a;});}
export function canSettle(g,pid,vid,setup=false){
  const v=g.vertices[vid];if(!v||v.owner||pieceCount(g,pid,1)>=5)return false;
  if(adjacentVertices(g,vid).some(n=>g.vertices[n].owner))return false;
  return setup||v.edges.some(eid=>g.edges[eid].owner===pid);
}
export function canRoad(g,pid,eid,setupVertex=null){
  const e=g.edges[eid];if(!e||e.owner||roadCount(g,pid)>=15)return false;
  if(setupVertex!==null)return e.a===setupVertex||e.b===setupVertex;
  return [e.a,e.b].some(vid=>{const v=g.vertices[vid];if(v.owner&&v.owner!==pid)return false;return v.owner===pid||v.edges.some(other=>other!==eid&&g.edges[other].owner===pid);});
}
function roadLength(g,pid){
  const own=g.edges.filter(e=>e.owner===pid);if(!own.length)return 0;
  const walk=(vid,used)=>{
    if(used.size&&g.vertices[vid].owner&&g.vertices[vid].owner!==pid)return 0;
    let best=0;for(const eid of g.vertices[vid].edges){const e=g.edges[eid];if(e.owner!==pid||used.has(eid))continue;
      used.add(eid);best=Math.max(best,1+walk(e.a===vid?e.b:e.a,used));used.delete(eid);}
    return best;
  };
  return Math.max(...own.flatMap(e=>[walk(e.a,new Set()),walk(e.b,new Set())]));
}
function awardHolder(previous,values,threshold){const max=Math.max(...Object.values(values));if(max<threshold)return null;const leaders=Object.keys(values).filter(p=>values[p]===max);return leaders.length===1?leaders[0]:(previous&&leaders.includes(previous)?previous:null);}
function updateAwards(g){
  const lengths=Object.fromEntries(g.players.map(p=>[p,roadLength(g,p)])),armies=Object.fromEntries(g.players.map(p=>[p,g.data[p].knights]));
  g.roadLengths=lengths;g.longestRoad=awardHolder(g.longestRoad,lengths,5);g.largestArmy=awardHolder(g.largestArmy,armies,3);
}
function publicPoints(g,pid){return g.vertices.filter(v=>v.owner===pid).reduce((n,v)=>n+v.level,0)+(g.longestRoad===pid?2:0)+(g.largestArmy===pid?2:0);}
function truePoints(g,pid){return publicPoints(g,pid)+g.data[pid].dev.filter(d=>d.type==='point').length;}
function checkWin(g,pid){if(truePoints(g,pid)>=g.target){g.winner=pid;g.phase='finished';g.trade=null;return true;}return false;}
function normalizeOffer(x){
  const result=emptyResources();demand(x&&typeof x==='object'&&!Array.isArray(x),'교환 자원을 확인해 주세요.');
  for(const k of RESOURCES){const n=x[k]??0;demand(Number.isInteger(n)&&n>=0&&n<=30,'교환 수량을 확인해 주세요.');result[k]=n;}return result;
}
function beginNextTurn(g){g.trade=null;g.turn=(g.turn+1)%g.players.length;g.turnNumber++;g.devUsed=false;g.lastDice=null;g.specialIndex=0;g.phase='roll';checkWin(g,g.players[g.turn]);}
function canSpecialBuild(g,pid){
  const r=g.data[pid].resources;
  return (canAfford(r,COSTS.road)&&g.edges.some(e=>canRoad(g,pid,e.id)))
    ||(canAfford(r,COSTS.settlement)&&g.vertices.some(v=>canSettle(g,pid,v.id)))
    ||(canAfford(r,COSTS.city)&&pieceCount(g,pid,2)<4&&g.vertices.some(v=>v.owner===pid&&v.level===1))
    ||(canAfford(r,COSTS.development)&&g.devDeck.length>0);
}
function nextSpecial(g){
  while(g.specialIndex<g.players.length&&!canSpecialBuild(g,g.players[(g.turn+g.specialIndex)%g.players.length]))g.specialIndex++;
  if(g.specialIndex>=g.players.length)beginNextTurn(g);else g.phase='special';
}

function eligibleVictims(g,tileId,pid){return [...new Set(g.tiles[tileId].vertices.map(v=>g.vertices[v].owner).filter(p=>p&&p!==pid&&total(g.data[p].resources)>0))];}
function rob(g,from,to){const choices=RESOURCES.flatMap(r=>Array(g.data[from].resources[r]).fill(r));if(choices.length){const r=choices[randomIndex(choices.length)];g.data[from].resources[r]--;g.data[to].resources[r]++;}}
export function harborRate(g,pid,resource){
  let rate=4;
  for(const port of g.ports){const e=g.edges[port.edge];if([e.a,e.b].some(v=>g.vertices[v].owner===pid)){
    if(port.type==='generic')rate=Math.min(rate,3);if(port.type===resource)rate=2;
  }}return rate;
}
// Limited physical bank: if several players need a scarce type, none receives it;
// if only one player is affected, that player takes the remaining supply.
export function produceResources(g,value){
  const claims=Object.fromEntries(RESOURCES.map(r=>[r,{}]));
  for(const t of g.tiles) if(t.number===value&&t.id!==g.robber&&t.resource!=='desert') for(const vid of t.vertices){
    const v=g.vertices[vid];if(v.owner)claims[t.resource][v.owner]=(claims[t.resource][v.owner]||0)+v.level;
  }
  for(const r of RESOURCES){const entries=Object.entries(claims[r]),needed=entries.reduce((n,[,amount])=>n+amount,0);if(!needed)continue;
    if(needed<=g.bank[r])for(const [pid,n] of entries){g.data[pid].resources[r]+=n;g.bank[r]-=n;}
    else if(entries.length===1){const [pid,n]=entries[0],available=Math.min(n,g.bank[r]);g.data[pid].resources[r]+=available;g.bank[r]-=available;}
  }
}
export function createIslandGame(players){
  const ids=players.map(p=>p.id),extended=ids.length>=5,map=makeMap(ids.length);
  const deck=shuffle([...Array(extended?20:14).fill('knight'),...Array(5).fill('point'),...Array(extended?3:2).fill('road'),...Array(extended?3:2).fill('plenty'),...Array(extended?3:2).fill('monopoly')]);
  return {kind:'island',players:ids,...map,data:Object.fromEntries(ids.map(p=>[p,{resources:emptyResources(),dev:[],knights:0}])),
    bank:Object.fromEntries(RESOURCES.map(r=>[r,extended?24:19])),setupOrder:[...ids,...[...ids].reverse()],setupStep:0,setupVertex:null,phase:'setup_settlement',turn:0,turnNumber:0,specialIndex:0,
    lastDice:null,pendingDiscards:{},victims:[],afterRobber:'main',freeRoadsLeft:0,afterFreeRoads:'main',trade:null,devDeck:deck,devUsed:false,
    roadLengths:Object.fromEntries(ids.map(p=>[p,0])),longestRoad:null,largestArmy:null,target:10,winner:null,revision:1};
}
export function applyIslandAction(g,pid,action){
  demand(!g.winner,'이미 끝난 게임이에요.');demand(g.players.includes(pid),'이 방의 플레이어가 아니에요.');
  const actor=active(g),me=g.data[pid];
  if(action.type==='discard'){
    demand(g.phase==='discard'&&g.pendingDiscards[pid]>0,'지금 버릴 카드가 없어요.');const cards=normalizeOffer(action.cards);
    demand(total(cards)===g.pendingDiscards[pid],`자원 ${g.pendingDiscards[pid]}개를 골라 주세요.`);demand(canAfford(me.resources,cards),'가지고 있는 자원만 버릴 수 있어요.');
    payBank(g,me.resources,cards);delete g.pendingDiscards[pid];if(!Object.keys(g.pendingDiscards).length)g.phase='robber';
  }else if(action.type==='accept_trade'){
    demand(g.phase==='main'&&g.trade&&pid!==g.trade.from,'수락할 교환 제안이 없어요.');const t=g.trade,giver=g.data[t.from].resources;
    demand(canAfford(giver,t.give),'제안자의 자원이 부족해졌어요.');demand(canAfford(me.resources,t.want),'요청된 자원이 부족해요.');
    pay(giver,t.give);pay(me.resources,t.want);for(const r of RESOURCES){giver[r]+=t.want[r];me.resources[r]+=t.give[r];}g.trade=null;
  }else{
    demand(pid===actor,'아직 내 차례가 아니에요.');
    const buildPhase=g.phase==='main'||g.phase==='special';
    if(action.type==='setup_settlement'){
      demand(g.phase==='setup_settlement','지금은 마을을 놓을 수 없어요.');const vid=Number(action.vertex);
      demand(Number.isInteger(vid)&&canSettle(g,pid,vid,true),'마을을 놓을 수 없는 자리예요.');
      g.vertices[vid].owner=pid;g.vertices[vid].level=1;g.setupVertex=vid;
      if(g.setupStep>=g.players.length)for(const tid of g.vertices[vid].tiles){const r=g.tiles[tid].resource;if(r!=='desert'&&g.bank[r]>0){me.resources[r]++;g.bank[r]--;}}
      g.phase='setup_road';
    }else if(action.type==='setup_road'){
      demand(g.phase==='setup_road','지금은 길을 놓을 수 없어요.');const eid=Number(action.edge);
      demand(Number.isInteger(eid)&&canRoad(g,pid,eid,g.setupVertex),'방금 놓은 마을에 연결된 길을 골라 주세요.');
      g.edges[eid].owner=pid;g.setupVertex=null;g.setupStep++;if(g.setupStep>=g.setupOrder.length){g.phase='roll';g.turn=0;g.turnNumber=1;}else g.phase='setup_settlement';
    }else if(action.type==='roll'){
      demand(g.phase==='roll','지금은 주사위를 굴릴 수 없어요.');const dice=[die(),die()];g.lastDice=dice;const value=dice[0]+dice[1];
      if(value===7){g.pendingDiscards={};for(const p of g.players){const n=total(g.data[p].resources);if(n>7)g.pendingDiscards[p]=Math.floor(n/2);}g.afterRobber='main';g.phase=Object.keys(g.pendingDiscards).length?'discard':'robber';}
      else{produceResources(g,value);g.phase='main';}
    }else if(action.type==='move_robber'){
      demand(g.phase==='robber','지금은 도둑을 옮길 수 없어요.');const tid=Number(action.tile);
      demand(Number.isInteger(tid)&&g.tiles[tid]&&tid!==g.robber,'현재 칸이 아닌 다른 땅을 골라 주세요.');g.robber=tid;g.victims=eligibleVictims(g,tid,pid);g.phase=g.victims.length?'steal':g.afterRobber;
    }else if(action.type==='steal'){
      demand(g.phase==='steal'&&g.victims.includes(action.target),'자원을 가져올 상대를 골라 주세요.');rob(g,action.target,pid);g.victims=[];g.phase=g.afterRobber;
    }else if(action.type==='build_road'){
      demand(buildPhase||g.phase==='free_roads','지금은 길을 만들 수 없어요.');const eid=Number(action.edge);
      demand(Number.isInteger(eid)&&canRoad(g,pid,eid),'기존 길이나 내 마을에 연결된 빈 길을 골라 주세요.');
      if(buildPhase){demand(canAfford(me.resources,COSTS.road),'길을 만들 자원이 부족해요.');payBank(g,me.resources,COSTS.road);}g.edges[eid].owner=pid;
      if(g.phase==='free_roads'){g.freeRoadsLeft--;if(!g.freeRoadsLeft||!g.edges.some(e=>canRoad(g,pid,e.id)))g.phase=g.afterFreeRoads;}
      updateAwards(g);if(g.phase!=='special')checkWin(g,pid);
    }else if(action.type==='skip_free_roads'){
      demand(g.phase==='free_roads','건너뛸 무료 길이 없어요.');g.freeRoadsLeft=0;g.phase=g.afterFreeRoads;
    }else if(action.type==='build_settlement'){
      demand(buildPhase,'지금은 마을을 만들 수 없어요.');const vid=Number(action.vertex);
      demand(Number.isInteger(vid)&&canSettle(g,pid,vid),'내 길에 이어지고 다른 마을과 한 칸 이상 떨어진 자리를 골라 주세요.');
      demand(canAfford(me.resources,COSTS.settlement),'마을을 만들 자원이 부족해요.');payBank(g,me.resources,COSTS.settlement);g.vertices[vid].owner=pid;g.vertices[vid].level=1;updateAwards(g);if(g.phase!=='special')checkWin(g,pid);
    }else if(action.type==='build_city'){
      demand(buildPhase,'지금은 도시를 만들 수 없어요.');const vid=Number(action.vertex),v=g.vertices[vid];
      demand(Number.isInteger(vid)&&v&&v.owner===pid&&v.level===1&&pieceCount(g,pid,2)<4,'내 마을만 도시로 바꿀 수 있어요.');
      demand(canAfford(me.resources,COSTS.city),'도시를 만들 자원이 부족해요.');payBank(g,me.resources,COSTS.city);v.level=2;updateAwards(g);if(g.phase!=='special')checkWin(g,pid);
    }else if(action.type==='buy_development'){
      demand(buildPhase,'지금은 발전 카드를 살 수 없어요.');demand(g.devDeck.length,'남은 발전 카드가 없어요.');demand(canAfford(me.resources,COSTS.development),'발전 카드를 살 자원이 부족해요.');
      payBank(g,me.resources,COSTS.development);me.dev.push({type:g.devDeck.pop(),boughtTurn:g.turnNumber});if(g.phase!=='special')checkWin(g,pid);
    }else if(action.type==='play_development'){
      demand((g.phase==='main'||g.phase==='roll')&&!g.devUsed,'이 턴에 발전 카드를 사용할 수 없어요.');
      const index=me.dev.findIndex(d=>d.type===action.card&&d.type!=='point'&&d.boughtTurn<g.turnNumber);demand(index>=0,'이전 차례에 산 사용 가능한 카드가 없어요.');
      if(action.card==='plenty'){
        demand(Array.isArray(action.resources)&&action.resources.length===2&&action.resources.every(r=>RESOURCES.includes(r)),'받을 자원 2개를 골라 주세요.');
        const requested=emptyResources();for(const r of action.resources)requested[r]++;demand(canAfford(g.bank,requested),'은행에 선택한 자원이 부족해요.');
      }
      if(action.card==='monopoly')demand(RESOURCES.includes(action.resource),'가져올 자원을 골라 주세요.');
      const before=g.phase;me.dev.splice(index,1);g.devUsed=true;
      if(action.card==='knight'){me.knights++;updateAwards(g);if(!checkWin(g,pid)){g.afterRobber=before;g.phase='robber';}}
      else if(action.card==='road'){g.freeRoadsLeft=2;g.afterFreeRoads=before;g.phase=g.edges.some(e=>canRoad(g,pid,e.id))?'free_roads':before;}
      else if(action.card==='plenty')for(const r of action.resources){me.resources[r]++;g.bank[r]--;}
      else if(action.card==='monopoly')for(const p of g.players)if(p!==pid){me.resources[action.resource]+=g.data[p].resources[action.resource];g.data[p].resources[action.resource]=0;}
    }else if(action.type==='bank_trade'){
      demand(g.phase==='main','지금은 은행 교환을 할 수 없어요.');demand(RESOURCES.includes(action.give)&&RESOURCES.includes(action.want)&&action.give!==action.want,'서로 다른 자원을 골라 주세요.');
      const rate=harborRate(g,pid,action.give);demand(me.resources[action.give]>=rate,`같은 자원 ${rate}개가 필요해요.`);demand(g.bank[action.want]>0,'은행에 원하는 자원이 없어요.');
      me.resources[action.give]-=rate;g.bank[action.give]+=rate;me.resources[action.want]++;g.bank[action.want]--;
    }else if(action.type==='offer_trade'){
      demand(g.phase==='main','지금은 교환을 제안할 수 없어요.');const give=normalizeOffer(action.give),want=normalizeOffer(action.want);
      demand(total(give)>0&&total(want)>0,'줄 자원과 받을 자원을 골라 주세요.');demand(RESOURCES.every(r=>!(give[r]&&want[r])),'같은 자원을 주고받을 수 없어요.');demand(canAfford(me.resources,give),'제안할 자원이 부족해요.');g.trade={from:pid,give,want};
    }else if(action.type==='cancel_trade'){
      demand(g.phase==='main'&&g.trade&&g.trade.from===pid,'취소할 제안이 없어요.');g.trade=null;
    }else if(action.type==='end_turn'){
      demand(g.phase==='main'||g.phase==='special','현재 동작을 먼저 마쳐 주세요.');g.trade=null;
      if(g.phase==='special'){g.specialIndex++;nextSpecial(g);}
      else if(g.players.length>=5){g.specialIndex=1;nextSpecial(g);}
      else beginNextTurn(g);
    }else throw new GameError('알 수 없는 동작이에요.');
  }
  g.revision++;
}
export function islandView(g,pid){
  const actor=active(g),me=g.data[pid],myTurn=pid===actor,canBuild=myTurn&&(g.phase==='main'||g.phase==='special'),canPlay=myTurn&&(g.phase==='main'||g.phase==='roll');
  const legal={settlements:[],roads:[],cities:[],robber:[]};
  if(myTurn&&g.phase==='setup_settlement')legal.settlements=g.vertices.filter(v=>canSettle(g,pid,v.id,true)).map(v=>v.id);
  if(myTurn&&g.phase==='setup_road')legal.roads=g.edges.filter(e=>canRoad(g,pid,e.id,g.setupVertex)).map(e=>e.id);
  if(myTurn&&g.phase==='free_roads')legal.roads=g.edges.filter(e=>canRoad(g,pid,e.id)).map(e=>e.id);
  if(canBuild){
    if(canAfford(me.resources,COSTS.road))legal.roads=g.edges.filter(e=>canRoad(g,pid,e.id)).map(e=>e.id);
    if(canAfford(me.resources,COSTS.settlement))legal.settlements=g.vertices.filter(v=>canSettle(g,pid,v.id)).map(v=>v.id);
    if(canAfford(me.resources,COSTS.city)&&pieceCount(g,pid,2)<4)legal.cities=g.vertices.filter(v=>v.owner===pid&&v.level===1).map(v=>v.id);
  }
  if(myTurn&&g.phase==='robber')legal.robber=g.tiles.filter(t=>t.id!==g.robber).map(t=>t.id);
  return {kind:'island',players:g.players,turn:actor,phase:g.phase,revision:g.revision,tiles:g.tiles,vertices:g.vertices,edges:g.edges,ports:g.ports,bank:g.bank,robber:g.robber,
    setupStep:g.setupStep,setupTotal:g.setupOrder.length,lastDice:g.lastDice,trade:g.trade,target:g.target,winner:g.winner,specialIndex:g.specialIndex,normalTurn:g.players[g.turn],
    freeRoadsLeft:g.freeRoadsLeft,legal,pendingDiscard:g.pendingDiscards[pid]||0,pendingCount:Object.keys(g.pendingDiscards).length,victims:myTurn?g.victims:[],devDeckCount:g.devDeck.length,devUsed:g.devUsed,turnNumber:g.turnNumber,
    longestRoad:g.longestRoad,largestArmy:g.largestArmy,roadLengths:g.roadLengths,
    publicPlayers:Object.fromEntries(g.players.map(p=>[p,{resourceCount:total(g.data[p].resources),points:publicPoints(g,p),knights:g.data[p].knights,devCount:g.data[p].dev.length}])),
    me:{resources:me.resources,rates:Object.fromEntries(RESOURCES.map(r=>[r,harborRate(g,pid,r)])),dev:me.dev.map(d=>({...d,playable:d.type!=='point'&&d.boughtTurn<g.turnNumber&&!g.devUsed&&canPlay})),points:truePoints(g,pid)} };
}
