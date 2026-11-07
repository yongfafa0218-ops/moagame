import {randomBytes,randomUUID} from 'node:crypto';
import {GameError,demand} from './games/common.js';
import {createTileGame,applyTileAction,tileView} from './games/tile.js';
import {createIslandGame,applyIslandAction,islandView} from './games/island.js';
import {createDiceGame,applyDiceAction,diceView} from './games/dice.js';

const GAMES={tile:{min:2,max:6},island:{min:3,max:6},dice:{min:2,max:6}};
const validGame=value=>typeof value==='string'&&Object.hasOwn(GAMES,value);
const PALETTE=['#D8654E','#43799A','#D6A044','#54866B','#8E7295','#3B6371'];
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRESENCE_MS=75_000, HEARTBEAT_MS=20_000, ROOM_TTL_MS=7*24*60*60*1000;
const keyFor=code=>`rooms/${code}`;
const isConnected=(p,now)=>!p.left && now-p.lastSeen<PRESENCE_MS;
function codeValue(value){const code=String(value||'').trim().toUpperCase();demand(/^[A-HJ-NP-Z2-9]{8}$/.test(code),'방 코드 8자리를 확인해 주세요.');return code;}
function makeCode(){return [...randomBytes(8)].map(n=>ALPHABET[n&31]).join('');}
function nickname(value){const n=String(value||'').trim().replace(/\s+/g,' ');demand(n.length>0,'닉네임을 입력해 주세요.');demand([...n].length<=12,'닉네임은 12자 이하로 입력해 주세요.');demand(!/[\u0000-\u001f\u007f]/.test(n),'닉네임에 사용할 수 없는 문자가 있어요.');return n;}
function makePlayer(name,now){return {id:randomUUID(),token:randomBytes(24).toString('hex'),name,color:null,lastSeen:now,left:false,completedOps:[]};}
function requireSeat(room,token){const p=typeof token==='string'&&room.players.find(v=>v.token===token);demand(p,'방에서 나왔거나 참가 자격이 없어졌어요.');return p;}
function validateRoom(entry,now){const room=entry?.data;demand(room&&!room.closed,'방을 찾지 못했어요. 코드를 다시 확인해 주세요.');demand(now-room.touchedAt<ROOM_TTL_MS,'오래 사용하지 않아 닫힌 방이에요. 새 방을 만들어 주세요.');return room;}
function roomView(room,pid,now){
 const players=room.players.map(p=>({id:p.id,name:p.name,color:p.color,connected:isConnected(p,now),host:p.id===room.host}));
 let game=null;
 if(room.game){game=room.type==='tile'?tileView(room.game,pid):room.type==='island'?islandView(room.game,pid):diceView(room.game);}
 return {code:room.code,type:room.type,host:room.host,me:pid,players,started:!!room.game,game,config:GAMES[room.type],version:room.version};
}
const presenceSignature=(room,now)=>room.players.map(p=>`${p.id}:${isConnected(p,now)?1:0}`).join('|');
function maybeElectHost(room,now){
 if(room.game)return false;
 const current=room.players.find(p=>p.id===room.host);
 if(current&&isConnected(current,now))return false;
 const next=room.players.find(p=>isConnected(p,now));
 if(next&&room.host!==next.id){room.host=next.id;room.version++;return true;}return false;
}
async function read(store,code,now){const entry=await store.getWithMetadata(keyFor(code),{type:'json',consistency:'strong'});return {entry,room:validateRoom(entry,now)};}
async function mutate(store,code,now,change){
 for(let attempt=0;attempt<18;attempt++){
  const {entry,room}=await read(store,code,now);
  // Without an ETag the SDK silently makes an unconditional write. Refuse it:
  // silently overwriting another player's turn is worse than showing an error.
  if(typeof entry.etag!=='string'||!entry.etag)throw new Error('Netlify Blobs did not supply an ETag; refusing unsafe room write');
  const result=change(room);
  const write=await store.setJSON(keyFor(code),room,{onlyIfMatch:entry.etag});
  if(write.modified===true)return {room,result};
  if(write.modified!==false)throw new Error('Netlify Blobs conditional write returned an unexpected result');
  // Conditional writes prevent simultaneous players from overwriting one another.
  await new Promise(resolve=>setTimeout(resolve,Math.min(8+attempt*5,50)+randomBytes(1)[0]%10));
 }
 throw new GameError('동시에 요청이 많아요. 잠시 뒤 다시 시도해 주세요.');
}
function responseFor(room,pid,now,extra={}){return {ok:true,...extra,room:roomView(room,pid,now),version:room.version,presence:presenceSignature(room,now)};}

