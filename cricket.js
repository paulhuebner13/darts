'use strict';

const PROFILE_KEY = 'darts-cricket-profiles-v1';
const ACTIVE_GAME_KEY = 'darts-cricket-active-v1';
const HISTORY_KEY = 'darts-cricket-history-v1';
const THEME_KEY = 'darts-trainer-theme';
const CRICKET_TARGETS = ['20', '19', '18', '17', '16', '15', 'Bull'];
const INPUT_TARGETS = ['15', '16', '17', '18', '19', '20', 'Bull'];
const TARGET_VALUES = { '20': 20, '19': 19, '18': 18, '17': 17, '16': 16, '15': 15, Bull: 25 };
const BOARD_ORDER = ['20', '1', '18', '4', '13', '6', '10', '15', '2', '17', '3', '19', '7', '16', '8', '11', '14', '9', '12', '5'];

// Die taktische Entscheidung ist bei allen Bots gleich. Nur die Genauigkeit des
// tatsächlich anvisierten Feldes wird mit der Bot-Stufe skaliert.
const BOT_STRATEGY = {
  pointsChance: 0.22,
  newFieldChance: 0.28,
  accidentalHitAfterMissChance: 0.20,
};

const BASE_ACCURACY = {
  numericSingle: 0.58,
  numericWedge: 0.72,
  numericDouble: 0.15,
  numericTriple: 0.10,
  anyBull: 0.32,
  innerBull: 0.06,
};

// Verteilung eines zufälligen Nebentreffers, nachdem das eigentliche Ziel verfehlt
// wurde. Singles sind wegen ihrer Fläche sehr häufig; Double, Triple und vor allem
// das Doppel-Bull sind deutlich unwahrscheinlicher.
const ACCIDENTAL_HIT_WEIGHTS = [
  { value: 'numericSingle', weight: 86.5 },
  { value: 'numericDouble', weight: 5.5 },
  { value: 'numericTriple', weight: 4.0 },
  { value: 'outerBull', weight: 3.5 },
  { value: 'innerBull', weight: 0.5 },
];

const BOT_LEVELS = {
  rookie: {
    label: 'Anfänger',
    factor: 0.32,
    description: 'Sehr viele Fehlwürfe und nur selten kleine Felder.',
  },
  casual: {
    label: 'Leicht',
    factor: 0.46,
    description: 'Ein Anfänger-Bot mit schwankenden Singles.',
  },
  normal: {
    label: 'Mittel',
    factor: 0.62,
    description: 'Mittlere Stufe mit sinnvoller Taktik und klaren Fehlwürfen.',
  },
  strong: {
    label: 'Schwer',
    factor: 0.80,
    description: 'Solider Freizeitspieler mit vernünftiger Cricket-Taktik.',
  },
  expert: {
    label: 'Profi',
    factor: 1.00,
    description: 'Der stärkste Bot mit der höchsten Zielgenauigkeit.',
  },
};

const elements = {
  setupView: document.getElementById('setupView'),
  gameView: document.getElementById('gameView'),
  lineupCount: document.getElementById('lineupCount'),
  selectedLineup: document.getElementById('selectedLineup'),
  startGameBtn: document.getElementById('startGameBtn'),
  setupMessage: document.getElementById('setupMessage'),
  createPlayerForm: document.getElementById('createPlayerForm'),
  playerNameInput: document.getElementById('playerNameInput'),
  savedPlayers: document.getElementById('savedPlayers'),
  statsPlayerSelect: document.getElementById('statsPlayerSelect'),
  playerStats: document.getElementById('playerStats'),
  botDifficulty: document.getElementById('botDifficulty'),
  addBotBtn: document.getElementById('addBotBtn'),
  addAllBotsBtn: document.getElementById('addAllBotsBtn'),
  cricketHistory: document.getElementById('cricketHistory'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  backToSetupBtn: document.getElementById('backToSetupBtn'),
  resetGameBtn: document.getElementById('resetGameBtn'),
  scoreboard: document.getElementById('scoreboard'),
  scoreboardWrap: document.getElementById('scoreboardWrap'),
  turnDots: document.getElementById('turnDots'),
  humanControls: document.getElementById('humanControls'),
  botControls: document.getElementById('botControls'),
  targetButtons: document.getElementById('targetButtons'),
  multiplierButtons: document.getElementById('multiplierButtons'),
  undoDartBtn: document.getElementById('undoDartBtn'),
  winnerDialog: document.getElementById('winnerDialog'),
  placementBadge: document.getElementById('placementBadge'),
  winnerTitle: document.getElementById('winnerTitle'),
  winnerSummary: document.getElementById('winnerSummary'),
  finalScores: document.getElementById('finalScores'),
  continuePlacementBtn: document.getElementById('continuePlacementBtn'),
  rematchBtn: document.getElementById('rematchBtn'),
  winnerSetupBtn: document.getElementById('winnerSetupBtn'),
  themeToggle: document.getElementById('themeToggle'),
  gameThemeToggle: document.getElementById('gameThemeToggle'),
  historyDetailDialog: document.getElementById('historyDetailDialog'),
  historyDetailTitle: document.getElementById('historyDetailTitle'),
  historyDetailMeta: document.getElementById('historyDetailMeta'),
  historyDetailRanking: document.getElementById('historyDetailRanking'),
  historyPrevBtn: document.getElementById('historyPrevBtn'),
  historyNextBtn: document.getElementById('historyNextBtn'),
  historyDetailCloseBtn: document.getElementById('historyDetailCloseBtn'),
  onlineStatus: document.getElementById('onlineStatus'),
  onlineStats: document.getElementById('onlineStats'),
  onlineRefreshBtn: document.getElementById('onlineRefreshBtn'),
};

let profiles = loadJson(PROFILE_KEY, []);
let history = loadJson(HISTORY_KEY, []);
let lineup = [];
let game = null;
let selectedMultiplier = 1;
let botBusy = false;
let botStartTimer = null;
let botRunId = 0;
let lineupDrag = null;
let selectedHistoryIndex = null;
let onlineConnected = false;
let onlineLoading = false;
let onlineHistory = [];


function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', isDark ? '#0f172a' : '#f3f4f6');
}

function toggleTheme() {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
}

function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}


