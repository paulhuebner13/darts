const BOARD_ORDER = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const PROFILE_KEY = 'darts-foxhunt-profiles-v1';
const HISTORY_KEY = 'darts-foxhunt-history-v1';
const SETUP_KEY = 'darts-foxhunt-setup-v1';
const THEME_KEY = 'darts-theme';

const $ = (id) => document.getElementById(id);
const els = {
  setupView:$('setupView'),gameView:$('gameView'),themeToggle:$('themeToggle'),
  playerForm:$('playerForm'),playerName:$('playerName'),profiles:$('profiles'),lineup:$('lineup'),
  variantPicker:$('variantPicker'),startBtn:$('startBtn'),setupMessage:$('setupMessage'),
  history:$('history'),turnRole:$('turnRole'),turnName:$('turnName'),playersBoard:$('playersBoard'),
  targetMode:$('targetMode'),targetValue:$('targetValue'),dartCounter:$('dartCounter'),
  hitBtn:$('hitBtn'),missBtn:$('missBtn'),undoBtn:$('undoBtn'),backSetupBtn:$('backSetupBtn'),
  winDialog:$('winDialog'),winTitle:$('winTitle'),winText:$('winText'),
  rematchBtn:$('rematchBtn'),dialogSetupBtn:$('dialogSetupBtn'),
};

let profiles = load(PROFILE_KEY, []);
let history = load(HISTORY_KEY, []);
let setup = load(SETUP_KEY, { lineup:[], foxName:null, variant:'double' });
let game = null;

function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v ?? fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}
function cleanName(value){return String(value||'').trim().replace(/\s+/g,' ').slice(0,24)}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function boardIndex(number){return BOARD_ORDER.indexOf(Number(number))}
function nextIndex(index){return (index+1)%BOARD_ORDER.length}
function labelTarget(index){const n=BOARD_ORDER[index];return game?.variant==='double'?`D${n}`:String(n)}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme==='dark'?'dark':'light';
  localStorage.setItem(THEME_KEY,theme);
}
function toggleTheme(){applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}

function selectedNames(){return Array.isArray(setup.lineup)?setup.lineup:[]}
function isSelected(name){return selectedNames().includes(name)}

function persistSetup(){
  setup.lineup=[...new Set(selectedNames().filter((name)=>profiles.some((p)=>p.name===name)))];
  if(!setup.lineup.includes(setup.foxName))setup.foxName=null;
  save(SETUP_KEY,setup);
}

function renderProfiles(){
  if(!profiles.length){
    els.profiles.innerHTML='<div class="hint">Noch keine Spieler angelegt.</div>';
    return;
  }
  els.profiles.innerHTML=profiles.map((profile)=>`
    <div class="profile-row">
      <span>${escapeHtml(profile.name)}</span>
      <button class="${isSelected(profile.name)?'primary':'secondary'}" type="button" data-add="${escapeHtml(profile.name)}">
        ${isSelected(profile.name)?'Dabei':'Hinzufügen'}
      </button>
      <button class="quiet" type="button" data-delete="${escapeHtml(profile.name)}">×</button>
    </div>`).join('');
}

function renderLineup(){
  persistSetup();
  if(!setup.lineup.length){
    els.lineup.innerHTML='<div class="hint">Mindestens zwei Spieler auswählen.</div>';
  }else{
    els.lineup.innerHTML=setup.lineup.map((name)=>`
      <div class="lineup-row ${setup.foxName===name?'fox-selected':''}">
        <strong>${escapeHtml(name)}</strong>
        <button class="fox-select ${setup.foxName===name?'active':''}" type="button" data-fox="${escapeHtml(name)}">
          ${setup.foxName===name?'Fuchs':'Fuchs'}
        </button>
        <button class="quiet" type="button" data-remove="${escapeHtml(name)}">×</button>
      </div>`).join('');
  }
  els.variantPicker.querySelectorAll('[data-variant]').forEach((b)=>b.classList.toggle('active',b.dataset.variant===setup.variant));
  els.startBtn.disabled=setup.lineup.length<2||!setup.foxName;
}

function renderHistory(){
  if(!history.length){
    els.history.className='history empty';
    els.history.textContent='Noch kein Spiel gespeichert.';
    return;
  }
  els.history.className='history';
  els.history.innerHTML=[...history].reverse().slice(0,20).map((item)=>`
    <div class="history-row">
      <span><b>${escapeHtml(item.winner)}</b> · ${item.winnerRole==='fox'?'Fuchs':'Jäger'}</span>
      <span>${item.variant==='double'?'Double':'Segment'} · ${new Date(item.finishedAt).toLocaleDateString('de-AT')}</span>
    </div>`).join('');
}

function createGame(){
  const hunters=setup.lineup.filter((name)=>name!==setup.foxName);
  const ordered=[setup.foxName,...hunters];
  return {
    id:uid(),variant:setup.variant,startedAt:Date.now(),turn:0,dart:0,finished:false,winner:null,winnerRole:null,
    undo:[],
    players:ordered.map((name,index)=>({
      name,role:index===0?'fox':'hunter',
      pos:index===0?boardIndex(18):boardIndex(20),
      foxSteps:0,
    }))
  };
}

function snapshot(){
  return JSON.parse(JSON.stringify({
    turn:game.turn,dart:game.dart,finished:game.finished,winner:game.winner,winnerRole:game.winnerRole,players:game.players
  }));
}
function pushUndo(){game.undo.push(snapshot());if(game.undo.length>80)game.undo.shift()}
function restore(snap){
  game.turn=snap.turn;game.dart=snap.dart;game.finished=snap.finished;game.winner=snap.winner;game.winnerRole=snap.winnerRole;
  game.players=snap.players;renderGame();
}