/** Process one authenticated operation. `store` has the Netlify Blobs API. */
export async function dispatch(store,body,now=Date.now()){
 demand(body&&typeof body==='object'&&!Array.isArray(body),'요청을 확인해 주세요.');
 const cmd=String(body.cmd||''),data=body.data&&typeof body.data==='object'?body.data:{};
 if(cmd==='room:create'){
  const name=nickname(data.name);demand(validGame(data.game),'게임을 선택해 주세요.');
  for(let i=0;i<30;i++){
   const code=makeCode(),p=makePlayer(name,now);p.color=PALETTE[0];
   const room={code,type:data.game,players:[p],host:p.id,game:null,createdAt:now,touchedAt:now,version:1,closed:false};
   const write=await store.setJSON(keyFor(code),room,{onlyIfNew:true});
   if(write.modified)return responseFor(room,p.id,now,{code,token:p.token,playerId:p.id});
  }throw new GameError('방을 만들 수 없어요. 잠시 뒤 다시 시도해 주세요.');
 }
 const code=codeValue(body.code||data.code);
 if(cmd==='room:join'){
  const token=typeof data.token==='string'?data.token:'';
  const {room,result}=await mutate(store,code,now,room=>{
   let p=token?room.players.find(v=>v.token===token):null;
   if(!p){demand(!room.game,'이미 시작한 방이에요. 이전에 참가한 기기에서 다시 들어와 주세요.');demand(room.players.length<6,'방은 6명까지 함께할 수 있어요.');
    const name=nickname(data.name);demand(!room.players.some(v=>v.name.toLowerCase()===name.toLowerCase()),'같은 닉네임이 있어요. 다른 이름을 골라 주세요.');
    p=makePlayer(name,now);p.color=PALETTE.find(c=>!room.players.some(v=>v.color===c))||PALETTE[room.players.length];room.players.push(p);room.version++;
   }else if(p.left){p.left=false;room.version++;}
   p.lastSeen=now;room.touchedAt=now;maybeElectHost(room,now);return {playerId:p.id,token:p.token};
  });
  return responseFor(room,result.playerId,now,{code,token:result.token,playerId:result.playerId});
 }
 const token=typeof body.token==='string'?body.token:'';
 if(cmd==='room:state'){
  let {room}=await read(store,code,now),p=requireSeat(room,token);demand(!p.left,'방에서 나왔어요.');
  if(now-p.lastSeen>=HEARTBEAT_MS || (!room.game&&!isConnected(room.players.find(x=>x.id===room.host)||{left:true,lastSeen:0},now))){
   ({room}=await mutate(store,code,now,room=>{const current=requireSeat(room,token);demand(!current.left,'방에서 나왔어요.');current.lastSeen=now;room.touchedAt=now;maybeElectHost(room,now);}));p=requireSeat(room,token);
  }
  const presence=presenceSignature(room,now);
  if(body.knownVersion===room.version&&body.knownPresence===presence)return {ok:true,unchanged:true,version:room.version,presence};
  return responseFor(room,p.id,now);
 }
 const opId=typeof body.opId==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(body.opId)?body.opId:null;
 const {room,result}=await mutate(store,code,now,room=>{
  const player=requireSeat(room,token);demand(!player.left,'방에서 나왔어요.');
  if(opId&&player.completedOps.includes(opId))return {playerId:player.id,replayed:true};
  if(cmd==='room:change_game'){
   demand(player.id===room.host&&!room.game,'방장만 게임을 바꿀 수 있어요.');demand(validGame(data.game),'게임을 선택해 주세요.');room.type=data.game;
  }else if(cmd==='room:remove'){
   demand(player.id===room.host&&!room.game,'방장만 참가자를 내보낼 수 있어요.');demand(data.playerId!==player.id,'방장은 내보낼 수 없어요.');
   demand(room.players.some(p=>p.id===data.playerId),'참가자를 찾을 수 없어요.');room.players=room.players.filter(p=>p.id!==data.playerId);
  }else if(cmd==='room:start'){
   demand(player.id===room.host,'방장만 시작할 수 있어요.');demand(!room.game,'이미 시작한 게임이에요.');
   const cfg=GAMES[room.type];demand(room.players.length>=cfg.min,`${cfg.min}명부터 시작할 수 있어요.`);demand(room.players.every(p=>isConnected(p,now)),'연결이 끊긴 친구를 기다리거나 내보내 주세요.');
   room.game=room.type==='tile'?createTileGame(room.players):room.type==='island'?createIslandGame(room.players):createDiceGame(room.players);
  }else if(cmd==='game:action'){
   demand(room.game,'먼저 게임을 시작해 주세요.');demand(data&&typeof data.type==='string'&&data.type.length<40,'동작을 확인해 주세요.');
   if(room.type==='tile')applyTileAction(room.game,player.id,data);else if(room.type==='island')applyIslandAction(room.game,player.id,data);else applyDiceAction(room.game,player.id,data);
  }else if(cmd==='room:reset'){
   demand(player.id===room.host,'방장만 대기실로 돌아갈 수 있어요.');demand(room.game?.winner,'게임이 끝난 뒤에 대기실로 돌아갈 수 있어요.');room.game=null;
  }else if(cmd==='room:leave'){
   if(!room.game)room.players=room.players.filter(p=>p.id!==player.id);else{player.left=true;player.lastSeen=0;}
   if(!room.players.length)room.closed=true;
   if(room.host===player.id){const next=room.players.find(p=>isConnected(p,now));if(next)room.host=next.id;}
  }else throw new GameError('알 수 없는 요청이에요.');
  if(opId){player.completedOps.push(opId);if(player.completedOps.length>30)player.completedOps.shift();}
  if(!player.left)player.lastSeen=now;room.touchedAt=now;room.version++;return {playerId:player.id,left:cmd==='room:leave'};
 });
 if(result.left)return {ok:true,left:true};
 return responseFor(room,result.playerId,now,{replayed:!!result.replayed});
}