function supabaseConfig() {
  const config = globalThis.DARTS_SUPABASE || {};
  return { url: String(config.url || '').replace(/\/+$/, ''), anonKey: String(config.anonKey || '') };
}
function supabaseEnabled() { const c=supabaseConfig(); return Boolean(c.url && c.anonKey); }
function supabaseHeaders(extra={}) {
  const c=supabaseConfig();
  return { apikey:c.anonKey, Authorization:`Bearer ${c.anonKey}`, 'Content-Type':'application/json', ...extra };
}
function fromOnlineRow(row) {
  return { id:row.id, startedAt:Date.parse(row.started_at)||Date.now(), finishedAt:Date.parse(row.finished_at)||Date.now(),
    rounds:Math.max(1,Number(row.rounds)||1), winnerName:String(row.winner_name||''), players:Array.isArray(row.players)?row.players:[] };
}
function mergeHistoryRecords(primary,secondary) {
  const byId=new Map();
  [...secondary,...primary].forEach(e=>{if(e?.id)byId.set(e.id,e)});
  return [...byId.values()].sort((a,b)=>Number(a.finishedAt)-Number(b.finishedAt));
}
async function loadOnlineHistory({quiet=false}={}) {
  if(!supabaseEnabled()){
    onlineConnected=false;
    if(elements.onlineStatus)elements.onlineStatus.textContent='nicht eingerichtet';
    if(elements.onlineStats){elements.onlineStats.className='online-stats empty-copy';elements.onlineStats.textContent='Project URL und anon key in supabase-config.js eintragen.'}
    return false;
  }
  if(onlineLoading)return false;
  onlineLoading=true;
  if(elements.onlineStatus)elements.onlineStatus.textContent='lädt …';
  try{
    const c=supabaseConfig();
    const r=await fetch(`${c.url}/rest/v1/cricket_games?select=id,started_at,finished_at,rounds,winner_name,players&order=finished_at.asc`,{headers:supabaseHeaders()});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const rows=await r.json();
    onlineHistory=Array.isArray(rows)?rows.map(fromOnlineRow):[];
    onlineConnected=true;
    const localHistory=sanitizeHistory(loadJson(HISTORY_KEY,[]));
    history=sanitizeHistory(mergeHistoryRecords(onlineHistory,localHistory));
    if(elements.onlineStatus)elements.onlineStatus.textContent='online';
    renderHistory();renderProfiles();renderOnlineStats();
    await loadSharedPlayers({ quiet: true });
    return true;
  }catch(error){
    onlineConnected=false;
    if(elements.onlineStatus)elements.onlineStatus.textContent='offline';
    if(!quiet&&elements.onlineStats){elements.onlineStats.className='online-stats empty-copy';elements.onlineStats.textContent=`Online-Daten konnten nicht geladen werden (${error.message}).`}
    return false;
  }finally{onlineLoading=false}
}
async function saveGameOnline(record){
  if(!supabaseEnabled())return false;
  try{
    const c=supabaseConfig();
    const payload={id:record.id,started_at:new Date(record.startedAt).toISOString(),finished_at:new Date(record.finishedAt).toISOString(),
      rounds:record.rounds,winner_name:record.winnerName,players:record.players};
    const r=await fetch(`${c.url}/rest/v1/cricket_games`,{method:'POST',headers:supabaseHeaders({Prefer:'resolution=ignore-duplicates,return=minimal'}),body:JSON.stringify(payload)});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    await loadOnlineHistory({quiet:true});
    return true;
  }catch{if(elements.onlineStatus)elements.onlineStatus.textContent='Sync fehlgeschlagen';return false}
}
function onlinePlayerByName(entry,name){
  return entry.players.find(p=>String(p?.name||'').toLocaleLowerCase('de')===String(name).toLocaleLowerCase('de'));
}
function calculateOnlinePlayerStats(name){
  const source=onlineConnected?onlineHistory:history;
  const games=source.map(entry=>({entry,player:onlinePlayerByName(entry,name)})).filter(({player})=>player);
  const placements=games.map(({player})=>Number(player.placement)).filter(v=>Number.isFinite(v)&&v>0);
  const wins=games.filter(({player})=>Number(player.placement)===1).length;
  const totalMarks=games.reduce((s,{player})=>s+(Number(player.totalMarks)||0),0);
  const totalDarts=games.reduce((s,{player})=>s+(Number(player.dartsThrown)||0),0);
  return {count:games.length,wins,averagePlacement:placements.length?placements.reduce((a,b)=>a+b,0)/placements.length:null,
    mpr:totalDarts>0?(totalMarks/totalDarts)*3:null};
}
function renderOnlineStats(){
  if(!elements.onlineStats)return;
  const paul=calculateOnlinePlayerStats('Paul'),lukas=calculateOnlinePlayerStats('Lukas');
  const source=onlineConnected?onlineHistory:history;
  const common=source.map(entry=>({paul:onlinePlayerByName(entry,'Paul'),lukas:onlinePlayerByName(entry,'Lukas')})).filter(x=>x.paul&&x.lukas);
  const paulAhead=common.filter(x=>Number(x.paul.placement)<Number(x.lukas.placement)).length;
  const lukasAhead=common.filter(x=>Number(x.lukas.placement)<Number(x.paul.placement)).length;
  if(!paul.count&&!lukas.count){elements.onlineStats.className='online-stats empty-copy';elements.onlineStats.textContent='Noch keine gemeinsamen Online-Spiele vorhanden.';return}
  elements.onlineStats.className='online-stats';
  elements.onlineStats.innerHTML=`<div class="online-headtohead"><div><span>Paul vorne</span><strong>${paulAhead}</strong></div><div class="online-vs"><span>gemeinsam</span><strong>${common.length}</strong></div><div><span>Lukas vorne</span><strong>${lukasAhead}</strong></div></div><div class="online-player-columns"><div class="online-player-column"><strong>Paul</strong><span>${paul.count} Spiele</span><span>${paul.wins} Siege</span><span>Ø Platz ${paul.averagePlacement===null?'–':formatNumber(paul.averagePlacement)}</span><span>MPR ${paul.mpr===null?'–':formatNumber(paul.mpr)}</span></div><div class="online-player-column"><strong>Lukas</strong><span>${lukas.count} Spiele</span><span>${lukas.wins} Siege</span><span>Ø Platz ${lukas.averagePlacement===null?'–':formatNumber(lukas.averagePlacement)}</span><span>MPR ${lukas.mpr===null?'–':formatNumber(lukas.mpr)}</span></div></div>`;
}


function profileFromSharedName(name) {
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return {
    id: `shared-${cleanName.toLocaleLowerCase('de')}`,
    name: cleanName,
    createdAt: Date.now(),
  };
}

async function loadSharedPlayers({ quiet = false } = {}) {
  if (!supabaseEnabled()) return false;
  try {
    const config = supabaseConfig();
    const response = await fetch(
      `${config.url}/rest/v1/cricket_players?select=name&order=name.asc`,
      { headers: supabaseHeaders() }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    const names = Array.isArray(rows) ? rows.map((row) => String(row.name || '').trim()).filter(Boolean) : [];
    profiles = names.map(profileFromSharedName);
    saveJson(PROFILE_KEY, profiles);

    const allowedNames = new Set(names.map((name) => name.toLocaleLowerCase('de')));
    lineup = lineup.filter((participant) => (
      participant.type === 'bot'
      || allowedNames.has(String(participant.name || '').toLocaleLowerCase('de'))
    ));

    renderLineup();
    return true;
  } catch (error) {
    if (!quiet) setSetupMessage(`Spielerliste konnte nicht online geladen werden (${error.message}).`);
    return false;
  }
}

async function createSharedPlayer(name) {
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!cleanName) return false;

  if (!supabaseEnabled()) {
    if (!profiles.some((profile) => profile.name.toLocaleLowerCase('de') === cleanName.toLocaleLowerCase('de'))) {
      profiles.push(profileFromSharedName(cleanName));
      saveJson(PROFILE_KEY, profiles);
    }
    return true;
  }

  const config = supabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/cricket_players`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ name: cleanName }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await loadSharedPlayers({ quiet: true });
  return true;
}

async function deleteSharedPlayer(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return false;

  if (supabaseEnabled()) {
    const config = supabaseConfig();
    const response = await fetch(
      `${config.url}/rest/v1/cricket_players?name=eq.${encodeURIComponent(cleanName)}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadSharedPlayers({ quiet: true });
  } else {
    profiles = profiles.filter((profile) => profile.name !== cleanName);
    saveJson(PROFILE_KEY, profiles);
  }

  lineup = lineup.filter((participant) => (
    participant.type === 'bot' || participant.name !== cleanName
  ));
  renderLineup();
  return true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyMarks() {
  return Object.fromEntries(CRICKET_TARGETS.map((target) => [target, 0]));
}

function emptyHitCounts() {
  return Object.fromEntries(['Miss', '15', '16', '17', '18', '19', '20', 'Bull'].map((target) => [target, 0]));
}

function normalizeHitCounts(raw) {
  const counts = emptyHitCounts();
  if (!raw || typeof raw !== 'object') return counts;
  Object.keys(counts).forEach((target) => {
    counts[target] = Math.max(0, Number(raw[target]) || 0);
  });
  return counts;
}


function sanitizeProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  const seenNames = new Set();
  return raw.filter((entry) => {
    const name = String(entry?.name || '').trim();
    const key = name.toLocaleLowerCase('de');
    if (!name || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  }).map((entry) => ({
    id: typeof entry.id === 'string' && entry.id ? entry.id : uid('human'),
    name: String(entry.name).trim().slice(0, 24),
    createdAt: Number(entry.createdAt) || Date.now(),
  }));
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && Array.isArray(entry.players) && entry.winnerName)
    .slice(-500);
}

profiles = sanitizeProfiles(profiles);
history = sanitizeHistory(history);
saveJson(PROFILE_KEY, profiles);
saveJson(HISTORY_KEY, history);

function participantFromProfile(profile) {
  return {
    instanceId: uid('seat'),
    profileId: profile.id,
    type: 'human',
    name: profile.name,
  };
}

function createBot(levelKey) {
  const safeLevelKey = BOT_LEVELS[levelKey] ? levelKey : 'normal';
  const level = BOT_LEVELS[safeLevelKey];
  const sameLevelCount = lineup.filter((participant) => participant.type === 'bot' && participant.levelKey === safeLevelKey).length;
  return {
    instanceId: uid('bot'),
    type: 'bot',
    name: `Bot ${level.label}${sameLevelCount ? ` ${sameLevelCount + 1}` : ''}`,
    levelKey: safeLevelKey,
  };
}

function normalizeLoadedBotNames(players) {
  const counts = new Map();
  players.forEach((player) => {
    if (player.type !== 'bot') return;
    const levelKey = BOT_LEVELS[player.levelKey] ? player.levelKey : 'normal';
    player.levelKey = levelKey;
    const count = (counts.get(levelKey) || 0) + 1;
    counts.set(levelKey, count);
    const label = BOT_LEVELS[levelKey].label;
    player.name = `Bot ${label}${count > 1 ? ` ${count}` : ''}`;
  });
}

function isProfileSelected(profileId) {
  return lineup.some((participant) => participant.profileId === profileId);
}

function setSetupMessage(message = '') {
  elements.setupMessage.textContent = message;
}

