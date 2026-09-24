const BOARD_ORDER = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const PROFILE_KEY = "darts-cricket-profiles-v1";
const SETUP_KEY = 'darts-foxhunt-setup-v2';
const HISTORY_KEY = 'darts-foxhunt-history-v1';
const THEME_KEY = 'darts-theme';

const $=(id)=>document.getElementById(id);
const els={
  setupView:$('setupView'),gameView:$('gameView'),themeToggle:$('themeToggle'),
  profiles:$('profiles'),lineup:$('lineup'),variantPicker:$('variantPicker'),
  startBtn:$('startBtn'),setupMessage:$('setupMessage'),history:$('history'),
  versusBoard:$('versusBoard'),dartDots:$('dartDots'),
  missBtn:$('missBtn'),hitBtn:$('hitBtn'),undoBtn:$('undoBtn'),backSetupBtn:$('backSetupBtn'),
  winDialog:$('winDialog'),winTitle:$('winTitle'),winText:$('winText'),
  rematchBtn:$('rematchBtn'),dialogSetupBtn:$('dialogSetupBtn')
};

let profiles=load(PROFILE_KEY,[]);
let history=load(HISTORY_KEY,[]);
let setup=load(SETUP_KEY,{lineup:[],foxName:null,variant:'double'});
let game=null;

function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function idx(n){return BOARD_ORDER.indexOf(Number(n))}
function next(i){return (i+1)%BOARD_ORDER.length}
function applyTheme(theme){document.documentElement.dataset.theme=theme==='dark'?'dark':'light';localStorage.setItem(THEME_KEY,theme)}
function toggleTheme(){applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}

function supabaseConfig(){
  const c=globalThis.DARTS_SUPABASE||{};
  return {url:String(c.url||'').replace(/\/+$/,''),anonKey:String(c.anonKey||'')};
}
function supabaseEnabled(){const c=supabaseConfig();return Boolean(c.url&&c.anonKey)}
function supabaseHeaders(){const c=supabaseConfig();return {apikey:c.anonKey,Authorization:`Bearer ${c.anonKey}`}}

function normalizeSharedProfiles(items){
  return (Array.isArray(items)?items:[])
    .map((p)=>({id:p.id||`shared-${String(p.name||'').toLocaleLowerCase('de')}`,name:String(p.name||'').trim()}))
    .filter((p)=>p.name);
}

async function syncProfiles(){
  if(!supabaseEnabled()){
    profiles=normalizeSharedProfiles(load(PROFILE_KEY,profiles));
    renderProfiles();renderLineup();return;
  }
  try{
    const c=supabaseConfig();
    const r=await fetch(`${c.url}/rest/v1/cricket_players?select=name&order=name.asc`,{headers:supabaseHeaders()});
    if(!r.ok)throw new Error();
    const rows=await r.json();
    profiles=normalizeSharedProfiles(rows);
    save(PROFILE_KEY,profiles);
    const allowed=new Set(profiles.map((p)=>p.name.toLocaleLowerCase('de')));
    setup.lineup=(setup.lineup||[]).filter((name)=>allowed.has(String(name).toLocaleLowerCase('de')));
    if(!setup.lineup.includes(setup.foxName))setup.foxName=null;
    save(SETUP_KEY,setup);
    renderProfiles();renderLineup();
  }catch{
    profiles=normalizeSharedProfiles(load(PROFILE_KEY,profiles));
    renderProfiles();renderLineup();
  }
}

function selected(name){return (setup.lineup||[]).includes(name)}
function persist(){
  setup.lineup=[...new Set((setup.lineup||[]).filter((name)=>profiles.some((p)=>p.name===name)))];
  if(!setup.lineup.includes(setup.foxName))setup.foxName=null;
  save(SETUP_KEY,setup);
}

function renderProfiles(){
  if(!profiles.length){
    els.profiles.innerHTML='<div class="empty-copy">Keine Spieler vorhanden.</div>';
    return;
  }
  els.profiles.innerHTML=profiles.map((p)=>`
    <button type="button" class="profile-chip ${selected(p.name)?'active':''}" data-player="${esc(p.name)}">
      ${esc(p.name)}
    </button>`).join('');
}

function renderLineup(){
  persist();
  if(!setup.lineup.length){
    els.lineup.innerHTML='<div class="empty-copy">Spieler auswählen.</div>';
  }else{
    els.lineup.innerHTML=setup.lineup.map((name)=>`
      <button type="button" class="fox-choice ${setup.foxName===name?'active':''}" data-fox="${esc(name)}">
        ${esc(name)}${setup.foxName===name?' · Fuchs':''}
      </button>`).join('');
  }
  els.variantPicker.querySelectorAll('[data-variant]').forEach((b)=>b.classList.toggle('active',b.dataset.variant===setup.variant));
  els.startBtn.disabled=setup.lineup.length!==2||!setup.foxName;
}

function renderHistory(){
  if(!history.length){
    els.history.className='history empty';els.history.textContent='Noch kein Spiel.';return;
  }
  els.history.className='history';
  els.history.innerHTML=[...history].reverse().slice(0,16).map((h)=>`
    <div class="history-row"><span>${esc(h.winner)}</span><span>${h.winnerRole==='fox'?'Fuchs':'Jäger'} · ${h.variant==='double'?'Double':'Segment'}</span></div>`).join('');
}

