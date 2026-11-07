/* 모아: a deliberately self-contained mobile client. All gameplay is validated by the server. */
const app=document.getElementById('app');
const overlay=document.getElementById('overlay');
const toastNode=document.getElementById('toast');
const socket=typeof io==='function'?io({transports:['websocket','polling']}):null;
const S={connected:false,room:null,modal:null,modalGame:'tile',modalName:'',modalCode:'',tileDraft:null,selected:[],tileRevision:null,islandMode:null,lastIslandPhase:null,joinHandled:false,toastTimer:null};
const GAMES={
  tile:{name:'타일 클럽',subtitle:'숫자 타일을 이어 나가는 두뇌 게임',desc:'루미큐브처럼 숫자와 색을 맞춰 타일을 내려놓아요.',players:'2–6명',time:'20–40분',kind:'TILE GAME',min:2},
  island:{name:'섬 개척',subtitle:'자원을 모아 나만의 섬을 만드는 전략 게임',desc:'카탄처럼 자원을 모으고 교환하며 섬을 개척해요.',players:'3–6명',time:'45–90분',kind:'STRATEGY',min:3},
  dice:{name:'다이스 데이',subtitle:'주사위 다섯 개로 즐기는 한 판',desc:'운과 선택을 모아 가장 높은 점수에 도전해요.',players:'2–6명',time:'15–30분',kind:'DICE GAME',min:2}
};
const R={wood:{name:'나무',icon:'🌲',color:'#86ac86'},brick:{name:'벽돌',icon:'🧱',color:'#d89778'},wheat:{name:'곡물',icon:'🌾',color:'#e9ca72'},sheep:{name:'양털',icon:'🐑',color:'#c2dcae'},ore:{name:'광물',icon:'⛰',color:'#9dafae'},desert:{name:'사막',icon:'🏜',color:'#e6d7b7'}};
const RESOURCE_KEYS=['wood','brick','wheat','sheep','ore'];
const DEV={knight:'기사',road:'길 만들기',plenty:'풍요',monopoly:'독점',point:'숨은 승점'};
const DICE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const qs=(s,root=document)=>root.querySelector(s);
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pname=(id)=>S.room?.players.find(p=>p.id===id)?.name||'친구';
const pcolor=(id)=>S.room?.players.find(p=>p.id===id)?.color||'#829b8b';
const initial=(name)=>esc([...String(name||'친구')][0].toUpperCase());
const linkFor=(code)=>`${location.origin}/?room=${encodeURIComponent(code)}`;
const tokenKey=(code)=>`moa-seat:${code}`;
function icon(name,size=18){
  const paths={arrow:'<path d="M4 9h10M10 5l4 4-4 4"/>',plus:'<path d="M9 3v12M3 9h12"/>',users:'<path d="M11.5 14.5v-.8a3.5 3.5 0 0 0-7 0v.8M8 9a2.7 2.7 0 1 0 0-5.4A2.7 2.7 0 0 0 8 9ZM13 8.8a2.4 2.4 0 0 0 0-4.6M15.5 14.5v-.7a3.4 3.4 0 0 0-2.4-3.2"/>',spark:'<path d="m9 2 1.4 4.6L15 8l-4.6 1.4L9 14 7.6 9.4 3 8l4.6-1.4L9 2ZM14 12l.6 1.9L16.5 14l-1.9.6L14 16.5l-.6-1.9-1.9-.6 1.9-.1L14 12Z"/>',phone:'<rect x="5" y="2.5" width="8" height="13" rx="2"/><path d="M8 13h2"/>',copy:'<rect x="6" y="5" width="8" height="10" rx="1.5"/><path d="M11 5V3H4v9h2"/>',share:'<path d="M9 12V3m-3 3 3-3 3 3M4 10v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-4"/>',check:'<path d="m4 9 3 3 7-7"/>',back:'<path d="M14 9H4m4-4L4 9l4 4"/>',close:'<path d="M4 4l10 10M14 4 4 14"/>',book:'<path d="M9 5.5C7 3.8 4.5 4 2.5 5v9c2-1 4.5-1.2 6.5.5 2-1.7 4.5-1.5 6.5-.5V5c-2-1-4.5-1.2-6.5.5ZM9 5.5v9"/>',lock:'<rect x="4.5" y="8" width="9" height="7" rx="1.5"/><path d="M6.5 8V6a2.5 2.5 0 0 1 5 0v2"/>',link:'<path d="M7.2 11.4 6 12.6a3 3 0 0 1-4.2-4.2l2.4-2.4a3 3 0 0 1 4.2 0M10.8 6.6 12 5.4a3 3 0 0 1 4.2 4.2l-2.4 2.4a3 3 0 0 1-4.2 0M6.2 9h5.6"/>',logout:'<path d="M8 3H4v12h4M11 6l3 3-3 3M7 9h7"/>'};
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.spark}</svg>`;
}
function toast(message){toastNode.textContent=message;toastNode.className='toast show';clearTimeout(S.toastTimer);S.toastTimer=setTimeout(()=>toastNode.className='toast',3300);}
function emit(event,data={},cb){
  if(!socket||!S.connected){toast('인터넷 연결을 확인해 주세요.');return;}
  socket.timeout(8000).emit(event,data,(err,response)=>{
    if(err){toast('연결이 지연되고 있어요. 다시 시도해 주세요.');return;}
    if(!response?.ok){toast(response?.error||'다시 시도해 주세요.');return;}
    if(cb)cb(response);
  });
}
function persistSeat(result,name){localStorage.setItem(tokenKey(result.code),result.token);localStorage.setItem('moa-name',name);history.replaceState({},'',`/?room=${encodeURIComponent(result.code)}`);}
function clearRoom(){S.room=null;S.tileDraft=null;S.selected=[];S.tileRevision=null;S.islandMode=null;S.lastIslandPhase=null;history.replaceState({},'','/');render();}
function closeModal(){S.modal=null;overlay.innerHTML='';}
function openModal(type,opts={}){S.modal=type;S.modalGame=opts.game||S.modalGame||'tile';S.modalCode=opts.code||'';S.modalName=opts.name??localStorage.getItem('moa-name')??'';S.modalExtra=opts.extra||null;renderModal();const input=type==='join'&&S.modalCode?qs('#modal-name'):qs('.modal input');if(input)input.focus();}
function status(){return `<span class="online-indicator ${S.connected?'':'offline'}"><i class="dot"></i>${S.connected?'연결됨':'연결 중'}</span>`;}
function header(inRoom=false){return `<header class="header"><div class="wrap header-inner"><a class="brand" href="/" data-do="home"><span class="brand-mark"><i></i><i></i><i></i></span>모아 <span class="brand-sub">OUR LITTLE GAME ROOM</span></a><nav class="nav"><a href="/#games" data-do="nav-games">게임 둘러보기</a><a href="/#how" data-do="nav-how">이용 방법</a></nav><div class="header-actions">${status()}${inRoom?'':`<button class="nav-cta" data-do="join-modal">방 입장하기</button>`}</div></div></header>`;}
function cover(game){
  if(game==='tile')return `<div class="game-cover cover-tile"><span class="cover-badge">숫자 · 집중</span><div class="tile-stack"><div class="mini-tile">4</div><div class="mini-tile">5</div><div class="mini-tile">6</div><div class="mini-tile">7</div><div class="mini-tile">8</div></div><span class="cover-deco">TILE CLUB / 01</span></div>`;
  if(game==='island')return `<div class="game-cover cover-island"><span class="cover-badge">전략 · 교환</span><svg viewBox="0 0 235 150" aria-hidden="true"><path d="M38 54 117 10l80 44v67l-80 27-79-27Z" fill="#6fa58c" opacity=".26"/><g stroke="#fffaf0" stroke-width="2"><path d="M118 11 153 31 153 68 118 88 83 68 83 31Z" fill="#e9c57b"/><path d="M81 32 116 52 116 89 81 109 46 89 46 52Z" fill="#87b18b"/><path d="M155 32 190 52 190 89 155 109 120 89 120 52Z" fill="#d89572"/><path d="M118 72 153 92 153 129 118 149 83 129 83 92Z" fill="#9bb6b4"/></g><g fill="#fffaf1"><circle cx="118" cy="46" r="11"/><circle cx="81" cy="68" r="11"/><circle cx="155" cy="68" r="11"/><circle cx="118" cy="108" r="11"/></g><g fill="#466953" font-size="11" font-weight="800" text-anchor="middle"><text x="118" y="50">8</text><text x="81" y="72">5</text><text x="155" y="72">9</text><text x="118" y="112">6</text></g><path d="M75 105 90 96l15 9v17H75Z" fill="#d26e50" stroke="#fff" stroke-width="2"/><path d="M165 98 179 90l14 8v15h-28Z" fill="#376b58" stroke="#fff" stroke-width="2"/></svg><span class="cover-deco">ISLAND / 02</span></div>`;
  const face=(v)=>`<div class="cover-die">${Array.from({length:9},(_,i)=>`<i class="${DICE_PIPS[v].includes(i)?'on':''}"></i>`).join('')}</div>`;
  return `<div class="game-cover cover-dice"><span class="cover-badge">주사위 · 행운</span><div class="cover-dice-art">${face(2)}${face(5)}${face(4)}</div><span class="cover-deco">DICE DAY / 03</span></div>`;
}
function card(game){const g=GAMES[game];return `<article class="game-card">${cover(game)}<div class="game-card-body"><div class="card-top"><span class="card-kind">${g.kind}</span><span class="card-rating">✦ ALL FREE</span></div><h3>${g.name}</h3><p>${g.desc}</p><div class="card-bottom"><span class="card-meta">${g.players} &nbsp;·&nbsp; ${g.time}</span><button class="card-link" data-do="create-modal" data-game="${game}">방 만들기 ${icon('arrow',14)}</button></div></div></article>`;}
function home(){return `${header()}<main><section class="hero"><div class="wrap"><div class="hero-grid"><div class="hero-copy"><span class="eyebrow"><i class="dash"></i> GOOD PEOPLE, GOOD GAMES</span><h1>어디서든, 우리끼리<br><em>게임 한 판.</em></h1><p>좋아하는 사람들과 마주 앉아, 각자의 휴대폰으로. 준비는 가볍게, 즐거움은 오래.</p><div class="button-row"><button class="button button-primary" data-do="create-modal">${icon('plus')} 새 방 만들기</button><button class="button button-secondary" data-do="join-modal">${icon('link')} 방 코드로 입장</button></div><div class="hero-foot"><span>가입 없이</span><span>최대 6명</span><span>모든 게임 무료</span></div></div><div class="hero-art"><img src="/images/game-night-hero.jpg" alt="바닷가 테이블에 모여 보드게임을 즐기는 여섯 친구"><span class="art-stamp">MADE FOR TOGETHER</span><div class="hero-art-caption"><div class="caption-icon">✳</div><div><strong>여기가 바로 우리의 게임방</strong><small>A LITTLE MORE TIME TOGETHER</small></div></div></div></div><div class="quick-strip"><div class="quick-list"><div class="quick-item"><span class="icon-wrap">${icon('users',14)}</span>친구와 최대 6명</div><div class="quick-item"><span class="icon-wrap">${icon('phone',14)}</span>휴대폰으로 바로</div><div class="quick-item"><span class="icon-wrap">${icon('spark',14)}</span>광고·결제 없이</div></div><span class="quick-note">좋은 순간을 모아, 모아.</span></div></div></section><section class="section wrap" id="games"><div class="section-head"><div><div class="section-kicker">PICK YOUR GAME</div><h2>오늘은 뭘 해볼까요?</h2></div><p class="section-desc">마음에 드는 게임으로 방을 열어보세요.</p></div><div class="game-grid">${Object.keys(GAMES).map(card).join('')}</div><div class="more-panel"><div style="display:flex;align-items:center;gap:12px"><span class="more-icon">${icon('spark')}</span><div><strong>게임은 하나씩 더해갈게요</strong><p>우리의 게임방은 계속 자라는 중이에요.</p></div></div><span class="micro muted">MORE TO COME &nbsp; ↗</span></div></section><section class="wrap how-section" id="how"><div class="how-box"><span class="how-num">↗</span><div class="how-content"><strong>처음이어도 괜찮아요</strong><p>방을 만들고 코드를 공유하면 끝. 규칙은 게임 안에서 언제든 볼 수 있어요.</p></div></div></section></main>${footer()}`;}
function footer(){return `<footer class="footer"><div class="wrap footer-inner"><div><strong>모아 MOA</strong><p>좋은 사람들과, 한 판 더.</p></div><div class="footer-right"><p>광고도, 결제도 없는 작은 게임방 · 인터넷 연결 필요</p><p>독립적으로 만든 게임이에요. 공식 보드게임 앱이 아닙니다.</p></div></div></footer>`;}
function roster(room){return `<aside class="surface roster"><div class="panel-head"><h2>함께하는 친구들</h2><span class="counter">${room.players.length} / 6</span></div><div class="seats">${Array.from({length:6},(_,i)=>{const p=room.players[i];if(!p)return `<div class="seat empty"><span class="avatar">＋</span><span class="seat-name">기다리는 중</span></div>`;return `<div class="seat"><span class="avatar" style="background:${esc(p.color)}">${initial(p.name)}</span><span class="seat-name">${esc(p.name)}</span><span class="seat-label ${p.host?'host':''}">${p.host?'방장':p.connected?'접속 중':'끊김'}${p.id===room.me?' · 나':''}</span>${room.host===room.me&&p.id!==room.me?`<button class="remove-seat" title="참가자 내보내기" aria-label="${esc(p.name)} 내보내기" data-do="remove-player" data-id="${esc(p.id)}">×</button>`:''}</div>`;}).join('')}</div><div class="roster-action">${room.host===room.me?`<button class="button button-primary button-full" data-do="start-game" ${room.players.length<room.config.min||!room.players.every(p=>p.connected)?'disabled':''}>게임 시작하기 ${icon('arrow')}</button><p class="small-note">${room.players.length<room.config.min?`${room.config.min}명부터 시작할 수 있어요.`:!room.players.every(p=>p.connected)?'연결이 끊긴 친구를 기다리거나 내보내 주세요.':'모두 모였다면 시작해 볼까요?'}</p>`:`<div class="selection-status">방장이 게임을 시작하면 자동으로 이동해요.</div>`}</div></aside>`;}
function lobby(){const room=S.room,g=GAMES[room.type];const qr=`/api/qr?url=${encodeURIComponent(linkFor(room.code))}`;return `${header(true)}<main class="wrap room-wrap"><div class="crumb"><button data-do="home">홈</button> <span>›</span> 우리 게임방</div><div class="room-top"><div><div class="section-kicker">OUR GAME ROOM</div><h1>친구들을 기다리는 중</h1><p>같이할 친구를 초대하고, 모두 모이면 시작해요.</p></div><div class="room-code-chip">방 코드 <b>${esc(room.code)}</b></div></div><div class="room-grid"><section class="surface room-feature">${cover(room.type).replace('game-cover ','game-cover room-feature-cover ')}<div class="room-feature-content"><div class="card-kind">${g.kind} &nbsp;·&nbsp; ${g.players} &nbsp;·&nbsp; ${g.time}</div><h2>${g.name}</h2><p>${g.subtitle}</p><div class="share-card"><img class="share-qr" src="${qr}" alt="친구 초대 QR 코드"><div class="share-copy"><strong>친구들에게 이 방을 알려주세요</strong><p>QR을 스캔하거나 방 코드를 입력해요.</p><span class="share-code">${esc(room.code)}</span></div></div><div class="button-row"><button class="button button-primary" data-do="share-room">${icon('share')} 초대 링크 공유</button><button class="button button-secondary" data-do="copy-code">${icon('copy')} 코드 복사</button></div><button class="link-rule" data-do="rules" data-game="${room.type}">게임 방법 미리 보기</button>${room.host===room.me?`<button class="link-rule" style="margin-left:16px" data-do="change-game-modal">다른 게임 고르기</button>`:''}</div></section>${roster(room)}</div><div style="margin-top:16px"><button class="button-text" data-do="leave-room">${icon('back')} 방 나가기</button></div></main>${footer()}`;}
function playerStrip(room,g){return `<div class="player-strip">${room.players.map(p=>{let sub='';if(g.kind==='tile')sub=`타일 ${g.players[p.id]?.count??0}개${g.players[p.id]?.opened?' · 등록':' · 미등록'}`;else if(g.kind==='island')sub=`${g.publicPlayers[p.id]?.points??0}점 · 자원 ${g.publicPlayers[p.id]?.resourceCount??0}`;else sub=`${g.totals[p.id]??0}점`;return `<div class="player-chip ${g.turn===p.id?'current':''}"><span class="avatar" style="background:${esc(p.color)}">${initial(p.name)}</span><span style="min-width:0"><span class="player-chip-name">${esc(p.name)}${p.id===room.me?' (나)':''}</span><span class="player-chip-sub">${p.connected?sub:'연결 끊김'}</span></span></div>`;}).join('')}</div>`;}
function resultPanel(g,room){if(!g.winner)return '';let winners=g.winners?.length?g.winners:[g.winner];return `<div class="game-result"><h2>✦ ${winners.map(p=>esc(pname(p))).join(', ')} ${winners.length>1?'공동 우승!':'승리!'}</h2><p>${esc(g.endReason||'함께해 주셔서 고마워요. 한 판 더 어떨까요?')}</p>${g.kind==='tile'&&g.penalties?`<p>남은 손패 점수: ${room.players.map(p=>`${esc(p.name)} ${g.penalties[p.id]}점`).join(' · ')} (조커 30점)</p>`:''}${room.host===room.me?`<button class="button button-primary button-small" data-do="reset-room">대기실로 돌아가기</button>`:'<span class="micro muted">방장이 대기실로 돌아갈 수 있어요.</span>'}</div>`;}
function gameShell(content,subtext){const room=S.room,g=room.game,me=room.me;let isMine=g.turn===me&&!g.winner;if(g.kind==='island'&&g.phase==='discard'&&g.pendingDiscard)isMine=true;const title=g.winner?'게임이 끝났어요':isMine?'지금은 내 차례예요':`${esc(pname(g.turn))}님의 차례예요`;return `${header(true)}<main class="wrap game-wrap"><div class="game-topline"><div class="game-title-line"><h1>${GAMES[g.kind].name}</h1><span class="game-tag">${esc(room.code)} · ${room.players.length}명</span></div><div class="game-utility"><button class="button button-outline button-small" data-do="rules" data-game="${g.kind}">${icon('book')} 규칙</button><button class="button button-outline button-small" data-do="leave-room">나가기</button></div></div>${resultPanel(g,room)}<div class="turn-banner ${isMine?'mine':''}"><div><strong>${title}</strong><small>${esc(subtext||'친구들과 함께 즐거운 한 판!')}</small></div><span class="banner-symbol">${isMine?'✳':'✦'}</span></div>${playerStrip(room,g)}${content}</main>${footer()}`;}
function resetTileDraft(g){
  const tiles={};for(const t of g.rack)tiles[t.id]=t;for(const group of g.board)for(const t of group)tiles[t.id]=t;
  S.tileDraft={tiles,rack:g.rack.map(t=>t.id),groups:g.board.map((group,i)=>({gid:`base${i}`,tiles:group.map(t=>t.id),base:true})),next:0};S.selected=[];S.tileRevision=g.revision;
}
function tileButton(tile,editable){const index=S.selected.indexOf(tile.id);return `<button class="tile ${esc(tile.color)} ${index>=0?'selected':''} ${editable?'':'readonly'}" ${editable?`data-do="tile-select" data-id="${esc(tile.id)}"`:'disabled'} aria-label="${tile.joker?'조커':`${tile.number} ${tile.color}`} ${index>=0?`선택 ${index+1}`:''}">${tile.joker?'✿':tile.number}${index>=0?`<span class="order">${index+1}</span>`:''}</button>`;}
function tileGame(){const room=S.room,g=room.game,myTurn=g.turn===room.me&&!g.winner;if(!S.tileDraft||S.tileRevision!==g.revision)resetTileDraft(g);const d=S.tileDraft,opened=g.players[room.me].opened;
  const groups=d.groups.length?d.groups.map((group,i)=>`<div class="tile-group"><span class="tile-group-number">${i+1}</span><div class="tile-row">${group.tiles.map(id=>tileButton(d.tiles[id],myTurn&&(opened||!group.base))).join('')}</div>${myTurn&&(opened||!group.base)?`<div class="group-actions"><button data-do="tile-add" data-id="${esc(group.gid)}" data-side="front" ${S.selected.length?'':'disabled'}>앞에 +</button><button data-do="tile-add" data-id="${esc(group.gid)}" data-side="back" ${S.selected.length?'':'disabled'}>뒤에 +</button></div>`:''}</div>`).join(''):`<div class="table-empty"><span>✳</span>아직 놓인 타일이 없어요.<br>내 타일을 골라 첫 조합을 만들어 보세요.</div>`;
  const content=`<div class="game-layout"><div class="game-main"><section class="game-panel"><div class="game-panel-head"><div><h2>가운데 테이블</h2><p class="panel-sub">조합은 턴을 마칠 때 모두 유효해야 해요.</p></div><span class="pill">남은 타일 ${g.stockCount}개</span></div><div class="table-area">${groups}</div></section><section class="game-panel"><div class="rack-toolbar"><div><strong>나의 타일</strong> <span class="pill">${d.rack.length}개</span></div><button data-do="tile-sort">숫자순 정렬 ↕</button></div><div class="rack-area"><div class="tile-row">${d.rack.map(id=>tileButton(d.tiles[id],myTurn)).join('')}</div><div class="selection-help">${myTurn?'타일을 놓을 순서대로 선택해 주세요.':'다른 친구는 내 타일을 볼 수 없어요.'}</div></div></section></div><aside class="game-aside"><section class="game-panel"><div class="game-panel-head"><div><h3>이번 차례</h3><p class="panel-sub">${opened?'첫 등록 완료':'첫 등록에는 30점이 필요해요'}</p></div><span class="pill">${opened?'등록됨':'미등록'}</span></div>${myTurn?`<div class="selection-status">선택한 타일 <strong>${S.selected.length}개</strong><br><span class="micro">선택 후 새 조합을 만들거나 기존 조합에 더해요.</span></div><div class="divider"></div><div class="stack"><button class="button button-secondary" data-do="tile-new" ${S.selected.length?'':'disabled'}>${icon('plus')} 선택한 타일로 새 조합</button><button class="button button-primary" data-do="tile-commit">조합 놓고 턴 마치기 ${icon('arrow')}</button><button class="button button-light" data-do="tile-draw">${g.stockCount?'타일 한 장 뽑고 넘기기':'더미가 없어 턴 넘기기'}</button><button class="button button-outline button-small" data-do="tile-reset">편집 취소</button></div>`:`<div class="hint-card"><strong>잠깐만요</strong><br>친구가 타일을 놓는 중이에요. 내 차례가 되면 타일을 선택할 수 있어요.</div>`}</section><section class="game-panel"><h3>기억해 주세요</h3><div class="hint-card" style="margin-top:12px">같은 숫자·다른 색, 또는 같은 색·연속 숫자 <strong>3개 이상</strong>이 한 조합이에요.<br><br>첫 등록 후에는 테이블 타일도 재배치할 수 있어요. ${g.packs===3?'5~6인용으로 타일 3세트를 사용해요.':''}</div><button class="link-rule" data-do="rules" data-game="tile">자세한 규칙 보기</button></section></aside></div>`;
  return gameShell(content,myTurn?(opened?'타일을 선택하고 조합을 완성해 주세요.':'내 타일만으로 합계 30점 이상을 처음 등록해요.'):'다른 친구는 내 타일을 볼 수 없어요.');}
function scorePreview(cat,dice){const total=dice.reduce((a,b)=>a+b,0);const upper=['ones','twos','threes','fours','fives','sixes'].indexOf(cat);if(upper>=0)return dice.filter(d=>d===upper+1).reduce((a,b)=>a+b,0);const counts=Object.values(dice.reduce((a,d)=>(a[d]=(a[d]||0)+1,a),{}));const ordered=[...dice].sort((a,b)=>a-b).join(',');if(cat==='choice')return total;if(cat==='four')return Math.max(...counts)>=4?total:0;if(cat==='full')return counts.includes(2)&&counts.includes(3)?total:0;if(cat==='small'){const u=new Set(dice);return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(run=>run.every(n=>u.has(n)))?15:0;}if(cat==='large')return ['1,2,3,4,5','2,3,4,5,6'].includes(ordered)?30:0;if(cat==='yacht')return Math.max(...counts)===5?50:0;return 0;}
function dieFace(n,held,index,clickable){return `<button class="die ${held?'held':''} ${n?'':'empty'}" ${clickable?`data-do="die-hold" data-index="${index}"`:'disabled'} aria-label="${n?`${n} 주사위${held?' 보관 중':''}`:'굴리지 않은 주사위'}">${n?Array.from({length:9},(_,i)=>`<i class="die-pip ${DICE_PIPS[n].includes(i)?'on':''}"></i>`).join(''):'?'}</button>`;}
function diceGame(){const room=S.room,g=room.game,myTurn=g.turn===room.me&&!g.winner;
const scoreTable=`<div class="table-scroll"><table class="score-table"><thead><tr><th>점수 칸</th>${room.players.map(p=>`<th>${esc(p.name)}${p.id===room.me?' · 나':''}</th>`).join('')}</tr></thead><tbody>${g.categories.map(([cat,label])=>`<tr><td>${esc(label)}</td>${room.players.map(p=>{const val=g.scores[p.id][cat];return `<td>${val!==undefined?`<strong>${val}</strong>`:p.id===room.me&&myTurn&&g.rolls>0?`<button class="score-choice" data-do="dice-score" data-category="${cat}" title="${esc(label)}에 기록">${scorePreview(cat,g.dice)}</button>`:'—'}</td>`;}).join('')}</tr>`).join('')}<tr><td>상단 보너스</td>${room.players.map(p=>`<td>${g.bonus[p.id]?'＋35':'—'}</td>`).join('')}</tr><tr><td>합계</td>${room.players.map(p=>`<td><strong>${g.totals[p.id]}</strong></td>`).join('')}</tr></tbody></table></div>`;
const content=`<div class="game-layout"><div class="game-main"><section class="game-panel"><div class="game-panel-head"><div><h2>오늘의 주사위</h2><p class="panel-sub">원하는 주사위를 눌러 보관할 수 있어요.</p></div><span class="pill">${g.rolls} / 3번 굴림</span></div><div class="dice-tray">${g.dice.map((v,i)=>dieFace(v,g.held[i],i,myTurn&&g.rolls>0&&g.rolls<3)).join('')}</div><p class="dice-caption">${myTurn?(g.rolls?'다시 굴리거나, 아래 점수 칸을 선택해요.':'주사위 다섯 개를 굴려 볼까요?'):'친구가 주사위를 고르는 중이에요.'}</p></section><section class="game-panel"><div class="game-panel-head"><div><h2>우리의 점수판</h2><p class="panel-sub">내 차례에 색이 있는 점수 칸을 눌러 기록해요. 점수판을 옆으로 밀어 친구들의 점수도 볼 수 있어요.</p></div></div>${scoreTable}</section></div><aside class="game-aside"><section class="game-panel"><h3>이번 차례</h3><p class="panel-sub" style="margin-bottom:15px">${g.rolls?`남은 굴림 ${3-g.rolls}번`:'최대 세 번 굴릴 수 있어요.'}</p><div class="stack"><button class="button button-primary" data-do="dice-roll" ${!myTurn||g.rolls>=3?'disabled':''}>${g.rolls?'주사위 다시 굴리기':'주사위 굴리기'} ${icon('arrow')}</button></div><div class="hint-card" style="margin-top:14px">한 번이라도 굴린 뒤 점수판에서 빈 칸을 고르면 차례가 끝나요. 점수가 0점이어도 기록할 수 있어요.</div><button class="link-rule" data-do="rules" data-game="dice">점수 규칙 보기</button></section></aside></div>`;
return gameShell(content,myTurn?'굴리고 싶은 주사위만 골라 세 번까지!':'주사위가 굴러가는 동안 다음 전략을 생각해요.');}
function islandSub(g,me){switch(g.phase){
  case 'setup_settlement':return g.turn===me?'초록색 원을 눌러 시작 마을을 놓아요.':'친구가 첫 마을을 놓고 있어요.';
  case 'setup_road':return g.turn===me?'방금 놓은 마을에 이어지는 길을 골라요.':'친구가 마을에 길을 연결하고 있어요.';
  case 'roll':return g.turn===me?'주사위를 굴려 자원을 받아요.':'친구가 주사위를 굴릴 차례예요.';
  case 'discard':return g.pendingDiscard?`가지고 있는 자원 ${g.pendingDiscard}개를 골라 버려야 해요.`:`7이 나와 ${g.pendingCount}명이 자원을 정리하고 있어요.`;
  case 'robber':return g.turn===me?'지도에서 다른 땅을 눌러 도둑을 옮겨요.':'도둑이 이동할 땅을 고르고 있어요.';
  case 'steal':return g.turn===me?'자원을 가져올 친구를 골라 주세요.':'도둑이 자원을 가져갈 친구를 고르고 있어요.';
  case 'free_roads':return g.turn===me?`지도에서 무료 길을 놓아주세요. (${g.freeRoadsLeft}개 남음)`:'친구가 무료 길을 놓고 있어요.';
  case 'main':return g.turn===me?'자원을 교환하거나 건설한 뒤 턴을 마쳐요.':'친구가 교환과 건설을 하고 있어요.';
  case 'special':return g.turn===me?'특별 건설: 건설하거나 발전 카드를 산 뒤 넘겨요. 교환과 카드 사용은 할 수 없어요.':'5~6인 특별 건설을 진행하고 있어요.';
  default:return '즐거운 섬 여행이었어요!';
}}
function islandSvg(g){
  const xs=g.vertices.map(v=>v.x),ys=g.vertices.map(v=>v.y);const minX=Math.min(...xs)-1.15,maxX=Math.max(...xs)+1.15,minY=Math.min(...ys)-1.15,maxY=Math.max(...ys)+1.15;
  const mode=S.islandMode;const legalRoad=new Set(g.legal.roads),legalSettlement=new Set(g.legal.settlements),legalCity=new Set(g.legal.cities),legalRobber=new Set(g.legal.robber);
  let shapes=`<rect x="${minX}" y="${minY}" width="${maxX-minX}" height="${maxY-minY}" fill="#dcece7"/>`;
  for(const t of g.tiles){const points=t.vertices.map(id=>`${g.vertices[id].x},${g.vertices[id].y}`).join(' ');const can=mode==='robber'&&legalRobber.has(t.id);shapes+=`<g ${can?`class="map-action" data-do="island-hex" data-id="${t.id}"`:''}><polygon points="${points}" fill="${R[t.resource].color}" stroke="${can?'#fefdf1':'#f7f6e9'}" stroke-width="${can?'.09':'.045'}"/><text x="${t.x}" y="${t.y-.11}" text-anchor="middle" font-size=".43">${R[t.resource].icon}</text>${t.number?`<circle cx="${t.x}" cy="${t.y+.34}" r=".27" fill="#fffbed" stroke="#e7e2cf" stroke-width=".025"/><text x="${t.x}" y="${t.y+.43}" text-anchor="middle" font-size=".26" font-weight="800" fill="${[6,8].includes(t.number)?'#c4634e':'#4b6654'}">${t.number}</text>`:''}${g.robber===t.id?`<circle cx="${t.x+.51}" cy="${t.y-.52}" r=".22" fill="#334f43"/><text x="${t.x+.51}" y="${t.y-.44}" text-anchor="middle" font-size=".25" fill="#fff">✦</text>`:''}</g>`;}
  const centerX=xs.reduce((a,b)=>a+b,0)/xs.length,centerY=ys.reduce((a,b)=>a+b,0)/ys.length;
  for(const port of g.ports){const e=g.edges[port.edge],a=g.vertices[e.a],b=g.vertices[e.b],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;const dx=mx-centerX,dy=my-centerY,len=Math.hypot(dx,dy)||1,x=mx+.68*dx/len,y=my+.68*dy/len;const label=port.type==='generic'?'3:1':'2:1';const sym=port.type==='generic'?'⚓':R[port.type].icon;
    shapes+=`<line x1="${mx}" y1="${my}" x2="${x}" y2="${y}" stroke="#658d82" stroke-width=".06"/><g><circle cx="${x}" cy="${y}" r=".36" fill="#fffaf0" stroke="#6f9a8d" stroke-width=".035"/><text x="${x}" y="${y-.01}" text-anchor="middle" font-size=".25">${sym}</text><text x="${x}" y="${y+.23}" text-anchor="middle" font-size=".20" font-weight="800" fill="#345e51">${label}</text></g>`;}
  for(const e of g.edges){const a=g.vertices[e.a],b=g.vertices[e.b],legal=mode==='road'&&legalRoad.has(e.id);shapes+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${e.owner?pcolor(e.owner):'#edeee2'}" stroke-width="${e.owner?'.12':'.035'}" stroke-linecap="round"/>`;if(legal){const length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;shapes+=`<g class="map-action" data-do="island-edge" data-id="${e.id}" transform="translate(${a.x} ${a.y}) rotate(${angle})"><rect x="0" y="-.18" width="${length}" height=".36" rx=".18" fill="#fffbe3" opacity=".82"/><line x1="0" y1="0" x2="${length}" y2="0" stroke="#3c7951" stroke-width=".09" stroke-dasharray=".11 .08" stroke-linecap="round"/></g>`;}}
  for(const v of g.vertices){const can=(mode==='settlement'&&legalSettlement.has(v.id))||(mode==='city'&&legalCity.has(v.id));if(v.owner){shapes+=`<g ${can?`class="map-action" data-do="island-vertex" data-id="${v.id}"`:''} transform="translate(${v.x} ${v.y})"><circle r="${can?'.32':'.23'}" fill="${can?'#fffbdc':'#fffdf5'}"/><path d="M-.17,-.03 L0,-.19 L.17,-.03 V.17 H-.17 Z" fill="${pcolor(v.owner)}" stroke="#fff" stroke-width=".035"/>${v.level===2?'<path d="M-.09,.05 H.09 M-.09,.11 H.09" stroke="#fff" stroke-width=".035"/>':''}</g>`;}else if(can){shapes+=`<g class="map-action" data-do="island-vertex" data-id="${v.id}" transform="translate(${v.x} ${v.y})"><circle r=".27" fill="#fffced" opacity=".94"/><circle r=".16" fill="#5d9b69" stroke="#fff" stroke-width=".045"/><text text-anchor="middle" y=".08" fill="#fff" font-size=".23" font-weight="900">+</text></g>`;}}
  return `<svg viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}" role="img" aria-label="섬 게임 지도">${shapes}</svg>`;
}
function resourceOptions(selected){return RESOURCE_KEYS.map(k=>`<option value="${k}" ${selected===k?'selected':''}>${R[k].icon} ${R[k].name}</option>`).join('');}
function resourceText(bundle){const list=RESOURCE_KEYS.filter(k=>bundle[k]>0).map(k=>`${R[k].name} ${bundle[k]}`);return esc(list.join(' · ')||'없음');}
function islandGame(){const room=S.room,g=room.game,me=room.me,myTurn=g.turn===me&&!g.winner;
  const forcedMode=({setup_settlement:'settlement',setup_road:'road',free_roads:'road',robber:'robber'})[g.phase]||null;
  if(S.lastIslandPhase!==g.phase){S.islandMode=forcedMode;S.lastIslandPhase=g.phase;}
  // Polling can skip an intermediate phase: restore required map controls whenever this player gains the turn.
  if(forcedMode)S.islandMode=myTurn?forcedMode:null;
  else if(!myTurn&&g.phase!=='discard')S.islandMode=null;
  const resourceCards=`<div class="resource-bar">${RESOURCE_KEYS.map(k=>`<div class="resource-card"><span>${R[k].icon}</span><small>${R[k].name}</small><strong>${g.me.resources[k]}</strong></div>`).join('')}</div>`;
  let controls='';
  if(g.phase==='discard'&&g.pendingDiscard){controls=`<div class="warning-inline">7이 나왔어요. 자원 <b>${g.pendingDiscard}개</b>를 버려야 해요.</div><div class="resource-inputs" style="margin:12px 0">${RESOURCE_KEYS.map(k=>`<label>${R[k].icon}<br>${R[k].name}<input class="discard-input" data-resource="${k}" type="number" min="0" max="${g.me.resources[k]}" value="0" inputmode="numeric"></label>`).join('')}</div><button class="button button-primary button-full" data-do="island-discard">선택한 자원 버리기</button>`;}
  else if(myTurn&&g.phase==='roll')controls=`<div class="hint-card">주사위 숫자와 같은 땅에 닿은 마을과 도시에 자원이 생겨요.</div><button class="button button-primary button-full" style="margin-top:12px" data-do="island-action" data-type="roll">주사위 굴리기 ${icon('arrow')}</button>`;
  else if(myTurn&&g.phase==='steal')controls=`<p class="panel-sub" style="margin:0 0 10px">도둑 옆의 친구에게서 무작위 자원 1개를 가져와요.</p><div class="stack">${g.victims.map(id=>`<button class="button button-secondary" data-do="island-steal" data-id="${esc(id)}">${esc(pname(id))}에게서 가져오기</button>`).join('')}</div>`;
  else if(myTurn&&g.phase==='free_roads')controls=`<div class="hint-card">지도에 표시된 점선 중 하나를 눌러요. 무료 길 <strong>${g.freeRoadsLeft}개</strong>가 남았어요.</div><button class="button button-outline button-full" style="margin-top:10px" data-do="island-action" data-type="skip_free_roads">남은 무료 길 건너뛰기</button>`;
  else if(myTurn&&(g.phase==='main'||g.phase==='special')){
    const canDev=g.me.resources.wheat>=1&&g.me.resources.sheep>=1&&g.me.resources.ore>=1&&g.devDeckCount>0;
    controls=`<div class="action-grid"><button class="build-button ${S.islandMode==='road'?'active':''}" data-do="island-mode" data-mode="road" ${g.legal.roads.length?'':'disabled'}>길 놓기<small>나무 1 · 벽돌 1</small></button><button class="build-button ${S.islandMode==='settlement'?'active':''}" data-do="island-mode" data-mode="settlement" ${g.legal.settlements.length?'':'disabled'}>마을 짓기<small>나무 · 벽돌 · 곡물 · 양털</small></button><button class="build-button ${S.islandMode==='city'?'active':''}" data-do="island-mode" data-mode="city" ${g.legal.cities.length?'':'disabled'}>도시로 올리기<small>곡물 2 · 광물 3</small></button><button class="build-button" data-do="island-action" data-type="buy_development" ${canDev?'':'disabled'}>발전 카드<small>곡물 · 양털 · 광물</small></button></div>${S.islandMode?`<p class="micro" style="color:#689074;margin:10px 0 0">지도에서 밝게 표시된 자리를 눌러 주세요.</p>`:''}<div class="divider"></div><button class="button button-primary button-full" data-do="island-action" data-type="end_turn">${g.phase==='special'?'특별 건설 마치기':'내 차례 마치기'} ${icon('arrow')}</button>`;
  } else controls=`<div class="hint-card">${g.phase.startsWith('setup_')?'각자 마을 2개와 길 2개를 차례로 놓으며 시작해요.':g.phase==='robber'?'도둑이 있는 땅에서는 자원을 얻을 수 없어요.':'다른 친구의 진행을 기다리는 중이에요.'}</div>`;
  let offer='';if(g.trade){offer=`<section class="game-panel"><h3>열린 교환 제안</h3><div class="trade-offer" style="margin-top:10px"><strong>${esc(pname(g.trade.from))}</strong>님이<br>${resourceText(g.trade.give)} → ${resourceText(g.trade.want)} 교환을 제안했어요.</div>${g.trade.from===me?`<button class="button button-outline button-full button-small" style="margin-top:9px" data-do="island-action" data-type="cancel_trade">제안 취소</button>`:`<button class="button button-secondary button-full button-small" style="margin-top:9px" data-do="island-action" data-type="accept_trade">교환 수락하기</button>`}</section>`;}
  let trades='';if(myTurn&&g.phase==='main'){trades=`<section class="game-panel"><h3>친구와 자원 교환</h3><p class="panel-sub" style="margin-bottom:9px">원하는 자원을 각각 골라 제안해요.</p><strong class="micro">내가 줄 자원</strong><div class="resource-inputs">${RESOURCE_KEYS.map(k=>`<label>${R[k].icon}<br>${R[k].name}<input class="offer-give-input" data-resource="${k}" type="number" min="0" max="${g.me.resources[k]}" value="0" inputmode="numeric"></label>`).join('')}</div><strong class="micro">내가 받을 자원</strong><div class="resource-inputs">${RESOURCE_KEYS.map(k=>`<label>${R[k].icon}<br>${R[k].name}<input class="offer-want-input" data-resource="${k}" type="number" min="0" max="30" value="0" inputmode="numeric"></label>`).join('')}</div><button class="button button-secondary button-full button-small" style="margin-top:11px" data-do="island-offer">교환 제안하기</button><div class="divider"></div><h3>은행·항구 교환</h3><p class="panel-sub" style="margin-bottom:9px">기본 4:1 · 내 항구가 있으면 3:1 또는 2:1</p><p class="micro muted">내 비율: ${RESOURCE_KEYS.map(k=>`${R[k].icon} ${g.me.rates[k]}:1`).join(' &nbsp; ')}</p><div class="mini-form"><label><span class="field-label">줄 자원</span><select class="select" id="bank-give">${resourceOptions('wood')}</select></label><span class="arrow">→</span><label><span class="field-label">받을 자원 1개</span><select class="select" id="bank-want">${resourceOptions('brick')}</select></label></div><button class="button button-outline button-full button-small" style="margin-top:9px" data-do="island-bank">은행과 교환</button><p class="micro muted" style="margin-top:9px">은행 재고: ${RESOURCE_KEYS.map(k=>`${R[k].icon} ${g.bank[k]}`).join(' &nbsp; ')}</p></section>`;}
  const devs=g.me.dev.length?g.me.dev.map((d,i)=>`<div class="card-action"><span><strong>${esc(DEV[d.type])}</strong> ${d.type==='point'?'<small>내 승점에 포함</small>':d.playable?'':`<small>${d.boughtTurn>=g.turnNumber?'다음 내 턴부터 사용':myTurn&&g.phase==='special'?'특별 건설에서는 사용 불가':myTurn&&g.devUsed?'이번 턴 사용 완료':'내 차례에 사용'}</small>`}</span>${d.playable?`<button class="button button-secondary button-small" data-do="island-dev" data-card="${d.type}">사용</button>`:''}</div>`).join(''):`<p class="panel-sub">아직 가진 발전 카드가 없어요.</p>`;
  const content=`<div class="game-layout"><div class="game-main"><section class="game-panel"><div class="game-panel-head"><div><h2>나의 자원</h2><p class="panel-sub">내 자원은 다른 친구에게 보이지 않아요.</p></div><span class="pill">내 승점 ${g.me.points} / ${g.target}</span></div>${resourceCards}</section><section class="game-panel island-board-panel"><div class="game-panel-head" style="padding:7px 8px 0"><div><h2>우리의 섬</h2><p class="panel-sub">${g.lastDice?`최근 주사위 ${g.lastDice[0]} + ${g.lastDice[1]} = ${g.lastDice[0]+g.lastDice[1]}`:'마을과 길을 이어 섬을 넓혀요.'}</p></div><span class="pill">${g.tiles.length}개 땅</span></div><div class="island-viewport">${islandSvg(g)}</div><p class="map-hint">↔ 지도를 옆으로 밀어서 둘러볼 수 있어요.${S.islandMode?' 밝은 표시를 눌러 진행해요.':''}</p></section></div><aside class="game-aside"><section class="game-panel"><div class="game-panel-head"><div><h3>이번 차례</h3><p class="panel-sub">${g.phase.startsWith('setup_')?`시작 준비 ${Math.min(g.setupStep+1,g.setupTotal)} / ${g.setupTotal}`:g.lastDice?`주사위 합 ${g.lastDice[0]+g.lastDice[1]}`:'차례를 따라 함께 진행해요.'}</p></div></div>${controls}</section>${offer}${trades}<section class="game-panel"><h3>나의 발전 카드</h3><p class="panel-sub">남은 카드 ${g.devDeckCount}장 · ${g.devUsed?'이번 턴 사용 완료':'턴당 1장 사용'}</p><div style="margin-top:9px">${devs}</div></section><section class="game-panel"><div class="hint-card"><strong>익숙한 섬 개척 규칙</strong><br>10점이 목표! 5~6명은 예전 특별 건설 차례를 사용해요.</div><button class="link-rule" data-do="rules" data-game="island">전체 규칙과 차이점 보기</button></section></aside></div>`;
return gameShell(content,islandSub(g,me));}
const RULES={
 tile:{title:'타일 클럽 게임 방법',intro:'루미큐브에서 익숙한 조합을 만들고 손패를 먼저 비워요.',items:[
  '각자 14개로 시작해요. 2~4명은 숫자 타일 104개와 조커 2개, 5~6명은 숫자 타일 156개와 조커 4개를 사용해요.',
  '조합은 3개 이상! 같은 숫자에 서로 다른 색, 또는 같은 색에 연속된 숫자로 만들어요. 숫자는 1부터 13까지이며 13 다음에 1을 붙일 수 없어요.',
  '첫 등록은 내 타일만 사용해 30점 이상이어야 해요. 조커는 대신하는 숫자로 계산해요.',
  '등록 후에는 테이블 조합도 재배치할 수 있어요. 내 타일을 최소 한 개 내려놓고, 턴 끝에는 모든 조합과 사용한 조커가 테이블 위에 유효하게 남아야 해요.',
  '놓지 않으면 한 장을 뽑고 턴을 넘겨요. 더미가 비고 모두 넘기면 남은 타일 점수가 가장 낮은 사람이 이겨요. 남은 조커는 30점으로 계산해요.'
 ],note:'익숙한 규칙을 참고한 독립 구현이며 정식 앱은 아니에요. 판본마다 조커 회수 세부 규칙은 다를 수 있어요.'},
 island:{title:'섬 개척 게임 방법',intro:'카탄에서 익숙한 생산·교환·건설로 10점을 모아요.',items:[
  '순서대로 마을과 길을 한 번씩 놓고 역순으로 한 번 더 놓아요. 두 번째 마을 주변 땅에서 자원을 받아요.',
  '차례가 되면 주사위 두 개를 굴려요. 해당 숫자 땅에 닿은 마을은 자원 1개, 도시는 2개를 받아요.',
  '7이 나오면 자원 8개 이상인 사람은 절반을 버려요. 도둑을 옮기고 인접한 상대에게서 자원 하나를 가져와요.',
  '자원을 친구와 교환하거나 은행과 기본 4:1로 바꿔요. 마을·도시가 항구에 닿으면 해당 항구에 따라 3:1 또는 2:1로 교환해요. 은행 자원은 한정되어 있어요.',
  '길·마을·도시를 짓고 발전 카드를 살 수 있어요. 카드 한 장은 산 다음 차례부터, 주사위 전이나 후에 사용할 수 있어요. 마을 1점, 도시 2점, 최장 길과 최대 기사단은 각 2점이에요.',
  '5~6명은 내 차례가 끝난 후 다른 사람들이 순서대로 특별 건설을 할 수 있어요. 특별 건설 중에는 교환과 발전 카드 사용은 할 수 없고, 건설·카드 구매만 가능해요. 자원이 부족하면 자동으로 넘어가요.'
 ],note:'독립 구현으로 공식 카탄 앱이 아닙니다. 5~6인 특별 건설은 사용자가 선택한 예전 판본 방식이며, 최근 판본의 짝 차례 규칙과 달라요. 지형과 항구는 매번 섞입니다.'},
 dice:{title:'요트 주사위 게임 방법',intro:'익숙한 요트 주사위 방식으로 12개 점수 칸을 채워요.',items:[
  '내 차례에 주사위 다섯 개를 최대 세 번 굴려요. 보관할 주사위를 누르면 다음 굴림에서 유지돼요.',
  '한 번 이상 굴린 뒤 빈 점수 칸을 하나 선택하면 턴이 끝나요. 조건에 맞지 않으면 0점을 기록할 수 있어요.',
  '1~6의 눈 합이 63점 이상이면 보너스 35점을 받아요. 초이스는 다섯 눈의 합, 포카드는 같은 눈 4개 이상일 때 다섯 눈의 합이에요.',
  '풀하우스는 서로 다른 3개와 2개가 같을 때 눈의 합, 작은 스트레이트는 서로 다른 숫자 4개 연속이면 15점, 큰 스트레이트는 5개 연속이면 30점이에요. 요트는 모두 같으면 50점이에요.',
  '12칸을 채운 뒤 보너스를 포함한 점수가 가장 높은 사람이 승리해요.'
 ],note:'요트·야추는 판본에 따라 족보 점수가 다를 수 있어요. 이 앱은 위 점수표를 사용해요.'}
};
function renderModal(){if(!S.modal){overlay.innerHTML='';return;}let title='',desc='',body='';
  if(S.modal==='create'){
    title='새로운 게임방 만들기';desc='친구들과 함께할 게임을 골라주세요.';
    body=`<form data-form="create"><label class="field"><span class="field-label">내 닉네임</span><input class="input" id="modal-name" maxlength="12" placeholder="친구들이 알아볼 이름" autocomplete="nickname" value="${esc(S.modalName)}" required></label><span class="field-label">어떤 게임을 할까요?</span><div class="mode-switch">${Object.keys(GAMES).map(k=>`<button type="button" class="mode-option ${S.modalGame===k?'active':''}" data-do="modal-game" data-game="${k}">${GAMES[k].name}</button>`).join('')}</div><p class="micro muted" style="margin:9px 0 20px">${GAMES[S.modalGame].players} · ${GAMES[S.modalGame].time} · ${GAMES[S.modalGame].desc}</p><button class="button button-primary button-full" type="submit">게임방 만들기 ${icon('arrow')}</button><p class="modal-bottom-note">회원가입 없이 바로 시작해요.<br>인터넷 연결이 필요해요.</p></form>`;
  }else if(S.modal==='join'){
    title='친구의 방에 입장하기';desc='친구가 알려준 여덟 자리 코드를 입력해요.';
    body=`<form data-form="join"><label class="field"><span class="field-label">방 코드</span><input class="input code-input" id="modal-code" maxlength="8" placeholder="예: 7KQ4M2XA" value="${esc(S.modalCode)}" autocomplete="off" autocapitalize="characters" required></label><label class="field"><span class="field-label">내 닉네임</span><input class="input" id="modal-name" maxlength="12" placeholder="친구들이 알아볼 이름" value="${esc(S.modalName)}" autocomplete="nickname" required></label><button class="button button-primary button-full" type="submit">게임방에 들어가기 ${icon('arrow')}</button><p class="modal-bottom-note">같은 방의 친구들에게만 닉네임이 보여요.</p></form>`;
  }else if(S.modal==='rules'){
    const rule=RULES[S.modalGame];title=rule.title;desc=rule.intro;
    body=`<ol class="rules-list">${rule.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><div class="rules-note">${esc(rule.note)}</div><button class="button button-secondary button-full" style="margin-top:18px" data-do="close-modal">알겠어요</button>`;
  }else if(S.modal==='change'){
    title='게임 바꾸기';desc='방에 있는 친구들과 다른 게임을 골라요.';
    body=`<div class="stack">${Object.keys(GAMES).map(k=>`<button class="button ${S.room.type===k?'button-primary':'button-secondary'}" data-do="change-game" data-game="${k}">${GAMES[k].name} <span style="margin-left:auto;font-size:11px;opacity:.7">${GAMES[k].players}</span></button>`).join('')}</div>`;
  }else if(S.modal==='dev'){
    const card=S.modalExtra;title=DEV[card]+' 카드 사용';desc=card==='plenty'?'은행에서 받을 자원 두 개를 골라요.':'모든 친구에게서 가져올 자원을 골라요.';
    body=`<form data-form="dev"><label class="field"><span class="field-label">${card==='plenty'?'첫 번째 자원':'자원 종류'}</span><select class="select" id="dev-one">${resourceOptions('wood')}</select></label>${card==='plenty'?`<label class="field"><span class="field-label">두 번째 자원</span><select class="select" id="dev-two">${resourceOptions('brick')}</select></label>`:''}<button class="button button-primary button-full" type="submit">카드 사용하기</button></form>`;
  }else if(S.modal==='share'){
    title='친구 초대하기';desc='링크를 복사해서 친구들에게 보내주세요.';
    body=`<div class="share-card"><img class="share-qr" src="/api/qr?url=${encodeURIComponent(linkFor(S.room.code))}" alt="초대 QR 코드"><div class="share-copy"><strong>방 코드</strong><span class="share-code">${esc(S.room.code)}</span></div></div><label class="field" style="margin-top:18px"><span class="field-label">초대 링크</span><input class="input" id="share-link" value="${esc(linkFor(S.room.code))}" readonly></label><button class="button button-primary button-full" data-do="copy-link">링크 복사하기</button>`;
  }
  overlay.innerHTML=`<div class="modal-shade" data-do="shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="section-kicker">MOA GAME ROOM</div><h2 id="modal-title">${esc(title)}</h2><p>${esc(desc)}</p></div><button class="close-button" data-do="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="modal-body">${body}</div></section></div>`;
}
function render(){
  // Keep in-progress resource input if another player's poll updates the board.
  const controls=['.discard-input','.offer-give-input','.offer-want-input','#bank-give','#bank-want'];
  const saved=[];let activeKey=null;
  for(const selector of controls)for(const el of document.querySelectorAll(selector)){
    const key=selector+(el.dataset.resource?`[data-resource="${el.dataset.resource}"]`:'');saved.push([key,el.value]);if(document.activeElement===el)activeKey=key;
  }
  const oldViewport=qs('.island-viewport'),oldLeft=oldViewport?.scrollLeft,oldTop=oldViewport?.scrollTop;const y=window.scrollY;
  if(!S.room)app.innerHTML=home();
  else if(!S.room.started)app.innerHTML=lobby();
  else if(S.room.game.kind==='tile')app.innerHTML=tileGame();
  else if(S.room.game.kind==='dice')app.innerHTML=diceGame();
  else app.innerHTML=islandGame();
  for(const [key,value] of saved){const el=qs(key);if(el)el.value=value;}
  if(activeKey)qs(activeKey)?.focus({preventScroll:true});
  const vp=qs('.island-viewport');if(vp){vp.scrollLeft=oldLeft??Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);vp.scrollTop=oldTop??0;}
  if(Math.abs(window.scrollY-y)>1)window.scrollTo(0,y);
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('복사했어요! 친구들에게 보내주세요.');return true;}catch{const el=document.createElement('textarea');el.value=text;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();let worked=false;try{worked=document.execCommand('copy');}catch{}el.remove();if(worked)toast('복사했어요! 친구들에게 보내주세요.');return worked;}}
function action(a){emit('game:action',a);}
function moveSelected(target,side){
  const d=S.tileDraft;if(!d||!S.selected.length)return;
  const chosen=[...S.selected],set=new Set(chosen);d.rack=d.rack.filter(id=>!set.has(id));
  for(const group of d.groups)group.tiles=group.tiles.filter(id=>!set.has(id));
  d.groups=d.groups.filter(group=>group.tiles.length||group.gid===target);
  if(target){const group=d.groups.find(x=>x.gid===target);if(!group)return;if(side==='front')group.tiles=[...chosen,...group.tiles];else group.tiles.push(...chosen);}
  else d.groups.push({gid:`new${d.next++}`,tiles:chosen,base:false});
  S.selected=[];render();
}
function leaveRoom(){if(!S.room)return;if(S.room.started&&!S.room.game.winner&&!window.confirm('게임 중 나가면 다른 친구들이 기다려야 할 수 있어요. 나갈까요?'))return;emit('room:leave',{},()=>{clearRoom();toast('방에서 나왔어요.');});}
document.addEventListener('click',async(e)=>{
  const el=e.target.closest('[data-do]');if(!el)return;const cmd=el.dataset.do;
  if(el.tagName==='A')e.preventDefault();
  if(cmd==='shade'){if(e.target===el)closeModal();return;}
  if(cmd==='close-modal'){closeModal();return;}
  if(cmd==='home'){if(S.room)leaveRoom();else{window.scrollTo({top:0,behavior:'smooth'});}return;}
  if(cmd==='nav-games'||cmd==='nav-how'){if(S.room){leaveRoom();setTimeout(()=>qs(cmd==='nav-games'?'#games':'#how')?.scrollIntoView({behavior:'smooth'}),100);}else qs(cmd==='nav-games'?'#games':'#how')?.scrollIntoView({behavior:'smooth'});return;}
  if(cmd==='create-modal'){openModal('create',{game:el.dataset.game||'tile'});return;}
  if(cmd==='join-modal'){openModal('join');return;}
  if(cmd==='modal-game'){S.modalName=qs('#modal-name')?.value||'';S.modalGame=el.dataset.game;renderModal();return;}
  if(cmd==='rules'){openModal('rules',{game:el.dataset.game});return;}
  if(cmd==='change-game-modal'){openModal('change');return;}
  if(cmd==='change-game'){emit('room:change_game',{game:el.dataset.game},()=>closeModal());return;}
  if(cmd==='copy-code'){await copyText(S.room.code);return;}
  if(cmd==='copy-link'){const ok=await copyText(linkFor(S.room.code));if(!ok){qs('#share-link')?.select();toast('링크를 선택했어요. 직접 복사해 주세요.');}return;}
  if(cmd==='share-room'){const url=linkFor(S.room.code);if(navigator.share){try{await navigator.share({title:'모아 게임방 초대',text:`같이 게임하자! 방 코드: ${S.room.code}`,url});return;}catch(err){if(err.name==='AbortError')return;}}openModal('share');return;}
  if(cmd==='remove-player'){emit('room:remove',{playerId:el.dataset.id});return;}
  if(cmd==='start-game'){emit('room:start');return;}
  if(cmd==='leave-room'){leaveRoom();return;}
  if(cmd==='reset-room'){emit('room:reset',{},()=>{S.tileDraft=null;S.lastIslandPhase=null;});return;}
  if(cmd==='tile-select'){const id=el.dataset.id;const i=S.selected.indexOf(id);if(i>=0)S.selected.splice(i,1);else S.selected.push(id);render();return;}
  if(cmd==='tile-new'){moveSelected(null,'back');return;}
  if(cmd==='tile-add'){moveSelected(el.dataset.id,el.dataset.side);return;}
  if(cmd==='tile-reset'){resetTileDraft(S.room.game);render();toast('편집을 취소했어요.');return;}
  if(cmd==='tile-sort'){const d=S.tileDraft;d.rack.sort((a,b)=>{const x=d.tiles[a],y=d.tiles[b];return (x.number??99)-(y.number??99)||x.color.localeCompare(y.color);});render();return;}
  if(cmd==='tile-commit'){action({type:'commit',board:S.tileDraft.groups.map(g=>g.tiles)});return;}
  if(cmd==='tile-draw'){const changed=JSON.stringify(S.tileDraft.groups.map(g=>g.tiles))!==JSON.stringify(S.room.game.board.map(g=>g.map(t=>t.id)));if(changed&&!window.confirm('아직 놓지 않은 편집 내용을 취소하고 타일을 뽑을까요?'))return;action({type:'draw'});return;}
  if(cmd==='dice-roll'){action({type:'roll'});return;}
  if(cmd==='die-hold'){action({type:'hold',index:Number(el.dataset.index)});return;}
  if(cmd==='dice-score'){action({type:'score',category:el.dataset.category});return;}
  if(cmd==='island-action'){action({type:el.dataset.type});return;}
  if(cmd==='island-mode'){S.islandMode=S.islandMode===el.dataset.mode?null:el.dataset.mode;render();if(S.islandMode&&innerWidth<=620)qs('.island-board-panel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(cmd==='island-vertex'){const g=S.room.game;const type=g.phase==='setup_settlement'?'setup_settlement':S.islandMode==='city'?'build_city':'build_settlement';action({type,vertex:Number(el.dataset.id)});return;}
  if(cmd==='island-edge'){const g=S.room.game;action({type:g.phase==='setup_road'?'setup_road':'build_road',edge:Number(el.dataset.id)});return;}
  if(cmd==='island-hex'){action({type:'move_robber',tile:Number(el.dataset.id)});return;}
  if(cmd==='island-steal'){action({type:'steal',target:el.dataset.id});return;}
  if(cmd==='island-discard'){const cards={};document.querySelectorAll('.discard-input').forEach(input=>cards[input.dataset.resource]=Number(input.value));action({type:'discard',cards});return;}
  if(cmd==='island-offer'){const give={},want={};document.querySelectorAll('.offer-give-input').forEach(input=>give[input.dataset.resource]=Number(input.value));document.querySelectorAll('.offer-want-input').forEach(input=>want[input.dataset.resource]=Number(input.value));action({type:'offer_trade',give,want});return;}
  if(cmd==='island-bank'){action({type:'bank_trade',give:qs('#bank-give').value,want:qs('#bank-want').value});return;}
  if(cmd==='island-dev'){const card=el.dataset.card;if(card==='plenty'||card==='monopoly')openModal('dev',{extra:card});else action({type:'play_development',card});return;}
});
document.addEventListener('submit',(e)=>{
  const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();
  if(form.dataset.form==='create'){
    const name=qs('#modal-name').value.trim();if(!name){toast('닉네임을 입력해 주세요.');return;}
    emit('room:create',{name,game:S.modalGame},result=>{persistSeat(result,name);closeModal();window.scrollTo(0,0);});
  }else if(form.dataset.form==='join'){
    const name=qs('#modal-name').value.trim(),code=qs('#modal-code').value.trim().toUpperCase();if(!name||!code){toast('방 코드와 닉네임을 입력해 주세요.');return;}
    emit('room:join',{name,code,token:localStorage.getItem(tokenKey(code))||''},result=>{persistSeat(result,name);closeModal();window.scrollTo(0,0);});
  }else if(form.dataset.form==='dev'){
    const card=S.modalExtra,one=qs('#dev-one').value;const data=card==='plenty'?{type:'play_development',card,resources:[one,qs('#dev-two').value]}:{type:'play_development',card,resource:one};
    emit('game:action',data,()=>closeModal());
  }
});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&S.modal)closeModal();});
if(socket){
  socket.on('connect',()=>{
    S.connected=true;render();
    const code=(S.room?.code||new URLSearchParams(location.search).get('room')||'').toUpperCase();
    if(code){const token=localStorage.getItem(tokenKey(code));if(token){emit('room:join',{code,token,name:localStorage.getItem('moa-name')||''},result=>{persistSeat(result,localStorage.getItem('moa-name')||'친구');});}
      else if(!S.joinHandled){S.joinHandled=true;openModal('join',{code});}}
  });
  socket.on('disconnect',()=>{S.connected=false;render();});
  socket.on('room:state',(room)=>{const wasStarted=S.room?.started;S.room=room;if(!room.started){S.tileDraft=null;S.tileRevision=null;S.lastIslandPhase=null;}if(room.started&&!wasStarted)window.scrollTo(0,0);render();});
  socket.on('room:removed',()=>{clearRoom();closeModal();toast('방에서 나왔어요.');});
  socket.on('room:replaced',()=>{clearRoom();closeModal();toast('같은 기기의 다른 탭에서 방에 접속했어요.');});
}
render();
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