function canAddParticipant() {
  return true;
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

function calculateMpr(player) {
  const dartsThrown = Math.max(0, Number(player?.dartsThrown) || 0);
  const totalMarks = Math.max(0, Number(player?.totalMarks) || 0);
  return dartsThrown > 0 ? (totalMarks / dartsThrown) * 3 : 0;
}

function findHistoryPlayer(entry, profile) {
  return entry.players.find((player) => (
    player.type === 'human'
    && ((player.profileId && player.profileId === profile.id)
      || (!player.profileId && String(player.name).toLocaleLowerCase('de') === profile.name.toLocaleLowerCase('de')))
  ));
}

function aggregateHitDistribution(games) {
  const totals = emptyHitCounts();
  let detailedDarts = 0;

  games.forEach(({ player }) => {
    if (!player?.hitCounts || typeof player.hitCounts !== 'object') return;
    const counts = normalizeHitCounts(player.hitCounts);
    Object.keys(totals).forEach((target) => {
      totals[target] += counts[target];
      detailedDarts += counts[target];
    });
  });

  return { totals, detailedDarts };
}

function renderHitDistribution(games) {
  const { totals, detailedDarts } = aggregateHitDistribution(games);
  if (!detailedDarts) {
    return `<div class="hit-distribution-empty">Trefferverteilung ist für ältere Spiele noch nicht verfügbar. Neue Spiele werden ab jetzt detailliert gespeichert.</div>`;
  }

  const order = ['Miss', '15', '16', '17', '18', '19', '20', 'Bull'];
  return `
    <div class="hit-distribution">
      <div class="hit-distribution-title">Wurfverteilung</div>
      <div class="hit-distribution-grid">
        ${order.map((target) => {
          const count = totals[target];
          const pct = (count / detailedDarts) * 100;
          return `<div class="hit-distribution-row">
            <span>${escapeHtml(target)}</span>
            <div class="hit-distribution-track"><div class="hit-distribution-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
            <strong>${formatNumber(pct, 1)} %</strong>
          </div>`;
        }).join('')}
      </div>
      <div class="hit-distribution-total">${detailedDarts} detailliert gespeicherte Würfe</div>
    </div>`;
}

function renderSelectedPlayerStats() {
  if (!profiles.length) {
    elements.statsPlayerSelect.innerHTML = '';
    elements.statsPlayerSelect.disabled = true;
    elements.playerStats.className = 'player-stats empty-copy';
    elements.playerStats.textContent = 'Noch keine menschlichen Spieler gespeichert.';
    return;
  }

  elements.statsPlayerSelect.disabled = false;
  const profile = profiles.find((entry) => entry.id === elements.statsPlayerSelect.value) || profiles[0];
  if (!profile) return;
  elements.statsPlayerSelect.value = profile.id;

  const games = history.map((entry) => ({
    entry,
    player: findHistoryPlayer(entry, profile),
  })).filter(({ player }) => player);

  if (!games.length) {
    elements.playerStats.className = 'player-stats empty-copy';
    elements.playerStats.textContent = `Für ${profile.name} gibt es noch kein abgeschlossenes Spiel.`;
    return;
  }

  const wins = games.filter(({ player }) => Number(player.placement) === 1).length;
  const placements = games.map(({ player }) => Number(player.placement)).filter((value) => Number.isFinite(value) && value > 0);
  const averagePlacement = placements.length
    ? placements.reduce((sum, value) => sum + value, 0) / placements.length
    : 0;
  const gamesWithMpr = games.filter(({ player }) => Number(player.dartsThrown) > 0);
  const totalMarks = gamesWithMpr.reduce((sum, { player }) => sum + (Number(player.totalMarks) || 0), 0);
  const totalDarts = gamesWithMpr.reduce((sum, { player }) => sum + (Number(player.dartsThrown) || 0), 0);
  const overallMpr = totalDarts > 0 ? (totalMarks / totalDarts) * 3 : null;
  const bestMpr = gamesWithMpr.length
    ? Math.max(...gamesWithMpr.map(({ player }) => Number(player.mpr) || calculateMpr(player)))
    : null;

  const recentRows = [...games].reverse().slice(0, 5).map(({ entry, player }) => {
    const date = new Intl.DateTimeFormat('de-AT', { dateStyle: 'short' }).format(new Date(entry.finishedAt));
    const mpr = Number(player.dartsThrown) > 0 ? formatNumber(Number(player.mpr) || calculateMpr(player)) : '–';
    return `<div class="player-stat-game"><span>${escapeHtml(date)}</span><strong>${Number(player.placement) || '–'}. Platz</strong><span>MPR ${mpr}</span></div>`;
  }).join('');

  elements.playerStats.className = 'player-stats';
  elements.playerStats.innerHTML = `
    <div class="player-stat-grid">
      <div class="player-stat-tile"><span>Spiele</span><strong>${games.length}</strong></div>
      <div class="player-stat-tile"><span>Siege</span><strong>${wins}</strong></div>
      <div class="player-stat-tile"><span>Siegquote</span><strong>${formatNumber((wins / games.length) * 100, 0)} %</strong></div>
      <div class="player-stat-tile"><span>Ø Platz</span><strong>${placements.length ? formatNumber(averagePlacement) : '–'}</strong></div>
      <div class="player-stat-tile"><span>MPR gesamt</span><strong>${overallMpr === null ? '–' : formatNumber(overallMpr)}</strong></div>
      <div class="player-stat-tile"><span>Beste MPR</span><strong>${bestMpr === null ? '–' : formatNumber(bestMpr)}</strong></div>
    </div>
    ${renderHitDistribution(games)}
    <div class="player-stat-games">${recentRows}</div>
  `;
}

function renderStatsPlayerOptions() {
  const previous = elements.statsPlayerSelect.value;
  if (!profiles.length) {
    renderSelectedPlayerStats();
    return;
  }
  elements.statsPlayerSelect.innerHTML = profiles.map((profile) => (
    `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
  )).join('');
  elements.statsPlayerSelect.value = profiles.some((profile) => profile.id === previous) ? previous : profiles[0].id;
  renderSelectedPlayerStats();
}


function renderProfiles() {
  if (!profiles.length) {
    elements.savedPlayers.innerHTML = '<div class="empty-copy">Noch keine gespeicherten Spieler.</div>';
    renderStatsPlayerOptions();
    return;
  }

  elements.savedPlayers.innerHTML = profiles.map((profile) => `
    <div class="saved-player-row">
      <span class="saved-player-name">${escapeHtml(profile.name)}</span>
      <button class="add-profile" type="button" data-add-profile="${escapeHtml(profile.id)}" ${isProfileSelected(profile.id) ? 'disabled' : ''}>+</button>
      <button class="delete-profile" type="button" data-delete-profile="${escapeHtml(profile.id)}" aria-label="${escapeHtml(profile.name)} löschen">×</button>
    </div>
  `).join('');
  renderStatsPlayerOptions();
}

function renderLineup() {
  elements.lineupCount.textContent = String(lineup.length);
  elements.startGameBtn.disabled = lineup.length < 2;

  if (!lineup.length) {
    elements.selectedLineup.className = 'selected-lineup empty-copy';
    elements.selectedLineup.textContent = 'Noch niemand im Spiel. Füge mindestens zwei Spieler oder Bots hinzu.';
  } else {
    elements.selectedLineup.className = 'selected-lineup';
    elements.selectedLineup.innerHTML = lineup.map((participant, index) => {
      const meta = participant.type === 'bot'
        ? `Bot · ${BOT_LEVELS[participant.levelKey]?.label || 'Mittel'}`
        : 'Mensch';
      return `
        <div class="lineup-card" data-seat-id="${escapeHtml(participant.instanceId)}">
          <button class="drag-handle" type="button" data-drag-handle aria-label="${escapeHtml(participant.name)} verschieben">↕</button>
          <span class="turn-order">${index + 1}</span>
          <div>
            <div class="lineup-name">${escapeHtml(participant.name)}</div>
            <div class="lineup-meta">${escapeHtml(meta)}</div>
          </div>
          <button class="remove-player" type="button" data-remove-seat="${escapeHtml(participant.instanceId)}" aria-label="${escapeHtml(participant.name)} entfernen">×</button>
        </div>
      `;
    }).join('');
  }

  renderProfiles();
}

async function createProfile(event) {
  event.preventDefault();
  const name = elements.playerNameInput.value.trim().replace(/\s+/g, ' ').slice(0, 24);

  if (!name) {
    setSetupMessage('Bitte einen Namen eingeben.');
    return;
  }

  if (profiles.some((profile) => profile.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) {
    setSetupMessage('Diesen Spieler gibt es bereits.');
    return;
  }

  try {
    await createSharedPlayer(name);
    const profile = profiles.find((entry) => entry.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))
      || profileFromSharedName(name);

    if (!isProfileSelected(profile.id)) lineup.push(participantFromProfile(profile));
    elements.playerNameInput.value = '';
    setSetupMessage('');
    renderLineup();
  } catch (error) {
    setSetupMessage(`Spieler konnte nicht gespeichert werden (${error.message}).`);
  }
}

function addProfile(profileId) {
  if (!canAddParticipant() || isProfileSelected(profileId)) return;
  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) return;
  lineup.push(participantFromProfile(profile));
  setSetupMessage('');
  renderLineup();
}

async function deleteProfile(profileId) {
  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) return;
  if (!window.confirm(`Spieler „${profile.name}“ wirklich für alle löschen? Alte Spiele und Statistiken bleiben erhalten.`)) return;

  try {
    await deleteSharedPlayer(profile.name);
    setSetupMessage('');
  } catch (error) {
    setSetupMessage(`Spieler konnte nicht gelöscht werden (${error.message}).`);
  }
}

function addBot() {
  if (!canAddParticipant()) return;
  lineup.push(createBot(elements.botDifficulty.value));
  setSetupMessage('');
  renderLineup();
}

function addAllBots() {
  ['rookie', 'casual', 'normal', 'strong', 'expert'].forEach((levelKey) => {
    lineup.push(createBot(levelKey));
  });
  setSetupMessage('');
  renderLineup();
}


function removeParticipant(instanceId) {
  lineup = lineup.filter((participant) => participant.instanceId !== instanceId);
  setSetupMessage('');
  renderLineup();
}

function buildGamePlayers(participants) {
  return participants.map((participant) => ({
    ...deepClone(participant),
    score: 0,
    marks: emptyMarks(),
    totalMarks: 0,
    dartsThrown: 0,
    hitCounts: emptyHitCounts(),
    turnThrows: [],
    botFocusTarget: null,
  }));
}

function createGame(participants) {
  return {
    id: uid('game'),
    startedAt: Date.now(),
    players: buildGamePlayers(participants),
    currentPlayerIndex: 0,
    round: 1,
    dartsThisTurn: [],
    log: [],
    undoStack: [],
    finished: false,
    winnerIndex: null,
    placements: [],
    pausedForPlacement: false,
    pendingPlacementIndex: null,
  };
}

function persistActiveGame() {
  if (!game || game.finished) {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    return;
  }
  saveJson(ACTIVE_GAME_KEY, game);
}

function validGame(raw) {
  return raw
    && Array.isArray(raw.players)
    && raw.players.length >= 2
    && raw.players.every((player) => player && player.name && player.marks)
    && Number.isInteger(raw.currentPlayerIndex)
    && raw.currentPlayerIndex >= 0
    && raw.currentPlayerIndex < raw.players.length;
}

function loadActiveGame() {
  const raw = loadJson(ACTIVE_GAME_KEY, null);
  if (!validGame(raw) || raw.finished) return null;
  raw.undoStack = Array.isArray(raw.undoStack)
    ? raw.undoStack.slice(-120).map((entry) => {
      if (entry && entry.snapshot) return entry;
      return {
        snapshot: entry,
        action: {
          source: 'legacy',
          playerIndex: Number(entry?.currentPlayerIndex) || 0,
        },
      };
    }).filter((entry) => entry.snapshot)
    : [];
  raw.log = Array.isArray(raw.log) ? raw.log.slice(-80) : [];
  raw.dartsThisTurn = Array.isArray(raw.dartsThisTurn) ? raw.dartsThisTurn.slice(0, 3) : [];
  raw.players.forEach((player) => {
    const placement = Number(player.placement);
    player.placement = Number.isInteger(placement) && placement > 0 ? placement : null;
    player.totalMarks = Math.max(0, Number(player.totalMarks) || 0);
    player.dartsThrown = Math.max(0, Number(player.dartsThrown) || 0);
    player.hitCounts = normalizeHitCounts(player.hitCounts);
    player.turnThrows = Array.isArray(player.turnThrows)
      ? player.turnThrows.slice(0, 3)
      : (Array.isArray(player.lastThrows) ? player.lastThrows.slice(-3) : []);
    delete player.lastThrows;
    player.botFocusTarget = CRICKET_TARGETS.includes(player.botFocusTarget) ? player.botFocusTarget : null;
  });
  normalizeLoadedBotNames(raw.players);
  raw.placements = Array.isArray(raw.placements) ? raw.placements : [];
  raw.pausedForPlacement = Boolean(raw.pausedForPlacement);
  raw.pendingPlacementIndex = Number.isInteger(raw.pendingPlacementIndex) ? raw.pendingPlacementIndex : null;
  return raw;
}

function startGameFromLineup() {
  if (lineup.length < 2) {
    setSetupMessage('Du brauchst mindestens zwei Teilnehmer.');
    return;
  }
  game = createGame(lineup);
  selectedMultiplier = 1;
  persistActiveGame();
  showGame();
}

function showSetup() {
  window.clearTimeout(botStartTimer);
  document.body.classList.remove('game-active');
  elements.gameView.classList.remove('active');
  elements.setupView.classList.add('active');
  renderLineup();
  renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showGame() {
  if (!game) return;
  document.body.classList.add('game-active');
  elements.setupView.classList.remove('active');
  elements.gameView.classList.add('active');
  renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function snapshotGame() {
  const snapshot = deepClone(game);
  snapshot.undoStack = [];
  return snapshot;
}

function pushUndo(action = {}) {
  game.undoStack.push({
    snapshot: snapshotGame(),
    action: {
      source: action.source || 'unknown',
      playerIndex: Number.isInteger(action.playerIndex) ? action.playerIndex : game.currentPlayerIndex,
      at: Date.now(),
    },
  });
  if (game.undoStack.length > 120) game.undoStack.shift();
}

function restoreUndo() {
  if (!game?.undoStack?.length || game.pausedForPlacement) return;

  window.clearTimeout(botStartTimer);
  botRunId += 1;
  botBusy = false;

  let restoreIndex = -1;
  for (let index = game.undoStack.length - 1; index >= 0; index -= 1) {
    if (game.undoStack[index]?.action?.source === 'human') {
      restoreIndex = index;
      break;
    }
  }
  if (restoreIndex < 0) restoreIndex = game.undoStack.length - 1;

  const entry = game.undoStack[restoreIndex];
  const previous = entry?.snapshot || entry;
  const remainingStack = game.undoStack.slice(0, restoreIndex);
  game = previous;
  game.undoStack = remainingStack;
  selectedMultiplier = 1;
  persistActiveGame();
  renderGame();
}

function getCurrentPlayer() {
  return game.players[game.currentPlayerIndex];
}

function getMarkSymbol(marks) {
  if (marks <= 0) return '';
  if (marks === 1) return '╱';
  if (marks === 2) return '✕';
  return '○';
}

function isPlayerActive(player) {
  return !Number.isInteger(Number(player.placement)) || Number(player.placement) <= 0;
}

function getActivePlayerIndices() {
  return game.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => isPlayerActive(player))
    .map(({ index }) => index);
}

function isTargetOpenForOpponent(playerIndex, target) {
  return game.players.some((player, index) => (
    index !== playerIndex
    && isPlayerActive(player)
    && Number(player.marks[target]) < 3
  ));
}

function allTargetsClosed(player) {
  return CRICKET_TARGETS.every((target) => Number(player.marks[target]) >= 3);
}

function winningPlayerIndex() {
  const activeIndices = getActivePlayerIndices();
  return activeIndices.find((playerIndex) => {
    const player = game.players[playerIndex];
    if (!allTargetsClosed(player)) return false;
    return activeIndices.every((opponentIndex) => player.score >= game.players[opponentIndex].score);
  }) ?? -1;
}

function compactDartLabel(dart) {
  if (!dart || dart.multiplier === 0 || !dart.target) return 'Miss';
  if (dart.target === 'Bull') return dart.multiplier === 2 ? 'DBull' : 'Bull';
  const prefix = dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${dart.target}`;
}

function dartLabel(dart) {
  if (!dart || dart.multiplier === 0 || !dart.target) return 'Miss';
  if (dart.target === 'Bull') return dart.multiplier === 2 ? 'Inner Bull' : 'Outer Bull';
  const prefix = dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${dart.target}`;
}

function rawMarksForDart(dart) {
  if (!dart || !CRICKET_TARGETS.includes(dart.target)) return 0;
  const maximum = dart.target === 'Bull' ? 2 : 3;
  return Math.max(0, Math.min(maximum, Number(dart.multiplier) || 0));
}

function applyDartToPlayer(playerIndex, dart) {
  const player = game.players[playerIndex];
  const target = CRICKET_TARGETS.includes(dart.target) ? dart.target : null;
  const requestedMarks = target ? Math.max(0, Math.min(target === 'Bull' ? 2 : 3, Number(dart.multiplier) || 0)) : 0;

  if (!target || requestedMarks === 0) {
    return { marksAdded: 0, pointsAdded: 0 };
  }

  const before = Math.min(3, Number(player.marks[target]) || 0);
  const marksToClose = Math.min(requestedMarks, 3 - before);
  const extraMarks = requestedMarks - marksToClose;
  player.marks[target] = Math.min(3, before + requestedMarks);

  let pointsAdded = 0;
  if (extraMarks > 0 && isTargetOpenForOpponent(playerIndex, target)) {
    pointsAdded = extraMarks * TARGET_VALUES[target];
    player.score += pointsAdded;
  }

  return { marksAdded: marksToClose, pointsAdded };
}

function addLog(message) {
  game.log.unshift({ id: uid('log'), at: Date.now(), message });
  game.log = game.log.slice(0, 40);
}

function recordDart(dart, source = 'human') {
  if (!game || game.finished || game.pausedForPlacement || botBusy && source !== 'bot') return;
  if (game.dartsThisTurn.length >= 3) return;

  const playerIndex = game.currentPlayerIndex;
  pushUndo({ source, playerIndex });
  const player = game.players[playerIndex];
  const rawMarks = rawMarksForDart(dart);
  player.totalMarks = Math.max(0, Number(player.totalMarks) || 0) + rawMarks;
  player.dartsThrown = Math.max(0, Number(player.dartsThrown) || 0) + 1;
  player.hitCounts = normalizeHitCounts(player.hitCounts);
  const hitCategory = dart && CRICKET_TARGETS.includes(dart.target) ? dart.target : 'Miss';
  player.hitCounts[hitCategory] += 1;
  const result = applyDartToPlayer(playerIndex, dart);
  const recordedDart = {
    ...dart,
    label: dartLabel(dart),
    rawMarks,
    marksAdded: result.marksAdded,
    pointsAdded: result.pointsAdded,
  };
  game.dartsThisTurn.push(recordedDart);
  player.turnThrows = [...(Array.isArray(player.turnThrows) ? player.turnThrows : []), compactDartLabel(dart)].slice(0, 3);

  let detail = result.pointsAdded > 0 ? ` · +${result.pointsAdded} Punkte` : '';
  if (result.marksAdded > 0) detail += ` · +${result.marksAdded} Mark${result.marksAdded === 1 ? '' : 's'}`;
  addLog(`<strong>${escapeHtml(player.name)}</strong>: ${escapeHtml(recordedDart.label)}${detail}`);

  const winnerIndex = winningPlayerIndex();
  if (winnerIndex >= 0) {
    registerPlacement(winnerIndex);
    return;
  }

  if (game.dartsThisTurn.length >= 3) {
    advanceTurn();
  } else {
    persistActiveGame();
    renderGame();
  }
}

function findNextActivePlayerIndex(fromIndex) {
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const index = (fromIndex + offset) % game.players.length;
    if (isPlayerActive(game.players[index])) return index;
  }
  return -1;
}

function advanceTurn() {
  if (!game || game.finished || game.pausedForPlacement) return;
  const previousIndex = game.currentPlayerIndex;
  const nextIndex = findNextActivePlayerIndex(previousIndex);
  if (nextIndex < 0) return;
  if (nextIndex <= previousIndex) game.round += 1;
  game.currentPlayerIndex = nextIndex;
  game.dartsThisTurn = [];
  game.players[nextIndex].turnThrows = [];
  selectedMultiplier = 1;
  persistActiveGame();
  renderGame();
}

function endTurnEarly() {
  if (!game || game.finished || game.pausedForPlacement || botBusy) return;
  pushUndo({ source: 'human', playerIndex: game.currentPlayerIndex });
  addLog(`<strong>${escapeHtml(getCurrentPlayer().name)}</strong>: Zug beendet`);
  advanceTurn();
}

function renderTargetButtons() {
  const player = getCurrentPlayer();
  const numberButtons = INPUT_TARGETS.map((target) => {
    const closed = Number(player.marks[target]) >= 3;
    return `<button class="target-button ${closed ? 'closed-target' : ''}" data-target="${escapeHtml(target)}" type="button">${escapeHtml(target)}</button>`;
  });
  numberButtons.push('<button class="target-button miss-target-button" data-target="Miss" type="button">Miss</button>');
  elements.targetButtons.innerHTML = numberButtons.join('');
}

function renderMultiplierButtons() {
  elements.multiplierButtons.querySelectorAll('[data-multiplier]').forEach((button) => {
    button.classList.toggle('selected', Number(button.dataset.multiplier) === selectedMultiplier);
  });
}

function renderTurnDots() {
  const used = game.dartsThisTurn.length;
  elements.turnDots.querySelectorAll('span').forEach((dot, index) => {
    dot.classList.toggle('used', index < used);
  });
}

function scrollActivePlayerIntoView() {
  const activeHead = elements.scoreboard.querySelector(`[data-player-index="${game.currentPlayerIndex}"]`);
  if (!activeHead || !elements.scoreboardWrap) return;
  const targetLeft = activeHead.offsetLeft - (elements.scoreboardWrap.clientWidth / 2) + (activeHead.offsetWidth / 2);
  elements.scoreboardWrap.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
}


function leadTargetWeight(target) {
  return target === 'Bull' ? 4 : 1;
}

function calculateCricketLeadProgress() {
  const activeIndices = getActivePlayerIndices();
  if (!activeIndices.length) return game.players.map(() => null);

  const relevantTargets = CRICKET_TARGETS.filter((target) => (
    activeIndices.some((index) => Number(game.players[index].marks[target]) < 3)
  ));

  const currentlyScorableTargets = relevantTargets.filter((target) => {
    const someClosed = activeIndices.some((index) => Number(game.players[index].marks[target]) >= 3);
    const someOpen = activeIndices.some((index) => Number(game.players[index].marks[target]) < 3);
    return someClosed && someOpen;
  });

  const conversionTargets = currentlyScorableTargets.length
    ? currentlyScorableTargets
    : relevantTargets;

  const pointRate = conversionTargets.length
    ? Math.max(...conversionTargets.map((target) => (
        TARGET_VALUES[target] / leadTargetWeight(target)
      )), 1)
    : 20;

  return game.players.map((player, index) => {
    if (!activeIndices.includes(index)) return null;

    const markProgress = relevantTargets.reduce((sum, target) => {
      const marks = Math.max(0, Math.min(3, Number(player.marks[target]) || 0));
      return sum + (marks * leadTargetWeight(target));
    }, 0);

    const pointProgress = Math.max(0, Number(player.score) || 0) / pointRate;
    return markProgress + pointProgress;
  });
}

function calculateCricketLeadLabels() {
  const progress = calculateCricketLeadProgress();
  const activeProgress = progress.filter((value) => Number.isFinite(value));
  if (!activeProgress.length) return game.players.map(() => ({ text: '', leader: false }));

  const leaderProgress = Math.max(...activeProgress);
  const leaders = progress
    .map((value, index) => Number.isFinite(value) && Math.abs(value - leaderProgress) < 1e-9 ? index : -1)
    .filter((index) => index >= 0);

  const sortedBehind = activeProgress
    .filter((value) => value < leaderProgress - 1e-9)
    .sort((a, b) => b - a);
  const nextBest = sortedBehind.length ? sortedBehind[0] : leaderProgress;

  return progress.map((value, index) => {
    if (!Number.isFinite(value)) return { text: '', leader: false };

    if (leaders.includes(index)) {
      if (leaders.length > 1) return { text: 'Führung ±0', leader: true };
      const lead = Math.max(0, Math.ceil((leaderProgress - nextBest) - 1e-9));
      return { text: `Führung +${lead}`, leader: true };
    }

    const needed = Math.max(1, Math.ceil((leaderProgress - value) - 1e-9));
    return { text: `+${needed} Würfe`, leader: false };
  });
}

function renderScoreboard() {
  const leadLabels = calculateCricketLeadLabels();
  const headerCells = game.players.map((player, index) => {
    const placed = !isPlayerActive(player);
    const rank = placed ? `<span class="head-rank">${Number(player.placement)}.</span>` : '';
    const turnThrows = Array.isArray(player.turnThrows) ? player.turnThrows.slice(0, 3) : [];
    const paddedThrows = [...turnThrows, ...Array(Math.max(0, 3 - turnThrows.length)).fill('')];
    const mpr = formatNumber(calculateMpr(player));
    const turnThrowsMarkup = paddedThrows.map((label) => `<span class="last-dart-chip ${label ? '' : 'empty'}">${label ? escapeHtml(label) : ''}</span>`).join('');
    const dartCount = Math.max(0, Number(player.dartsThrown) || 0);
    return `
      <th class="player-head ${index === game.currentPlayerIndex && !game.pausedForPlacement ? 'active-player' : ''} ${placed ? 'placed-player' : ''}" data-player-index="${index}">
        ${rank}
        <span class="head-name">${escapeHtml(player.name)}</span>
        ${!placed ? `<span class="head-lead ${leadLabels[index]?.leader ? 'leading' : ''}">${escapeHtml(leadLabels[index]?.text || '')}</span>` : ''}
        <span class="head-darts">${dartCount} Darts</span>
        <span class="head-mpr">MPR ${mpr}</span>
        <span class="head-score">${player.score}</span>
        <span class="head-last-darts" aria-label="Würfe des aktuellen beziehungsweise letzten Zuges von ${escapeHtml(player.name)}">${turnThrowsMarkup}</span>
      </th>
    `;
  }).join('');

  const rows = CRICKET_TARGETS.map((target, targetIndex) => {
    const targetComplete = game.players.every((player) => Number(player.marks[target]) >= 3);
    const cells = game.players.map((player, index) => {
      const placed = !isPlayerActive(player);
      if (placed) {
        if (targetIndex > 0) return '';
        const placement = Math.max(1, Number(player.placement) || 1);
        return `
          <td class="placement-cell placed-player-column" rowspan="${CRICKET_TARGETS.length}" aria-label="${escapeHtml(player.name)}: ${placement}. Platz">
            <span class="placement-number">${placement}</span>
            <span class="placement-word">Platz</span>
          </td>
        `;
      }

      const marks = Math.min(3, Number(player.marks[target]) || 0);
      return `<td class="mark-cell ${marks >= 3 ? 'closed' : ''} ${index === game.currentPlayerIndex && !game.pausedForPlacement ? 'active-player' : ''}" aria-label="${escapeHtml(player.name)} ${escapeHtml(target)}: ${marks} Marks">${getMarkSymbol(marks)}</td>`;
    }).join('');
    return `<tr class="${targetComplete ? 'target-complete' : ''}"><th class="target-cell">${escapeHtml(target)}</th>${cells}</tr>`;
  }).join('');

  elements.scoreboard.innerHTML = `
    <thead><tr><th class="target-head">Ziel</th>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  `;
}

function scheduleAutomaticBotTurn() {
  window.clearTimeout(botStartTimer);
  if (!game || game.finished || game.pausedForPlacement || botBusy || getCurrentPlayer().type !== 'bot') return;
  botStartTimer = window.setTimeout(() => botThrow(), 35);
}

function renderGame() {
  if (!game) return;
  const player = getCurrentPlayer();
  const isBot = player.type === 'bot';
  const isPaused = Boolean(game.pausedForPlacement);

  elements.humanControls.hidden = isBot || isPaused;
  elements.botControls.hidden = !isBot || isPaused;
  elements.undoDartBtn.disabled = !game.undoStack.length || isPaused;

  renderTargetButtons();
  renderMultiplierButtons();
  renderScoreboard();
  renderTurnDots();

  window.requestAnimationFrame(scrollActivePlayerIntoView);
  scheduleAutomaticBotTurn();
}

function recordHumanTarget(target) {
  if (!game || game.finished || game.pausedForPlacement || botBusy || getCurrentPlayer().type !== 'human') return;

  if (target === 'Miss') {
    selectedMultiplier = 1;
    recordDart({ target: null, multiplier: 0, aimedAt: null }, 'human');
    return;
  }

  if (!CRICKET_TARGETS.includes(target)) return;
  const safeMultiplier = target === 'Bull' ? Math.min(2, selectedMultiplier) : Math.min(3, selectedMultiplier);
  selectedMultiplier = 1;
  recordDart({ target, multiplier: safeMultiplier, aimedAt: target }, 'human');
}

function selectMultiplier(multiplier) {
  if (!game || game.pausedForPlacement || botBusy || getCurrentPlayer().type !== 'human') return;
  const value = Number(multiplier);
  if (![2, 3].includes(value)) return;
  selectedMultiplier = selectedMultiplier === value ? 1 : value;
  renderMultiplierButtons();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chance(probability) {
  return Math.random() < clamp(probability, 0, 1);
}

function adjacentBoardTarget(target) {
  const index = BOARD_ORDER.indexOf(target);
  if (index < 0) return String(Math.floor(Math.random() * 20) + 1);
  const direction = Math.random() < 0.5 ? -1 : 1;
  return BOARD_ORDER[(index + direction + BOARD_ORDER.length) % BOARD_ORDER.length];
}

function weightedChoice(items) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[items.length - 1].value;
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function randomAccidentalDart(aimedAt, aimedMultiplier) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const fieldType = weightedChoice(ACCIDENTAL_HIT_WEIGHTS);
    let dart;

    if (fieldType === 'outerBull') {
      dart = { target: 'Bull', multiplier: 1 };
    } else if (fieldType === 'innerBull') {
      dart = { target: 'Bull', multiplier: 2 };
    } else {
      const target = String(Math.floor(Math.random() * 20) + 1);
      const multiplier = fieldType === 'numericTriple' ? 3 : fieldType === 'numericDouble' ? 2 : 1;
      dart = { target, multiplier };
    }

    // Ein Nebentreffer soll nicht zufällig exakt wieder das anvisierte Feld sein.
    if (dart.target !== aimedAt || dart.multiplier !== aimedMultiplier) {
      return { ...dart, aimedAt, aimedMultiplier, accidental: true };
    }
  }

  return { target: null, multiplier: 0, aimedAt, aimedMultiplier };
}

function missOrAccidentalHit(aimedAt, aimedMultiplier) {
  if (chance(BOT_STRATEGY.accidentalHitAfterMissChance)) {
    return randomAccidentalDart(aimedAt, aimedMultiplier);
  }
  return { target: null, multiplier: 0, aimedAt, aimedMultiplier };
}

function resolveNumericBotDart(target, aimMultiplier, factor) {
  const exactBase = aimMultiplier === 3
    ? BASE_ACCURACY.numericTriple
    : aimMultiplier === 2
      ? BASE_ACCURACY.numericDouble
      : BASE_ACCURACY.numericSingle;
  const exactCap = aimMultiplier === 3 ? 0.36 : aimMultiplier === 2 ? 0.44 : 0.88;
  const exactProbability = clamp(exactBase * factor, 0.005, exactCap);
  const wedgeProbability = clamp(BASE_ACCURACY.numericWedge * factor, exactProbability, 0.94);
  const roll = Math.random();

  if (roll < exactProbability) {
    return { target, multiplier: aimMultiplier, aimedAt: target, aimedMultiplier: aimMultiplier };
  }

  // Noch dieselbe Zahl, aber nicht der gewünschte Ring.
  if (roll < wedgeProbability) {
    let fallbackMultiplier;
    if (aimMultiplier === 1) {
      fallbackMultiplier = weightedChoice([
        { value: 2, weight: 0.58 },
        { value: 3, weight: 0.42 },
      ]);
    } else if (aimMultiplier === 2) {
      fallbackMultiplier = weightedChoice([
        { value: 1, weight: 0.94 },
        { value: 3, weight: 0.06 },
      ]);
    } else {
      fallbackMultiplier = weightedChoice([
        { value: 1, weight: 0.94 },
        { value: 2, weight: 0.06 },
      ]);
    }
    return { target, multiplier: fallbackMultiplier, aimedAt: target, aimedMultiplier: aimMultiplier };
  }

  return missOrAccidentalHit(target, aimMultiplier);
}

function resolveBullBotDart(aimMultiplier, factor) {
  const anyBullProbability = clamp(BASE_ACCURACY.anyBull * factor, 0.025, 0.68);
  const innerProbability = clamp(
    BASE_ACCURACY.innerBull * factor * (aimMultiplier === 2 ? 1 : 0.28),
    0.002,
    0.26,
  );

  const roll = Math.random();
  if (roll < innerProbability) {
    return { target: 'Bull', multiplier: 2, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };
  }
  if (roll < anyBullProbability) {
    return { target: 'Bull', multiplier: 1, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };
  }

  return missOrAccidentalHit('Bull', aimMultiplier);
}

function resolveBotDart(target, aimMultiplier, levelKey) {
  const factor = BOT_LEVELS[levelKey]?.factor || BOT_LEVELS.normal.factor;
  return target === 'Bull'
    ? resolveBullBotDart(aimMultiplier, factor)
    : resolveNumericBotDart(target, aimMultiplier, factor);
}

function activeOpponentsFor(playerIndex) {
  return game.players.filter((opponent, index) => index !== playerIndex && isPlayerActive(opponent));
}

function openOpponentCount(playerIndex, target) {
  return activeOpponentsFor(playerIndex).filter((opponent) => Number(opponent.marks[target]) < 3).length;
}

function chooseWeightedTarget(targets, weightForTarget) {
  if (!targets.length) return null;
  return weightedChoice(targets.map((target) => ({
    value: target,
    weight: Math.max(0.01, weightForTarget(target)),
  })));
}

function scoringTargets(playerIndex) {
  const player = game.players[playerIndex];
  return CRICKET_TARGETS.filter((target) => (
    Number(player.marks[target]) >= 3
    && openOpponentCount(playerIndex, target) > 0
  ));
}

function startedTargets(playerIndex) {
  const player = game.players[playerIndex];
  return CRICKET_TARGETS.filter((target) => {
    const marks = Number(player.marks[target]) || 0;
    return marks > 0 && marks < 3;
  });
}

function newTargets(playerIndex) {
  const player = game.players[playerIndex];
  return CRICKET_TARGETS.filter((target) => Number(player.marks[target]) === 0);
}

function chooseScoringTarget(playerIndex, targets) {
  return chooseWeightedTarget(targets, (target) => (
    TARGET_VALUES[target]
    * (1 + openOpponentCount(playerIndex, target) * 0.16)
  ));
}

function chooseStartedTarget(playerIndex, targets) {
  const player = game.players[playerIndex];
  return chooseWeightedTarget(targets, (target) => {
    const marks = Number(player.marks[target]) || 0;
    return (marks === 2 ? 8 : 3.5) + TARGET_VALUES[target] / 20;
  });
}

function chooseNewTarget(targets) {
  return chooseWeightedTarget(targets, (target) => 2 + TARGET_VALUES[target] / 16);
}

function chooseAimMultiplier(playerIndex, target, mode) {
  const player = game.players[playerIndex];
  const marks = Number(player.marks[target]) || 0;

  if (target === 'Bull') {
    if (mode === 'points') {
      return weightedChoice([
        { value: 1, weight: 0.72 },
        { value: 2, weight: 0.28 },
      ]);
    }
    return marks === 2 ? 1 : weightedChoice([
      { value: 1, weight: 0.58 },
      { value: 2, weight: 0.42 },
    ]);
  }

  if (mode === 'points') {
    return weightedChoice([
      { value: 1, weight: 0.20 },
      { value: 2, weight: 0.30 },
      { value: 3, weight: 0.50 },
    ]);
  }
  if (marks === 2) return 1;
  if (marks === 1) return weightedChoice([
    { value: 1, weight: 0.18 },
    { value: 2, weight: 0.67 },
    { value: 3, weight: 0.15 },
  ]);
  return weightedChoice([
    { value: 1, weight: 0.14 },
    { value: 2, weight: 0.28 },
    { value: 3, weight: 0.58 },
  ]);
}

function chooseBotAim(playerIndex) {
  const player = game.players[playerIndex];
  const pointOptions = scoringTargets(playerIndex);
  const startedOptions = startedTargets(playerIndex);
  const freshOptions = newTargets(playerIndex);
  const strategyRoll = Math.random();

  let mode;
  let target;

  if (strategyRoll < BOT_STRATEGY.pointsChance && pointOptions.length) {
    mode = 'points';
    target = chooseScoringTarget(playerIndex, pointOptions);
  } else if (
    strategyRoll < BOT_STRATEGY.pointsChance + BOT_STRATEGY.newFieldChance
    && freshOptions.length
  ) {
    mode = 'new';
    target = chooseNewTarget(freshOptions);
  } else if (startedOptions.length) {
    mode = 'finish';
    target = chooseStartedTarget(playerIndex, startedOptions);
  } else if (freshOptions.length) {
    mode = 'new';
    target = chooseNewTarget(freshOptions);
  } else if (pointOptions.length) {
    mode = 'points';
    target = chooseScoringTarget(playerIndex, pointOptions);
  } else {
    mode = 'new';
    target = '20';
  }

  player.botFocusTarget = mode === 'finish' ? target : null;
  return {
    target,
    aimMultiplier: chooseAimMultiplier(playerIndex, target, mode),
    mode,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function botThrow() {
  if (!game || game.finished || game.pausedForPlacement || getCurrentPlayer().type !== 'bot' || botBusy) return;
  const runId = ++botRunId;
  botBusy = true;
  renderGame();

  const playerIndex = game.currentPlayerIndex;
  const remaining = 3 - game.dartsThisTurn.length;

  for (let i = 0; i < remaining; i += 1) {
    await wait(70);
    if (runId !== botRunId) return;
    if (!game || game.finished || game.pausedForPlacement || game.currentPlayerIndex !== playerIndex) break;
    const player = game.players[playerIndex];
    const aim = chooseBotAim(playerIndex);
    const dart = resolveBotDart(aim.target, aim.aimMultiplier, player.levelKey);
    recordDart(dart, 'bot');
  }

  if (runId !== botRunId) return;
  botBusy = false;
  if (game && !game.finished && !game.pausedForPlacement) {
    persistActiveGame();
    renderGame();
  }
}

function placementLabel(place) {
  return `${place}. Platz`;
}

function sortedRankingPlayers() {
  return [...game.players].sort((a, b) => {
    const aPlace = Number(a.placement) || Number.POSITIVE_INFINITY;
    const bPlace = Number(b.placement) || Number.POSITIVE_INFINITY;
    if (aPlace !== bPlace) return aPlace - bPlace;
    return b.score - a.score;
  });
}

function renderPlacementScores() {
  elements.finalScores.innerHTML = sortedRankingPlayers().map((player) => {
    const place = Number(player.placement);
    const placeText = Number.isInteger(place) && place > 0 ? `${place}.` : '…';
    return `<div class="final-score-row ${place === 1 ? 'winner' : ''} ${place ? 'ranked' : 'still-playing'}"><span><strong>${placeText}</strong> ${escapeHtml(player.name)}</span><strong>${player.score} Punkte</strong></div>`;
  }).join('');
}

function openPlacementDialog(playerIndex, finalGame = false, automaticLastPlayer = null) {
  const player = game.players[playerIndex];
  const place = Number(player.placement) || 1;
  elements.placementBadge.textContent = placementLabel(place).toUpperCase();
  elements.winnerTitle.textContent = `${player.name} wird ${place}.`;
  elements.winnerSummary.textContent = finalGame && automaticLastPlayer
    ? `${automaticLastPlayer.name} belegt damit automatisch den ${placementLabel(automaticLastPlayer.placement)}.`
    : 'Die übrigen Spieler können jetzt um die nächsten Plätze weiterspielen.';
  elements.continuePlacementBtn.hidden = finalGame;
  elements.rematchBtn.textContent = finalGame ? 'Revanche' : 'Neu starten';
  renderPlacementScores();

  if (typeof elements.winnerDialog.showModal === 'function') {
    if (!elements.winnerDialog.open) elements.winnerDialog.showModal();
  } else {
    window.alert(`${player.name}: ${placementLabel(place)}`);
  }
}

function saveCompletedRanking() {
  const winner = game.players.find((player) => Number(player.placement) === 1) || game.players[0];
  game.finished = true;
  game.winnerIndex = game.players.indexOf(winner);
  const record = {
    id: game.id,
    finishedAt: Date.now(),
    startedAt: game.startedAt,
    rounds: game.round,
    winnerName: winner.name,
    players: sortedRankingPlayers().map((player) => ({
      profileId: player.profileId || null,
      name: player.name,
      type: player.type,
      score: player.score,
      placement: player.placement,
      totalMarks: Math.max(0, Number(player.totalMarks) || 0),
      dartsThrown: Math.max(0, Number(player.dartsThrown) || 0),
      hitCounts: normalizeHitCounts(player.hitCounts),
      mpr: calculateMpr(player),
    })),
  };
  history.push(record);
  history = history.slice(-500);
  saveJson(HISTORY_KEY, history);
  localStorage.removeItem(ACTIVE_GAME_KEY);
  renderHistory();
  renderOnlineStats();
  void saveGameOnline(record);
}

function assignPlacement(playerIndex, place) {
  const player = game.players[playerIndex];
  player.placement = place;
  game.placements.push({
    playerIndex,
    instanceId: player.instanceId,
    name: player.name,
    placement: place,
    score: player.score,
    at: Date.now(),
  });
}

function registerPlacement(playerIndex) {
  window.clearTimeout(botStartTimer);

  const firstPlacedIndex = playerIndex;
  const place = game.placements.length + 1;
  assignPlacement(firstPlacedIndex, place);

  game.pendingPlacementIndex = firstPlacedIndex;
  game.pausedForPlacement = true;
  game.dartsThisTurn = [];

  const automaticallyPlaced = [];

  // Every placement changes the opponents still relevant for the score comparison.
  // Therefore immediately keep checking until nobody else can finish automatically.
  while (getActivePlayerIndices().length > 1) {
    const nextWinnerIndex = winningPlayerIndex();
    if (nextWinnerIndex < 0) break;

    assignPlacement(nextWinnerIndex, game.placements.length + 1);
    automaticallyPlaced.push(nextWinnerIndex);
  }

  const activeIndices = getActivePlayerIndices();
  let automaticLastPlayer = null;

  if (activeIndices.length === 1) {
    const lastIndex = activeIndices[0];
    assignPlacement(lastIndex, game.placements.length + 1);
    automaticLastPlayer = game.players[lastIndex];
    saveCompletedRanking();
  } else {
    persistActiveGame();
  }

  renderGame();
  openPlacementDialog(firstPlacedIndex, game.finished, automaticLastPlayer);

  if (automaticallyPlaced.length > 0) {
    const automaticText = automaticallyPlaced
      .map((index) => `${game.players[index].name} wird ebenfalls sofort ${game.players[index].placement}.`)
      .join(' ');
    const lastText = automaticLastPlayer
      ? ` ${automaticLastPlayer.name} belegt automatisch Platz ${automaticLastPlayer.placement}.`
      : '';

    elements.winnerSummary.textContent = `${automaticText}${lastText}`.trim();
  }
}

function continueAfterPlacement() {
  if (!game || game.finished || !game.pausedForPlacement) return;
  elements.winnerDialog.close();
  game.pausedForPlacement = false;
  game.pendingPlacementIndex = null;
  advanceTurn();
}

function rematch() {
  if (!game) return;
  const participants = game.players.map((player) => ({
    instanceId: uid(player.type === 'bot' ? 'bot' : 'seat'),
    profileId: player.profileId,
    type: player.type,
    name: player.name,
    levelKey: player.levelKey,
  }));
  lineup = participants;
  game = createGame(participants);
  selectedMultiplier = 1;
  elements.winnerDialog.close();
  persistActiveGame();
  showGame();
}

function resetCurrentGame() {
  if (!game || botBusy) return;
  if (!window.confirm('Aktuelles Cricket-Spiel wirklich neu starten?')) return;
  const participants = game.players.map((player) => ({
    instanceId: uid(player.type === 'bot' ? 'bot' : 'seat'),
    profileId: player.profileId,
    type: player.type,
    name: player.name,
    levelKey: player.levelKey,
  }));
  game = createGame(participants);
  selectedMultiplier = 1;
  persistActiveGame();
  renderGame();
}

function leaveGameForSetup() {
  if (botBusy) return;
  if (game && !game.finished && !window.confirm('Das laufende Spiel bleibt gespeichert. Zur Einrichtung wechseln?')) return;
  showSetup();
}

function winnerBackToSetup() {
  elements.winnerDialog.close();
  localStorage.removeItem(ACTIVE_GAME_KEY);
  game = null;
  showSetup();
}

function renderHistory() {
  elements.clearHistoryBtn.disabled = history.length === 0;
  if (!history.length) {
    elements.cricketHistory.className = 'cricket-history empty-copy';
    elements.cricketHistory.textContent = 'Noch kein Cricket-Spiel abgeschlossen.';
    return;
  }

  elements.cricketHistory.className = 'cricket-history';
  elements.cricketHistory.innerHTML = [...history].reverse().map((entry) => {
    const date = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.finishedAt));
    const names = entry.players.map((player) => player.name).join(', ');
    return `<button class="history-row history-row-button" type="button" data-history-id="${escapeHtml(entry.id)}">
      <div>
        <div class="history-winner">${escapeHtml(entry.winnerName)} gewinnt</div>
        <div class="lineup-meta">${escapeHtml(names)}</div>
      </div>
      <div class="history-meta">${escapeHtml(date)}<br>${Number(entry.rounds) || 1} Runden</div>
    </button>`;
  }).join('');
}

function openHistoryDetailByIndex(index) {
  if (!history.length || !elements.historyDetailDialog) return;
  selectedHistoryIndex = Math.max(0, Math.min(history.length - 1, index));
  const entry = history[selectedHistoryIndex];
  const date = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.finishedAt));

  elements.historyDetailTitle.textContent = `${entry.winnerName} gewinnt`;
  elements.historyDetailMeta.textContent = `${date} · ${Number(entry.rounds) || 1} Runden`;
  elements.historyDetailRanking.innerHTML = [...entry.players]
    .sort((a, b) => Number(a.placement) - Number(b.placement))
    .map((player) => `
      <div class="history-detail-player">
        <div class="history-detail-place">${Number(player.placement) || '–'}.</div>
        <div class="history-detail-player-main">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${Math.max(0, Number(player.dartsThrown) || 0)} Darts · MPR ${formatNumber(Number(player.mpr) || calculateMpr(player))}</span>
        </div>
        <div class="history-detail-score">${Math.max(0, Number(player.score) || 0)} P</div>
      </div>
    `).join('');

  elements.historyPrevBtn.disabled = selectedHistoryIndex <= 0;
  elements.historyNextBtn.disabled = selectedHistoryIndex >= history.length - 1;

  if (!elements.historyDetailDialog.open) elements.historyDetailDialog.showModal();
}

function openHistoryDetailById(id) {
  const index = history.findIndex((entry) => entry.id === id);
  if (index >= 0) openHistoryDetailByIndex(index);
}

function clearHistory() {
  if (!history.length || !window.confirm('Wirklich die gesamte Cricket-History löschen? Spielerprofile und Around-the-Clock-Daten bleiben erhalten.')) return;
  history = [];
  saveJson(HISTORY_KEY, history);
  renderHistory();
  renderSelectedPlayerStats();
}

function refreshLineupOrderFromDom() {
  const ids = Array.from(elements.selectedLineup.querySelectorAll('[data-seat-id]'))
    .map((card) => card.dataset.seatId);
  const byId = new Map(lineup.map((participant) => [participant.instanceId, participant]));
  const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
  if (reordered.length === lineup.length) lineup = reordered;
}

function updateVisibleTurnOrder() {
  elements.selectedLineup.querySelectorAll('[data-seat-id]').forEach((card, index) => {
    const badge = card.querySelector('.turn-order');
    if (badge) badge.textContent = String(index + 1);
  });
}

function beginLineupDrag(event) {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle) return;
  const card = handle.closest('[data-seat-id]');
  if (!card) return;
  event.preventDefault();
  lineupDrag = { pointerId: event.pointerId, handle, card };
  card.classList.add('dragging');
  handle.setPointerCapture?.(event.pointerId);
}

function moveLineupDrag(event) {
  if (!lineupDrag || event.pointerId !== lineupDrag.pointerId) return;
  event.preventDefault();
  const { card } = lineupDrag;
  const otherCards = Array.from(elements.selectedLineup.querySelectorAll('[data-seat-id]'))
    .filter((entry) => entry !== card);
  const insertBeforeCard = otherCards.find((entry) => {
    const rect = entry.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });
  if (insertBeforeCard) elements.selectedLineup.insertBefore(card, insertBeforeCard);
  else elements.selectedLineup.appendChild(card);
  updateVisibleTurnOrder();
}

function endLineupDrag(event) {
  if (!lineupDrag || event.pointerId !== lineupDrag.pointerId) return;
  lineupDrag.card.classList.remove('dragging');
  lineupDrag.handle.releasePointerCapture?.(event.pointerId);
  lineupDrag = null;
  refreshLineupOrderFromDom();
  renderLineup();
}

function registerServiceWorker() {
  if (navigator.serviceWorker?.register) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function initEvents() {
  elements.createPlayerForm.addEventListener('submit', createProfile);
  elements.savedPlayers.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-profile]');
    if (addButton) addProfile(addButton.dataset.addProfile);
    const deleteButton = event.target.closest('[data-delete-profile]');
    if (deleteButton) void deleteProfile(deleteButton.dataset.deleteProfile);
  });
  elements.selectedLineup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-seat]');
    if (button) removeParticipant(button.dataset.removeSeat);
  });
  elements.selectedLineup.addEventListener('pointerdown', beginLineupDrag);
  elements.selectedLineup.addEventListener('pointermove', moveLineupDrag);
  elements.selectedLineup.addEventListener('pointerup', endLineupDrag);
  elements.selectedLineup.addEventListener('pointercancel', endLineupDrag);
  elements.addBotBtn.addEventListener('click', addBot);
  elements.addAllBotsBtn?.addEventListener('click', addAllBots);  elements.statsPlayerSelect.addEventListener('change', renderSelectedPlayerStats);
  elements.startGameBtn.addEventListener('click', startGameFromLineup);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  elements.onlineRefreshBtn?.addEventListener('click', () => void loadOnlineHistory());
  elements.cricketHistory.addEventListener('click', (event) => {
    const row = event.target.closest('[data-history-id]');
    if (row) openHistoryDetailById(row.dataset.historyId);
  });
  elements.historyPrevBtn?.addEventListener('click', () => {
    if (selectedHistoryIndex !== null) openHistoryDetailByIndex(selectedHistoryIndex - 1);
  });
  elements.historyNextBtn?.addEventListener('click', () => {
    if (selectedHistoryIndex !== null) openHistoryDetailByIndex(selectedHistoryIndex + 1);
  });
  elements.historyDetailCloseBtn?.addEventListener('click', () => elements.historyDetailDialog.close());
  elements.backToSetupBtn.addEventListener('click', leaveGameForSetup);
  elements.resetGameBtn.addEventListener('click', resetCurrentGame);
  elements.targetButtons.addEventListener('dblclick', (event) => event.preventDefault());
  elements.targetButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-target]');
    if (button && !button.disabled) recordHumanTarget(button.dataset.target);
  });
  elements.multiplierButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiplier]');
    if (button && !button.disabled) selectMultiplier(Number(button.dataset.multiplier));
  });
  elements.undoDartBtn.addEventListener('click', restoreUndo);
  elements.continuePlacementBtn.addEventListener('click', continueAfterPlacement);
  elements.rematchBtn.addEventListener('click', rematch);
  elements.winnerSetupBtn.addEventListener('click', winnerBackToSetup);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.gameThemeToggle.addEventListener('click', toggleTheme);
}

function init() {
  applyTheme(loadTheme());
  initEvents();
  renderProfiles();
  renderLineup();
  renderHistory();
  renderOnlineStats();
  registerServiceWorker();
  void loadOnlineHistory({ quiet: true });
  void loadSharedPlayers({ quiet: true });

  const active = loadActiveGame();
  if (active) {
    game = active;
    lineup = game.players.map((player) => ({
      instanceId: uid(player.type === 'bot' ? 'bot' : 'seat'),
      profileId: player.profileId,
      type: player.type,
      name: player.name,
      levelKey: player.levelKey,
    }));
    selectedMultiplier = 1;
    showGame();
    if (game.pausedForPlacement && Number.isInteger(game.pendingPlacementIndex)) {
      window.setTimeout(() => openPlacementDialog(game.pendingPlacementIndex, false, null), 0);
    }
  }
}


window.addEventListener('pageshow', () => {
  profiles = sanitizeProfiles(loadJson(PROFILE_KEY, []));
  history = sanitizeHistory(loadJson(HISTORY_KEY, []));
  renderProfiles();
  renderLineup();
  renderHistory();
  renderOnlineStats();
  void loadOnlineHistory({ quiet: true });
  void loadSharedPlayers({ quiet: true });
});

init();