function createGame(){
  const hunter=setup.lineup.find((name)=>name!==setup.foxName);
  return {
    id:uid(),variant:setup.variant,turn:0,dart:0,undo:[],finished:false,
    players:[
      {name:setup.foxName,role:'fox',pos:idx(18),steps:0},
      {name:hunter,role:'hunter',pos:idx(20),steps:0}
    ]
  };
}

function snap(){return JSON.parse(JSON.stringify({turn:game.turn,dart:game.dart,players:game.players,finished:game.finished}))}
function pushUndo(){game.undo.push(snap());if(game.undo.length>60)game.undo.shift()}
function restore(s){game.turn=s.turn;game.dart=s.dart;game.players=s.players;game.finished=s.finished;renderGame()}
function current(){return game.players[game.turn]}
function fox(){return game.players.find((p)=>p.role==='fox')}
function hunter(){return game.players.find((p)=>p.role==='hunter')}

function forwardDistance(from,to){
  return (to-from+BOARD_ORDER.length)%BOARD_ORDER.length;
}
function distanceInfo(player){
  const other=player.role==='fox'?hunter():fox();
  const d=forwardDistance(player.pos,other.pos);
  if(player.role==='hunter'){
    if(d===0)return 'Fuchs erreicht';
    return `${d} Feld${d===1?'':'er'} bis Fuchs`;
  }
  const away=forwardDistance(other.pos,player.pos);
  return `${away} Feld${away===1?'':'er'} vor Jäger`;
}

function renderGame(){
  const active=current();
  els.versusBoard.innerHTML=game.players.map((p,index)=>`
    <article class="player-board ${index===game.turn?'active':''} ${p.role}">
      <div class="player-board-top">
        <span>${p.role==='fox'?'Fuchs':'Jäger'}</span>
        <strong>${esc(p.name)}</strong>
      </div>
      <div class="target-label">${game.variant==='double'?'D':''}${BOARD_ORDER[p.pos]}</div>
      <div class="distance-label">${distanceInfo(p)}</div>
    </article>`).join('');

  [...els.dartDots.children].forEach((dot,index)=>dot.classList.toggle('used',index<game.dart));
  els.undoBtn.disabled=!game.undo.length;
}

function nextTurn(){game.turn=(game.turn+1)%2;game.dart=0;renderGame()}

function finish(winner,role){
  game.finished=true;
  history.push({id:game.id,finishedAt:Date.now(),winner,winnerRole:role,variant:game.variant});
  history=history.slice(-100);save(HISTORY_KEY,history);renderHistory();
  els.winTitle.textContent=role==='fox'?`${winner} entkommt`:`${winner} gewinnt`;
  els.winText.textContent=role==='fox'?'Runde geschafft.':'Fuchs eingeholt.';
  els.winDialog.showModal();
}

function throwDart(hit){
  if(!game||game.finished)return;
  pushUndo();
  const p=current();
  if(hit){
    p.pos=next(p.pos);
    if(p.role==='fox'){
      p.steps++;
      if(p.steps>=BOARD_ORDER.length){finish(p.name,'fox');return}
    }else if(p.pos===fox().pos){finish(p.name,'hunter');return}
  }
  game.dart++;
  if(game.dart>=3)nextTurn();else renderGame();
}

function showSetup(){
  if(els.winDialog.open)els.winDialog.close();
  game=null;els.gameView.classList.remove('active');els.setupView.classList.add('active');
  renderProfiles();renderLineup();renderHistory();
}

function start(){
  if(setup.lineup.length!==2||!setup.foxName)return;
  game=createGame();
  els.setupView.classList.remove('active');els.gameView.classList.add('active');
  renderGame();
}

els.profiles.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-player]');if(!b)return;
  const name=b.dataset.player;
  if(selected(name))setup.lineup=setup.lineup.filter((x)=>x!==name);
  else if(setup.lineup.length<2)setup.lineup.push(name);
  else{setup.lineup=[setup.lineup[1],name];if(!setup.lineup.includes(setup.foxName))setup.foxName=null}
  persist();renderProfiles();renderLineup();
});

els.lineup.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-fox]');if(!b)return;
  setup.foxName=b.dataset.fox;persist();renderLineup();
});

els.variantPicker.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-variant]');if(!b)return;
  setup.variant=b.dataset.variant;persist();renderLineup();
});

els.startBtn.addEventListener('click',start);
els.hitBtn.addEventListener('click',()=>throwDart(true));
els.missBtn.addEventListener('click',()=>throwDart(false));
els.undoBtn.addEventListener('click',()=>{if(game?.undo.length)restore(game.undo.pop())});
els.backSetupBtn.addEventListener('click',showSetup);
els.dialogSetupBtn.addEventListener('click',showSetup);
els.rematchBtn.addEventListener('click',()=>{els.winDialog.close();game=createGame();els.setupView.classList.remove('active');els.gameView.classList.add('active');renderGame()});
els.themeToggle.addEventListener('click',toggleTheme);

applyTheme(localStorage.getItem(THEME_KEY)||'light');
renderProfiles();renderLineup();renderHistory();void syncProfiles();
window.setInterval(()=>{if(!document.hidden)void syncProfiles()},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncProfiles()});
