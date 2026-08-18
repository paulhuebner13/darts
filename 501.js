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
function newGame(){return{id:uid('501'),players:lineup.map(p=>({...clone(p),score:501,darts:0,lastThrows:[]})),current:0,dartsTurn:[],turnStart:501,undo:[],finished:false,startedAt:Date.now()}}
function label(n,m){if(!n||!m)return'Miss';if(n===25)return m===2?'DBull':'Bull';return`${m===3?'T':m===2?'D':'S'}${n}`}
function renderNumberRows(){
 $('numbersRow1').innerHTML=[1,2,3,4,5,6,7].map(n=>`<button data-n="${n}">${n}</button>`).join('');
 $('numbersRow2').innerHTML=[8,9,10,11,12,13,14].map(n=>`<button data-n="${n}">${n}</button>`).join('');
 $('numbersRow3').innerHTML=[15,16,17,18,19,20,25].map(n=>`<button data-n="${n}">${n===25?'Bull':n}</button>`).join('');
}
function shownThrows(p){let arr=game.dartsTurn.length?game.dartsTurn.map(d=>label(d.n,d.m)):(p.lastThrows||[]);arr=arr.slice(-3);while(arr.length<3)arr.push('–');return arr}
function renderGame(){
 if(!game)return;let p=game.players[game.current];
 $('playerName').textContent=p.name;$('turnInfo').textContent=p.name;$('dartCount').textContent=`${game.dartsTurn.length}/3`;
 $('scores').innerHTML=game.players.map((x,i)=>`<div class="score-row ${i===game.current?'current':''}"><span><strong>${x.name}</strong><br><span class="player-type">${typeLabel(x)} · ${x.darts} Darts</span></span><span class="score501">${x.score}</span></div>`).join('');
 $('lastThree').innerHTML=shownThrows(p).map(x=>`<div class="last-dart">${x}</div>`).join('');
 renderNumberRows();document.querySelectorAll('[data-m]').forEach(b=>b.classList.toggle('selected',+b.dataset.m===mult));$('checkoutHint').textContent=checkout(p.score);
 let isBot=p.type==='bot';document.querySelector('.throw-card').hidden=isBot;$('botStatus').hidden=!isBot;if(isBot)scheduleBot()
}
function checkout(s){if(s===50)return'Checkout: DBull';if(s>=2&&s<=40&&s%2===0)return`Checkout: D${s/2}`;return''}
function val(n,m){return n===25?(m===2?50:25):n*m}
function pushUndo(){game.undo.push(clone({...game,undo:[]}));if(game.undo.length>120)game.undo.shift()}
function advance(){
 let p=game.players[game.current];p.lastThrows=game.dartsTurn.map(d=>label(d.n,d.m)).slice(-3);
 game.current=(game.current+1)%game.players.length;game.dartsTurn=[];game.turnStart=game.players[game.current].score;mult=1;save(ACTIVE_KEY,game);renderGame()
}
function win(p){p.lastThrows=game.dartsTurn.map(d=>label(d.n,d.m)).slice(-3);game.finished=true;localStorage.removeItem(ACTIVE_KEY);let h=load(HISTORY_KEY,[]);h.push({id:game.id,winner:p.name,finishedAt:Date.now(),players:game.players.map(x=>({name:x.name,type:x.type,level:x.level||null,score:x.score,darts:x.darts}))});save(HISTORY_KEY,h);$('winTitle').textContent=`${p.name} gewinnt`;$('winSummary').textContent=`Double Out geschafft nach ${p.darts} Darts.`;$('winDialog').showModal();renderGame()}
function throwDart(n,m,source='human'){
 if(!game||game.finished||game.dartsTurn.length>=3)return;let p=game.players[game.current];if(source==='human'&&p.type==='bot')return;
 pushUndo();if(game.dartsTurn.length===0)game.turnStart=p.score;let v=n?val(n,m):0;p.darts++;game.dartsTurn.push({n,m,v});let next=p.score-v;
 if(next===0&&m===2){p.score=0;win(p);return}
 if(next<0||next===1||(next===0&&m!==2)){p.score=game.turnStart;advance();return}
 p.score=next;if(game.dartsTurn.length===3)advance();else{save(ACTIVE_KEY,game);renderGame()}
}
function aim(p){let s=p.score;if(s===50)return{n:25,m:2};if(s<=40&&s%2===0)return{n:s/2,m:2};if(s<=60&&s>40)return{n:s-40,m:1};return{n:20,m:3}}
function resolveBot(p){let acc=levelInfo(p.level)[2],a=aim(p);if(Math.random()<acc)return a;if(Math.random()<.58)return{n:null,m:0};let n=a.n===25?20:Math.max(1,Math.min(20,a.n+(Math.random()<.5?-1:1)));return{n,m:1}}
function scheduleBot(){clearTimeout(botTimer);if(!game||game.finished||botBusy||game.players[game.current].type!=='bot')return;botTimer=setTimeout(botTurn,220)}
async function botTurn(){if(!game||game.finished)return;let i=game.current;botBusy=true;for(let d=0;d<3;d++){if(!game||game.finished||game.current!==i)break;await new Promise(r=>setTimeout(r,220));let x=resolveBot(game.players[i]);throwDart(x.n,x.m,'bot')}botBusy=false;if(game&&!game.finished)renderGame()}
document.querySelector('.number-rows').onclick=e=>{let b=e.target.closest('[data-n]');if(!b||!game||game.players[game.current].type==='bot')return;let n=+b.dataset.n,m=n===25?Math.min(2,mult):mult;throwDart(n,m);mult=1};
$('missBtn').onclick=()=>{if(game&&game.players[game.current].type!=='bot'){throwDart(null,0);mult=1}};
document.querySelector('.mult-grid').onclick=e=>{let b=e.target.closest('[data-m]');if(b){mult=+b.dataset.m;renderGame()}};
$('undoBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;if(game?.undo?.length){let stack=game.undo,prev=stack.pop();game=prev;game.undo=stack;save(ACTIVE_KEY,game);renderGame()}};
$('backBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;$('game').hidden=true;$('setup').hidden=false;renderSetup()};
$('resetBtn').onclick=()=>{if(confirm('501 neu starten?')){clearTimeout(botTimer);botBusy=false;game=newGame();save(ACTIVE_KEY,game);renderGame()}};
$('startBtn').onclick=()=>{game=newGame();save(ACTIVE_KEY,game);$('setup').hidden=true;$('game').hidden=false;renderGame()};
$('againBtn').onclick=()=>{$('winDialog').close();game=newGame();save(ACTIVE_KEY,game);renderGame()};$('setupBtn').onclick=()=>{clearTimeout(botTimer);botBusy=false;$('winDialog').close();game=null;$('game').hidden=true;$('setup').hidden=false;renderSetup()};
let a=load(ACTIVE_KEY,null);if(a&&!a.finished){game=a;game.players.forEach(p=>{p.lastThrows=Array.isArray(p.lastThrows)?p.lastThrows:[];p.type=p.type||'human'});lineup=game.players.map(p=>({id:p.id,profileId:p.profileId||null,name:p.name,type:p.type,level:p.level||null}));$('setup').hidden=true;$('game').hidden=false;renderGame()}else renderSetup();