function currentPlayer(){return game.players[game.turn]}
function foxPlayer(){return game.players.find((p)=>p.role==='fox')}

function renderGame(){
  const p=currentPlayer();
  els.turnRole.textContent=p.role==='fox'?'Fuchs':'Jäger';
  els.turnName.textContent=p.name;
  els.targetMode.textContent=game.variant==='double'?'DOUBLE':'SEGMENT';
  els.targetValue.textContent=BOARD_ORDER[p.pos];
  els.dartCounter.textContent=`Dart ${game.dart+1} von 3`;
  els.undoBtn.disabled=!game.undo.length;

  els.playersBoard.innerHTML=game.players.map((player,index)=>`
    <div class="game-player ${index===game.turn?'current':''} ${player.role==='fox'?'fox-player':''}">
      <div>
        <div class="role-line"><span class="role-dot"></span><strong>${escapeHtml(player.name)}</strong></div>
        <span class="role-label">${player.role==='fox'?'Fuchs':'Jäger'}</span>
      </div>
      <div class="player-target">${game.variant==='double'?'D':''}${BOARD_ORDER[player.pos]}</div>
    </div>`).join('');
}

function nextTurn(){
  game.turn=(game.turn+1)%game.players.length;
  game.dart=0;
  renderGame();
}

function finishGame(winner,role,text){
  game.finished=true;game.winner=winner;game.winnerRole=role;
  history.push({id:game.id,finishedAt:Date.now(),winner,winnerRole:role,variant:game.variant,players:game.players.map((p)=>p.name)});
  history=history.slice(-100);save(HISTORY_KEY,history);renderHistory();
  els.winTitle.textContent=role==='fox'?`${winner} entkommt!`:`${winner} fängt den Fuchs!`;
  els.winText.textContent=text;
  els.winDialog.showModal();
}

function recordThrow(hit){
  if(!game||game.finished)return;
  pushUndo();
  const p=currentPlayer();

  if(hit){
    p.pos=nextIndex(p.pos);

    if(p.role==='fox'){
      p.foxSteps+=1;
      if(p.foxSteps>=BOARD_ORDER.length){
        finishGame(p.name,'fox','Der Fuchs hat die komplette Runde geschafft und ist zurück auf der 18.');
        return;
      }
    }else{
      const fox=foxPlayer();
      if(p.pos===fox.pos){
        finishGame(p.name,'hunter',`${p.name} ist auf ${BOARD_ORDER[p.pos]} gelandet und hat den Fuchs erwischt.`);
        return;
      }
    }
  }

  game.dart+=1;
  if(game.dart>=3)nextTurn();
  else renderGame();
}

function showSetup(){
  els.winDialog.close();
  els.gameView.classList.remove('active');els.setupView.classList.add('active');
  game=null;renderProfiles();renderLineup();renderHistory();
}

function start(){
  if(setup.lineup.length<2||!setup.foxName)return;
  game=createGame();
  els.setupView.classList.remove('active');els.gameView.classList.add('active');
  renderGame();
}

els.playerForm.addEventListener('submit',(e)=>{
  e.preventDefault();const name=cleanName(els.playerName.value);if(!name)return;
  if(!profiles.some((p)=>p.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'))){
    profiles.push({id:uid(),name});save(PROFILE_KEY,profiles);
  }
  const canonical=profiles.find((p)=>p.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de')).name;
  if(!setup.lineup.includes(canonical))setup.lineup.push(canonical);
  els.playerName.value='';persistSetup();renderProfiles();renderLineup();
});

els.profiles.addEventListener('click',(e)=>{
  const add=e.target.closest('[data-add]'),del=e.target.closest('[data-delete]');
  if(add){
    const name=add.dataset.add;
    if(isSelected(name))setup.lineup=setup.lineup.filter((x)=>x!==name);else setup.lineup.push(name);
    persistSetup();renderProfiles();renderLineup();
  }
  if(del){
    const name=del.dataset.delete;
    profiles=profiles.filter((p)=>p.name!==name);setup.lineup=setup.lineup.filter((x)=>x!==name);
    if(setup.foxName===name)setup.foxName=null;
    save(PROFILE_KEY,profiles);persistSetup();renderProfiles();renderLineup();
  }
});

els.lineup.addEventListener('click',(e)=>{
  const fox=e.target.closest('[data-fox]'),remove=e.target.closest('[data-remove]');
  if(fox){setup.foxName=fox.dataset.fox;persistSetup();renderLineup()}
  if(remove){
    const name=remove.dataset.remove;setup.lineup=setup.lineup.filter((x)=>x!==name);
    if(setup.foxName===name)setup.foxName=null;persistSetup();renderProfiles();renderLineup();
  }
});

els.variantPicker.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-variant]');if(!b)return;setup.variant=b.dataset.variant;persistSetup();renderLineup();
});

els.startBtn.addEventListener('click',start);
els.hitBtn.addEventListener('click',()=>recordThrow(true));
els.missBtn.addEventListener('click',()=>recordThrow(false));
els.undoBtn.addEventListener('click',()=>{if(game?.undo.length)restore(game.undo.pop())});
els.backSetupBtn.addEventListener('click',showSetup);
els.dialogSetupBtn.addEventListener('click',showSetup);
els.rematchBtn.addEventListener('click',()=>{
  els.winDialog.close();game=createGame();els.setupView.classList.remove('active');els.gameView.classList.add('active');renderGame();
});
els.themeToggle.addEventListener('click',toggleTheme);

applyTheme(localStorage.getItem(THEME_KEY)||'light');
renderProfiles();renderLineup();renderHistory();
