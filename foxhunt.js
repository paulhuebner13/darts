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
  clearHistoryBtn:$('clearHistoryBtn'),foxStats:$('foxStats'),
  versusBoard:$('versusBoard'),huntRing:$('huntRing'),distanceNumber:$('distanceNumber'),
  hitCountPicker:$('hitCountPicker'),continueBtn:$('continueBtn'),undoBtn:$('undoBtn'),backSetupBtn:$('backSetupBtn'),
  winDialog:$('winDialog'),winTitle:$('winTitle'),winText:$('winText'),
  rematchBtn:$('rematchBtn'),dialogSetupBtn:$('dialogSetupBtn')
};

let profiles=load(PROFILE_KEY,[]);
let history=load(HISTORY_KEY,[]);
let setup=load(SETUP_KEY,{lineup:[],foxName:null,variant:'double'});
let game=null;
let selectedDarts=[false,false,false];

function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function variantLabel(variant){
  return ({segment:'Segment',double:'Double',triple:'Triple'})[variant]||'Double';
}
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
    <div class="history-row"><span>${esc(h.winner)}</span><span>${h.winnerRole==='fox'?'Fuchs':'Jäger'} · ${variantLabel(h.variant)}</span></div>`).join('');
}


function renderStats(){
  if(!els.foxStats)return;

  if(!history.length){
    els.foxStats.innerHTML='<div class="empty-copy">Noch keine Statistik.</div>';
    return;
  }

  const total=history.length;
  const foxWins=history.filter((h)=>h.winnerRole==='fox').length;
  const hunterWins=history.filter((h)=>h.winnerRole==='hunter').length;
  const byVariant=['segment','double','triple'].map((variant)=>({
    variant,
    games:history.filter((h)=>h.variant===variant).length,
  }));

  const winners=new Map();
  history.forEach((h)=>{
    winners.set(h.winner,(winners.get(h.winner)||0)+1);
  });
  const top=[...winners.entries()].sort((a,b)=>b[1]-a[1])[0];

  els.foxStats.innerHTML=`
    <div class="stats-grid">
      <div class="stat-box"><span>Spiele</span><strong>${total}</strong></div>
      <div class="stat-box"><span>Fuchs-Siege</span><strong>${foxWins}</strong></div>
      <div class="stat-box"><span>Jäger-Siege</span><strong>${hunterWins}</strong></div>
      <div class="stat-box"><span>Meiste Siege</span><strong>${top?esc(top[0]):'–'}</strong><small>${top?top[1]+'×':''}</small></div>
    </div>
    <div class="variant-stats">
      ${byVariant.map((row)=>`<span>${variantLabel(row.variant)} <b>${row.games}</b></span>`).join('')}
    </div>`;
}

function clearHistory(){
  if(!history.length)return;
  if(!window.confirm('Kompletten Fuchsjagd-Verlauf löschen?'))return;
  history=[];
  save(HISTORY_KEY,history);
  renderHistory();
  renderStats();
}
function createGame(){
  const hunter=setup.lineup.find((name)=>name!==setup.foxName);
  return {
    id:uid(),variant:setup.variant,turn:0,undo:[],finished:false,
    visits:0,totalHits:0,totalDarts:0,
    players:[
      {name:setup.foxName,role:'fox',pos:idx(18),steps:0},
      {name:hunter,role:'hunter',pos:idx(20),steps:0}
    ]
  };
}

function snap(){return JSON.parse(JSON.stringify({turn:game.turn,players:game.players,finished:game.finished,selectedDarts,visits:game.visits,totalHits:game.totalHits,totalDarts:game.totalDarts}))}
function pushUndo(){game.undo.push(snap());if(game.undo.length>60)game.undo.shift()}
function restore(s){game.turn=s.turn;game.players=s.players;game.finished=s.finished;game.visits=Number(s.visits)||0;game.totalHits=Number(s.totalHits)||0;game.totalDarts=Number(s.totalDarts)||0;selectedDarts=Array.isArray(s.selectedDarts)?s.selectedDarts.slice(0,3):[false,false,false];while(selectedDarts.length<3)selectedDarts.push(false);renderGame()}
function current(){return game.players[game.turn]}
function fox(){return game.players.find((p)=>p.role==='fox')}
function hunter(){return game.players.find((p)=>p.role==='hunter')}

function forwardDistance(from,to){
  return (to-from+BOARD_ORDER.length)%BOARD_ORDER.length;
}

function hunterDistanceToFox(){
  return forwardDistance(hunter().pos, fox().pos);
}

function distanceInfo(player){
  const d=hunterDistanceToFox();
  if(player.role==='hunter'){
    if(d===0)return 'Fuchs erreicht';
    return `${d} Feld${d===1?'':'er'} bis Fuchs`;
  }
  if(d===0)return 'Jäger auf Feld';
  return `${d} Feld${d===1?'':'er'} Vorsprung`;
}

function polarPoint(cx, cy, radius, angleDeg){
  const angle=(angleDeg-90)*Math.PI/180;
  return {
    x:cx+radius*Math.cos(angle),
    y:cy+radius*Math.sin(angle)
  };
}

function donutPath(cx,cy,innerRadius,outerRadius,startAngle,endAngle){
  const outerStart=polarPoint(cx,cy,outerRadius,startAngle);
  const outerEnd=polarPoint(cx,cy,outerRadius,endAngle);
  const innerEnd=polarPoint(cx,cy,innerRadius,endAngle);
  const innerStart=polarPoint(cx,cy,innerRadius,startAngle);
  const largeArc=endAngle-startAngle>180?1:0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ');
}

function renderHuntRing(){
  const foxPos=fox().pos;
  const hunterPos=hunter().pos;
  const size=320;
  const center=size/2;
  const outer=145;
  const inner=86;
  const segmentAngle=360/BOARD_ORDER.length;
  const gap=.8;

  const segments=BOARD_ORDER.map((number,index)=>{
    const rotationOffset=-segmentAngle/2;
    const start=index*segmentAngle+rotationOffset+gap/2;
    const end=(index+1)*segmentAngle+rotationOffset-gap/2;
    const mid=index*segmentAngle+rotationOffset+segmentAngle/2;
    const labelPoint=polarPoint(center,center,(outer+inner)/2,mid);
    const isFox=index===foxPos;
    const isHunter=index===hunterPos;
    const classes=[
      'donut-segment',
      isFox?'fox-pos':'',
      isHunter?'hunter-pos':'',
      isFox&&isHunter?'same-pos':''
    ].filter(Boolean).join(' ');

    return `
      <path class="${classes}" d="${donutPath(center,center,inner,outer,start,end)}"></path>
      <text class="donut-number ${isFox||isHunter?'occupied':''}"
        x="${labelPoint.x}" y="${labelPoint.y}"
        text-anchor="middle" dominant-baseline="middle">${number}</text>`;
  }).join('');

  els.huntRing.innerHTML=`
    <svg class="hunt-ring-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Positionen auf dem Dartboard">
      <circle class="ring-outer-line" cx="${center}" cy="${center}" r="${outer}"></circle>
      ${segments}
      <circle class="ring-inner-line" cx="${center}" cy="${center}" r="${inner}"></circle>
    </svg>`;

  els.distanceNumber.textContent=String(hunterDistanceToFox());
}

function renderHitPicker(){
  els.hitCountPicker.querySelectorAll('[data-hits]').forEach((button)=>{
    const dartIndex=Number(button.dataset.hits)-1;
    button.classList.toggle('active', Boolean(selectedDarts[dartIndex]));
  });
}

function flashMissedDarts(){
  els.hitCountPicker.querySelectorAll('[data-hits]').forEach((button)=>{
    const dartIndex=Number(button.dataset.hits)-1;
    if(selectedDarts[dartIndex])return;
    button.classList.remove('miss-flash');
    void button.offsetWidth;
    button.classList.add('miss-flash');
    window.setTimeout(()=>button.classList.remove('miss-flash'),320);
  });
}

function renderGame(){
  const active=current();
  els.versusBoard.innerHTML=game.players.map((p,index)=>`
    <article class="player-board ${index===game.turn?'active':''} ${p.role}">
      <div class="player-board-top">
        <span>${p.role==='fox'?'Fuchs':'Jäger'}</span>
        <strong>${esc(p.name)}</strong>
      </div>
      <div class="target-label">${game.variant==='double'?'D':game.variant==='triple'?'T':''}${BOARD_ORDER[p.pos]}</div>
      <div class="distance-label">${distanceInfo(p)}</div>
    </article>`).join('');

  renderHuntRing();
  renderHitPicker();
  els.undoBtn.disabled=!game.undo.length;
}

function nextTurn(){game.turn=(game.turn+1)%2;selectedDarts=[false,false,false];renderGame()}

function finish(winner,role){
  game.finished=true;
  history.push({
    id:game.id,
    finishedAt:Date.now(),
    winner,
    winnerRole:role,
    variant:game.variant,
    visits:game.visits,
    totalHits:game.totalHits,
    totalDarts:game.totalDarts
  });
  history=history.slice(-100);save(HISTORY_KEY,history);renderHistory();renderStats();
  els.winTitle.textContent=role==='fox'?`${winner} entkommt`:`${winner} gewinnt`;
  els.winText.textContent=role==='fox'?'Runde geschafft.':'Fuchs eingeholt.';
  els.winDialog.showModal();
}

function applyVisit(){
  if(!game||game.finished)return;

  flashMissedDarts();
  pushUndo();
  const p=current();
  const hitCount=selectedDarts.filter(Boolean).length;
  game.visits=(Number(game.visits)||0)+1;
  game.totalDarts=(Number(game.totalDarts)||0)+3;
  game.totalHits=(Number(game.totalHits)||0)+hitCount;

  for(let dartIndex=0;dartIndex<3;dartIndex++){
    if(!selectedDarts[dartIndex])continue;

    p.pos=next(p.pos);

    if(p.role==='fox'){
      p.steps++;
      if(p.steps>=BOARD_ORDER.length){
        window.setTimeout(()=>finish(p.name,'fox'),180);
        return;
      }
    }else if(p.pos===fox().pos){
      window.setTimeout(()=>finish(p.name,'hunter'),180);
      return;
    }
  }

  window.setTimeout(nextTurn,180);
}

function showSetup(){
  if(els.winDialog.open)els.winDialog.close();
  game=null;els.gameView.classList.remove('active');els.setupView.classList.add('active');
  renderProfiles();renderLineup();renderHistory();renderStats();
}

function start(){
  if(setup.lineup.length!==2||!setup.foxName)return;
  game=createGame();selectedDarts=[false,false,false];
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

els.clearHistoryBtn?.addEventListener('click',clearHistory);
els.startBtn.addEventListener('click',start);
els.hitCountPicker.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-hits]');if(!b)return;
  const dartIndex=Number(b.dataset.hits)-1;
  if(dartIndex<0||dartIndex>2)return;
  selectedDarts[dartIndex]=!selectedDarts[dartIndex];
  renderHitPicker();
});
els.continueBtn.addEventListener('click',applyVisit);
els.undoBtn.addEventListener('click',()=>{if(game?.undo.length)restore(game.undo.pop())});
els.backSetupBtn.addEventListener('click',showSetup);
els.dialogSetupBtn.addEventListener('click',showSetup);
els.rematchBtn.addEventListener('click',()=>{els.winDialog.close();game=createGame();selectedDarts=[false,false,false];els.setupView.classList.remove('active');els.gameView.classList.add('active');renderGame()});
els.themeToggle.addEventListener('click',toggleTheme);

applyTheme(localStorage.getItem(THEME_KEY)||'light');
renderProfiles();renderLineup();renderHistory();renderStats();void syncProfiles();
window.setInterval(()=>{if(!document.hidden)void syncProfiles()},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncProfiles()});
