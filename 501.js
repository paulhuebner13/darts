"use strict";
const PROFILE_KEY='darts-cricket-profiles-v1',ACTIVE_KEY='darts-501-active-v3',HISTORY_KEY='darts-501-history-v1',THEME_KEY='darts-trainer-theme';
const LEVELS=[['rookie','Anfänger',.30],['casual','Leicht',.43],['normal','Mittel',.57],['strong','Schwer',.72],['expert','Profi',.86]];
const $=id=>document.getElementById(id),load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},save=(k,v)=>localStorage.setItem(k,JSON.stringify(v)),clone=x=>JSON.parse(JSON.stringify(x)),uid=p=>`${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let profiles=load(PROFILE_KEY,[]),lineup=[],game=null,mult=1,botTimer=null,botBusy=false;
function theme(){document.body.classList.toggle('dark',localStorage.getItem(THEME_KEY)==='dark')}theme();$('themeToggle').onclick=()=>{localStorage.setItem(THEME_KEY,document.body.classList.contains('dark')?'light':'dark');theme()};
function levelInfo(k){return LEVELS.find(x=>x[0]===k)||LEVELS[2]}function human(p){return{id:uid('seat'),profileId:p.id,name:p.name,type:'human'}}function bot(k){let l=levelInfo(k);return{id:uid('bot'),name:`Bot ${l[1]}`,type:'bot',level:k}}
function typeLabel(p){return p.type==='bot'?`Bot · ${levelInfo(p.level)[1]}`:'Mensch'}
function renderSetup(){
 $('savedPlayers').innerHTML=profiles.map(p=>`<div class="profile-row"><strong>${p.name}</strong><button class="mini" data-add="${p.id}">+</button></div>`).join('');
 $('lineup').className=lineup.length?'':'empty';
 $('lineup').innerHTML=lineup.length?lineup.map((p,i)=>`<div class="lineup-row"><span><strong>${i+1}. ${p.name}</strong><br><small class="muted">${typeLabel(p)}</small></span><button class="mini" data-rm="${p.id}">×</button></div>`).join(''):'Noch niemand ausgewählt.';
 $('startBtn').disabled=lineup.length<1
}
$('nameForm').onsubmit=e=>{e.preventDefault();let n=$('nameInput').value.trim();if(!n)return;let p=profiles.find(x=>x.name.toLowerCase()===n.toLowerCase());if(!p){p={id:uid('human'),name:n};profiles.push(p);save(PROFILE_KEY,profiles)}if(!lineup.some(x=>x.profileId===p.id))lineup.push(human(p));$('nameInput').value='';renderSetup()};
$('savedPlayers').onclick=e=>{let b=e.target.closest('[data-add]');if(!b)return;let p=profiles.find(x=>x.id===b.dataset.add);if(p&&!lineup.some(x=>x.profileId===p.id))lineup.push(human(p));renderSetup()};
$('lineup').onclick=e=>{let b=e.target.closest('[data-rm]');if(b){lineup=lineup.filter(x=>x.id!==b.dataset.rm);renderSetup()}};
$('addBotBtn').onclick=()=>{lineup.push(bot($('botLevel').value));renderSetup()};$('addAllBotsBtn').onclick=()=>{LEVELS.forEach(l=>lineup.push(bot(l[0])));renderSetup()};
function newGame(){return{id:uid('501'),players:lineup.map(p=>({...clone(p),score:501,darts:0,lastThrows:[],placement:null})),current:0,dartsTurn:[],turnStart:501,undo:[],placements:[],finished:false,startedAt:Date.now()}}
function label(n,m){if(!n||!m)return'Miss';if(n===25)return m===2?'DBull':'Bull';return`${m===3?'T':m===2?'D':'S'}${n}`}
function renderNumberRows(){
 $('numbersRow1').innerHTML=[1,2,3,4,5,6,7].map(n=>`<button data-n="${n}" type="button">${n}</button>`).join('');
 $('numbersRow2').innerHTML=[8,9,10,11,12,13,14].map(n=>`<button data-n="${n}" type="button">${n}</button>`).join('');
 $('numbersRow3').innerHTML=[15,16,17,18,19,20,25].map(n=>`<button data-n="${n}" type="button">${n===25?'Bull':n}</button>`).join('');
}
function shownThrows(p){let arr=game.dartsTurn.length?game.dartsTurn.map(d=>label(d.n,d.m)):(p.lastThrows||[]);arr=arr.slice(-3);while(arr.length<3)arr.push('–');return arr}
function isActive501(p){return !Number(p.placement)}
function active501Indices(){return game.players.map((p,i)=>isActive501(p)?i:-1).filter(i=>i>=0)}
function nextActive501(from){
 for(let o=1;o<=game.players.length;o++){
  const i=(from+o)%game.players.length;
  if(isActive501(game.players[i]))return i;
 }
 return -1;
}
function scrollCurrent501(behavior='smooth'){
 requestAnimationFrame(()=>{
  const list=$('scores');
  const row=list?.querySelector(`[data-player-row="${game.current}"]`);
  if(!list||!row)return;

  const listRect=list.getBoundingClientRect();
  const rowRect=row.getBoundingClientRect();
  const padding=4;

  // Move only as far as necessary to keep the active player fully visible.
  if(rowRect.top < listRect.top + padding){
    list.scrollBy({
      top: rowRect.top - listRect.top - padding,
      behavior
    });
  }else if(rowRect.bottom > listRect.bottom - padding){
    list.scrollBy({
      top: rowRect.bottom - listRect.bottom + padding,
      behavior
    });
  }
 });
}
function assign501Placement(index){
 const p=game.players[index];
 if(p.placement)return;
 p.placement=(game.placements?.length||0)+1;
 game.placements=game.placements||[];
 game.placements.push(index);
}
function save501History(){
 localStorage.removeItem(ACTIVE_KEY);
 const h=load(HISTORY_KEY,[]);
 const ranking=[...game.players].sort((a,b)=>(a.placement||999)-(b.placement||999));
 h.push({
  id:game.id,
  winner:ranking[0]?.name||'',
  finishedAt:Date.now(),
  players:ranking.map(x=>({name:x.name,type:x.type,level:x.level||null,score:x.score,darts:x.darts,placement:x.placement}))
 });
 save(HISTORY_KEY,h);
}
function renderGame(){
 if(!game)return;
 const p=game.players[game.current];

 $('turnInfo').textContent=p.name;

 $('scores').innerHTML=game.players.map((x,i)=>{
   const recent=(x.lastThrows||[]).slice(-3);
   while(recent.length<3)recent.push('–');

   return `<div class="score-row ${i===game.current&&!x.placement?'current':''} ${x.placement?'placed-player':''}" data-player-row="${i}">
     <div class="player-row-main">
       <div class="player-row-name">${x.name}</div>
       <div class="player-row-dartcount">${x.darts} Darts${x.placement?` · Platz ${x.placement}`:''}</div>
     </div>
     <div class="player-row-darts">${recent.map(v=>`<span>${v}</span>`).join('')}</div>
     <div class="player-row-score">${x.score}</div>
   </div>`;
 }).join('');

 renderNumberRows();

 document.querySelectorAll('[data-m]').forEach(b=>{
   b.classList.toggle('selected',+b.dataset.m===mult);
 });

 const remainingDarts=3-game.dartsTurn.length;
 $('checkoutHint').className='checkout-route';
 $('checkoutHint').textContent=isActive501(p)?checkoutRoute(p.score,remainingDarts):'';

 const isBot=p.type==='bot'&&isActive501(p);
 document.querySelector('.throw-card').hidden=false;
 $('botStatus').hidden=!isBot;
 document.querySelector('.throw-card').classList.toggle('bot-turn',isBot);

 if(isBot)scheduleBot();
}
function finishDarts(){
 const darts=[];
 for(let n=1;n<=20;n++){
   darts.push({n,m:1,value:n,label:`S${n}`,isDouble:false});
   darts.push({n,m:2,value:n*2,label:`D${n}`,isDouble:true});
   darts.push({n,m:3,value:n*3,label:`T${n}`,isDouble:false});
 }
 darts.push({n:25,m:1,value:25,label:'Bull',isDouble:false});
 darts.push({n:25,m:2,value:50,label:'DBull',isDouble:true});
 return darts;
}
const FINISH_DARTS=finishDarts();

function checkoutRoute(score,dartsLeft){
 score=Number(score);
 dartsLeft=Math.max(0,Math.min(3,Number(dartsLeft)||0));
 if(score<=1||score>170||dartsLeft<=0)return'';

 const search=(remaining,left,path)=>{
   if(left<=0)return null;
   for(const dart of FINISH_DARTS){
     const after=remaining-dart.value;
     if(after<0||after===1)continue;
     if(after===0){
       if(dart.isDouble)return[...path,dart.label];
       continue;
     }
     if(left>1){
       const found=search(after,left-1,[...path,dart.label]);
       if(found)return found;
     }
   }
   return null;
 };

 // Prefer shorter checkout paths where possible.
 for(let needed=1;needed<=dartsLeft;needed++){
   const route=(function exact(remaining,left,path){
     if(left===0)return remaining===0?path:null;
     for(const dart of FINISH_DARTS){
       const after=remaining-dart.value;
       if(after<0||after===1)continue;
       if(left===1){
         if(after===0&&dart.isDouble)return[...path,dart.label];
         continue;
       }
       if(after===0)continue;
       const found=exact(after,left-1,[...path,dart.label]);
       if(found)return found;
     }
     return null;
   })(score,needed,[]);
   if(route)return`Finish: ${route.join(' → ')}`;
 }
 return'';
}
function val(n,m){return n===25?(m===2?50:25):n*m}
function pushUndo(){game.undo.push(clone({...game,undo:[]}));if(game.undo.length>120)game.undo.shift()}
function advance(){
 const p=game.players[game.current];
 p.lastThrows=game.dartsTurn.map(d=>label(d.n,d.m)).slice(-3);

 const next=nextActive501(game.current);
 if(next<0)return;

 game.current=next;
 game.dartsTurn=[];
 game.players[game.current].lastThrows=[];
 game.turnStart=game.players[game.current].score;
 mult=1;
 save(ACTIVE_KEY,game);
 renderGame();
 scrollCurrent501('smooth');
}
function win(p){
 p.lastThrows=game.dartsTurn.map(d=>label(d.n,d.m)).slice(-3);
 const finisherIndex=game.current;
 assign501Placement(finisherIndex);

 const remaining=active501Indices();

 // Like Cricket: if only one player remains, the last place is automatic.
 if(remaining.length===1){
   assign501Placement(remaining[0]);
   game.finished=true;
   save501History();

   $('winTitle').textContent=`${p.name} wird ${p.placement}.`;
   $('winSummary').textContent=`${p.name} checkt aus. ${game.players[remaining[0]].name} belegt automatisch Platz ${game.players[remaining[0]].placement}.`;
   $('continue501Btn').hidden=true;
   $('againBtn').hidden=false;
   $('setupBtn').hidden=false;
   $('winDialog').showModal();
   renderGame();
   return;
 }

 // Single-player game or everyone already placed.
 if(remaining.length===0){
   game.finished=true;
   save501History();

   $('winTitle').textContent=`${p.name} gewinnt`;
   $('winSummary').textContent=`Double Out geschafft nach ${p.darts} Darts.`;
   $('continue501Btn').hidden=true;
   $('againBtn').hidden=false;
   $('setupBtn').hidden=false;
   $('winDialog').showModal();
   renderGame();
   return;
 }

 // More players remain: pause exactly like Cricket and continue on button.
 save(ACTIVE_KEY,game);
 $('winTitle').textContent=`${p.name} wird ${p.placement}.`;
 $('winSummary').textContent=`Double Out geschafft nach ${p.darts} Darts. Die übrigen Spieler spielen weiter.`;
 $('continue501Btn').hidden=false;
 $('againBtn').hidden=true;
 $('setupBtn').hidden=false;
 $('winDialog').showModal();
 renderGame();
}
function throwDart(n,m,source='human'){
 if(!game||game.finished||game.dartsTurn.length>=3)return;let p=game.players[game.current];if(!isActive501(p))return;if(source==='human'&&p.type==='bot')return;
 pushUndo();if(game.dartsTurn.length===0)game.turnStart=p.score;let v=n?val(n,m):0;p.darts++;game.dartsTurn.push({n,m,v});p.lastThrows=game.dartsTurn.map(d=>label(d.n,d.m)).slice(-3);let next=p.score-v;
 if(next===0&&m===2){p.score=0;win(p);return}
 if(next<0||next===1||(next===0&&m!==2)){p.score=game.turnStart;advance();return}
 p.score=next;if(game.dartsTurn.length===3)advance();else{save(ACTIVE_KEY,game);renderGame()}
}
function aim(p){let s=p.score;if(s===50)return{n:25,m:2};if(s<=40&&s%2===0)return{n:s/2,m:2};if(s<=60&&s>40)return{n:s-40,m:1};return{n:20,m:3}}
function resolveBot(p){let acc=levelInfo(p.level)[2],a=aim(p);if(Math.random()<acc)return a;if(Math.random()<.58)return{n:null,m:0};let n=a.n===25?20:Math.max(1,Math.min(20,a.n+(Math.random()<.5?-1:1)));return{n,m:1}}
function scheduleBot(){clearTimeout(botTimer);if(!game||game.finished||botBusy||!isActive501(game.players[game.current])||game.players[game.current].type!=='bot')return;botTimer=setTimeout(botTurn,220)}
async function botTurn(){if(!game||game.finished)return;let i=game.current;botBusy=true;for(let d=0;d<3;d++){if(!game||game.finished||game.current!==i)break;await new Promise(r=>setTimeout(r,220));let x=resolveBot(game.players[i]);throwDart(x.n,x.m,'bot')}botBusy=false;if(game&&!game.finished)renderGame()}
document.querySelector('.number-rows').onclick=e=>{let b=e.target.closest('[data-n]');if(!b||!game||game.players[game.current].type==='bot')return;let n=+b.dataset.n,m=n===25?Math.min(2,mult):mult;throwDart(n,m);mult=1;if(game&&!game.finished&&game.players[game.current]?.type!=='bot')renderGame()};
$('missBtn').onclick=()=>{if(game&&game.players[game.current].type!=='bot'){throwDart(null,0);mult=1;if(game&&!game.finished&&game.players[game.current]?.type!=='bot')renderGame()}};
document.querySelector('.mult-grid').onclick=e=>{let b=e.target.closest('[data-m]');if(b){const chosen=+b.dataset.m;mult=mult===chosen?1:chosen;renderGame()}};
$('undoBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;if(game?.undo?.length){let stack=game.undo,prev=stack.pop();game=prev;game.undo=stack;save(ACTIVE_KEY,game);renderGame()}};
$('backBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;$('game').hidden=true;$('setup').hidden=false;renderSetup()};
$('continue501Btn').onclick=()=>{
 clearTimeout(botTimer);
 botBusy=false;
 $('winDialog').close();
 const next=nextActive501(game.current);
 if(next<0)return;
 game.current=next;
 game.dartsTurn=[];
 game.players[next].lastThrows=[];
 game.turnStart=game.players[next].score;
 mult=1;
 save(ACTIVE_KEY,game);
 renderGame();
 scrollCurrent501('smooth');
};
$('resetBtn').onclick=()=>{if(confirm('501 neu starten?')){clearTimeout(botTimer);botBusy=false;game=newGame();save(ACTIVE_KEY,game);renderGame();scrollCurrent501('auto')}};
$('startBtn').onclick=()=>{game=newGame();save(ACTIVE_KEY,game);$('setup').hidden=true;$('game').hidden=false;renderGame();scrollCurrent501('auto')};
$('againBtn').onclick=()=>{$('winDialog').close();game=newGame();save(ACTIVE_KEY,game);renderGame();scrollCurrent501('auto')};$('setupBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;$('winDialog').close();game=null;$('game').hidden=true;$('setup').hidden=false;renderSetup()};
let a=load(ACTIVE_KEY,null);if(a&&!a.finished){game=a;game.placements=Array.isArray(game.placements)?game.placements:[];game.players.forEach(p=>{p.lastThrows=Array.isArray(p.lastThrows)?p.lastThrows:[];p.type=p.type||'human';p.placement=Number(p.placement)||null});lineup=game.players.map(p=>({id:p.id,profileId:p.profileId||null,name:p.name,type:p.type,level:p.level||null}));$('setup').hidden=true;$('game').hidden=false;renderGame();scrollCurrent501('auto')}else renderSetup();
