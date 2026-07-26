'use strict';

const PROFILE_KEY = 'darts-cricket-profiles-v1';
const ACTIVE_GAME_KEY = 'darts-cricket-active-v1';
const HISTORY_KEY = 'darts-cricket-history-v1';
const THEME_KEY = 'darts-trainer-theme';
const MAX_PLAYERS = 6;
const CRICKET_TARGETS = ['20', '19', '18', '17', '16', '15', 'Bull'];
const TARGET_VALUES = { '20': 20, '19': 19, '18': 18, '17': 17, '16': 16, '15': 15, Bull: 25 };
const BOARD_ORDER = ['20', '1', '18', '4', '13', '6', '10', '15', '2', '17', '3', '19', '7', '16', '8', '11', '14', '9', '12', '5'];

// Jeder Feldtyp besitzt eine feste Basisgenauigkeit. Die Schwierigkeit multipliziert
// diese Werte linear. So trifft ein Bot mit Faktor 1,4 dasselbe kleine Feld ungefähr
// 40 % häufiger als ein Bot mit Faktor 1,0, solange der Sicherheitsdeckel nicht greift.
const BASE_ACCURACY = {
  numericSingle: 0.56,
  numericWedge: 0.72,
  numericDouble: 0.10,
  numericTriple: 0.075,
  anyBull: 0.50,
  innerBull: 0.12,
};

const BOT_LEVELS = {
  rookie: {
    label: 'Anfänger',
    factor: 0.58,
    description: 'Viele Streuwürfe. Kleine Doppel-, Triple- und Bull-Felder werden nur selten getroffen.',
  },
  casual: {
    label: 'Locker',
    factor: 0.80,
    description: 'Solider Freizeitspieler. Singles gelingen oft, Triple und Bull bleiben deutlich schwieriger.',
  },
  normal: {
    label: 'Normal',
    factor: 1.00,
    description: 'Ausgewogener Bot mit vernünftiger Cricket-Taktik und realistisch schwankender Genauigkeit.',
  },
  strong: {
    label: 'Stark',
    factor: 1.28,
    description: 'Trifft kleine Felder spürbar häufiger und nutzt offene Zahlen konsequent zum Punkten.',
  },
  expert: {
    label: 'Experte',
    factor: 1.60,
    description: 'Sehr präzise. Triple und Bull bleiben schwerer als Singles, werden aber deutlich öfter getroffen.',
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
  botDifficulty: document.getElementById('botDifficulty'),
  addBotBtn: document.getElementById('addBotBtn'),
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
  winnerTitle: document.getElementById('winnerTitle'),
  winnerSummary: document.getElementById('winnerSummary'),
  finalScores: document.getElementById('finalScores'),
  rematchBtn: document.getElementById('rematchBtn'),
  winnerSetupBtn: document.getElementById('winnerSetupBtn'),
  themeToggle: document.getElementById('themeToggle'),
  gameThemeToggle: document.getElementById('gameThemeToggle'),
};

let profiles = loadJson(PROFILE_KEY, []);
let history = loadJson(HISTORY_KEY, []);
let lineup = [];
let game = null;
let selectedMultiplier = 1;
let botBusy = false;
let botStartTimer = null;


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
  return raw.filter((entry) => entry && Array.isArray(entry.players) && entry.winnerName).slice(-20);
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
  const level = BOT_LEVELS[levelKey] || BOT_LEVELS.normal;
  const sameLevelCount = lineup.filter((participant) => participant.type === 'bot' && participant.levelKey === levelKey).length;
  return {
    instanceId: uid('bot'),
    type: 'bot',
    name: `Bot ${level.label}${sameLevelCount ? ` ${sameLevelCount + 1}` : ''}`,
    levelKey,
  };
}

function isProfileSelected(profileId) {
  return lineup.some((participant) => participant.profileId === profileId);
}

function setSetupMessage(message = '') {
  elements.setupMessage.textContent = message;
}

function canAddParticipant() {
  if (lineup.length >= MAX_PLAYERS) {
    setSetupMessage(`Maximal ${MAX_PLAYERS} Teilnehmer sind möglich.`);
    return false;
  }
  return true;
}

function renderProfiles() {
  if (!profiles.length) {
    elements.savedPlayers.innerHTML = '<div class="empty-copy">Noch keine gespeicherten Spieler.</div>';
    return;
  }

  elements.savedPlayers.innerHTML = profiles.map((profile) => `
    <div class="saved-player-row">
      <span class="saved-player-name">${escapeHtml(profile.name)}</span>
      <button class="add-profile" type="button" data-add-profile="${escapeHtml(profile.id)}" ${isProfileSelected(profile.id) || lineup.length >= MAX_PLAYERS ? 'disabled' : ''}>+</button>
      <button class="delete-profile" type="button" data-delete-profile="${escapeHtml(profile.id)}" aria-label="${escapeHtml(profile.name)} löschen">×</button>
    </div>
  `).join('');
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
        ? `Bot · ${BOT_LEVELS[participant.levelKey]?.label || 'Normal'}`
        : 'Mensch';
      return `
        <div class="lineup-card">
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

function createProfile(event) {
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

  const profile = { id: uid('human'), name, createdAt: Date.now() };
  profiles.push(profile);
  saveJson(PROFILE_KEY, profiles);
  elements.playerNameInput.value = '';
  setSetupMessage('');

  if (canAddParticipant()) lineup.push(participantFromProfile(profile));
  renderProfiles();
  renderLineup();
}

function addProfile(profileId) {
  if (!canAddParticipant() || isProfileSelected(profileId)) return;
  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) return;
  lineup.push(participantFromProfile(profile));
  setSetupMessage('');
  renderLineup();
}

function deleteProfile(profileId) {
  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) return;
  if (!window.confirm(`Spieler „${profile.name}“ wirklich löschen?`)) return;
  profiles = profiles.filter((entry) => entry.id !== profileId);
  lineup = lineup.filter((participant) => participant.profileId !== profileId);
  saveJson(PROFILE_KEY, profiles);
  renderProfiles();
  renderLineup();
}

function addBot() {
  if (!canAddParticipant()) return;
  lineup.push(createBot(elements.botDifficulty.value));
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
  raw.undoStack = Array.isArray(raw.undoStack) ? raw.undoStack.slice(-120) : [];
  raw.log = Array.isArray(raw.log) ? raw.log.slice(-80) : [];
  raw.dartsThisTurn = Array.isArray(raw.dartsThisTurn) ? raw.dartsThisTurn.slice(0, 3) : [];
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

function pushUndo() {
  game.undoStack.push(snapshotGame());
  if (game.undoStack.length > 120) game.undoStack.shift();
}

function restoreUndo() {
  if (!game?.undoStack?.length || botBusy) return;
  const previous = game.undoStack.pop();
  const remainingStack = game.undoStack;
  game = previous;
  game.undoStack = remainingStack;
  persistActiveGame();
  renderGame();
}

function getCurrentPlayer() {
  return game.players[game.currentPlayerIndex];
}

function getMarkSymbol(marks) {
  if (marks <= 0) return '–';
  if (marks === 1) return '╱';
  if (marks === 2) return '✕';
  return '●';
}

function isTargetOpenForOpponent(playerIndex, target) {
  return game.players.some((player, index) => index !== playerIndex && Number(player.marks[target]) < 3);
}

function allTargetsClosed(player) {
  return CRICKET_TARGETS.every((target) => Number(player.marks[target]) >= 3);
}

function winningPlayerIndex() {
  return game.players.findIndex((player) => {
    if (!allTargetsClosed(player)) return false;
    return game.players.every((opponent) => player.score >= opponent.score);
  });
}

function dartLabel(dart) {
  if (!dart || dart.multiplier === 0 || !dart.target) return 'Miss';
  if (dart.target === 'Bull') return dart.multiplier === 2 ? 'Inner Bull' : 'Outer Bull';
  const prefix = dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${dart.target}`;
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
  if (!game || game.finished || botBusy && source !== 'bot') return;
  if (game.dartsThisTurn.length >= 3) return;

  pushUndo();
  const playerIndex = game.currentPlayerIndex;
  const player = game.players[playerIndex];
  const result = applyDartToPlayer(playerIndex, dart);
  const recordedDart = {
    ...dart,
    label: dartLabel(dart),
    marksAdded: result.marksAdded,
    pointsAdded: result.pointsAdded,
  };
  game.dartsThisTurn.push(recordedDart);

  let detail = result.pointsAdded > 0 ? ` · +${result.pointsAdded} Punkte` : '';
  if (result.marksAdded > 0) detail += ` · +${result.marksAdded} Mark${result.marksAdded === 1 ? '' : 's'}`;
  addLog(`<strong>${escapeHtml(player.name)}</strong>: ${escapeHtml(recordedDart.label)}${detail}`);

  const winnerIndex = winningPlayerIndex();
  if (winnerIndex >= 0) {
    finishGame(winnerIndex);
    return;
  }

  if (game.dartsThisTurn.length >= 3) {
    advanceTurn();
  } else {
    persistActiveGame();
    renderGame();
  }
}

function advanceTurn() {
  if (!game || game.finished) return;
  const previousIndex = game.currentPlayerIndex;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  if (game.currentPlayerIndex === 0 && previousIndex === game.players.length - 1) game.round += 1;
  game.dartsThisTurn = [];
  selectedMultiplier = 1;
  persistActiveGame();
  renderGame();
}

function endTurnEarly() {
  if (!game || game.finished || botBusy) return;
  pushUndo();
  addLog(`<strong>${escapeHtml(getCurrentPlayer().name)}</strong>: Zug beendet`);
  advanceTurn();
}

function renderTargetButtons() {
  const player = getCurrentPlayer();
  const numberButtons = CRICKET_TARGETS.map((target) => {
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

function renderScoreboard() {
  const headerCells = game.players.map((player, index) => `
    <th class="player-head ${index === game.currentPlayerIndex ? 'active-player' : ''}" data-player-index="${index}">
      <span class="head-name">${escapeHtml(player.name)}</span>
      <span class="head-score">${player.score}</span>
    </th>
  `).join('');

  const rows = CRICKET_TARGETS.map((target) => {
    const cells = game.players.map((player, index) => {
      const marks = Math.min(3, Number(player.marks[target]) || 0);
      return `<td class="mark-cell ${marks >= 3 ? 'closed' : ''} ${index === game.currentPlayerIndex ? 'active-player' : ''}" aria-label="${escapeHtml(player.name)} ${escapeHtml(target)}: ${marks} Marks">${getMarkSymbol(marks)}</td>`;
    }).join('');
    return `<tr><th class="target-cell">${escapeHtml(target)}</th>${cells}</tr>`;
  }).join('');

  elements.scoreboard.innerHTML = `
    <thead><tr><th class="target-head">Ziel</th>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  `;
}

function scheduleAutomaticBotTurn() {
  window.clearTimeout(botStartTimer);
  if (!game || game.finished || botBusy || getCurrentPlayer().type !== 'bot') return;
  botStartTimer = window.setTimeout(() => botThrow(), 35);
}

function renderGame() {
  if (!game) return;
  const player = getCurrentPlayer();
  const isBot = player.type === 'bot';

  elements.humanControls.hidden = isBot;
  elements.botControls.hidden = !isBot;
  elements.undoDartBtn.disabled = !game.undoStack.length || botBusy;

  renderTargetButtons();
  renderMultiplierButtons();
  renderScoreboard();
  renderTurnDots();

  window.requestAnimationFrame(scrollActivePlayerIntoView);
  scheduleAutomaticBotTurn();
}

function recordHumanTarget(target) {
  if (!game || game.finished || botBusy || getCurrentPlayer().type !== 'human') return;

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
  if (!game || botBusy || getCurrentPlayer().type !== 'human') return;
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

function resolveNumericBotDart(target, aimMultiplier, factor) {
  const exactBase = aimMultiplier === 3
    ? BASE_ACCURACY.numericTriple
    : aimMultiplier === 2
      ? BASE_ACCURACY.numericDouble
      : BASE_ACCURACY.numericSingle;
  const exactCap = aimMultiplier === 3 ? 0.42 : aimMultiplier === 2 ? 0.52 : 0.90;
  const exactProbability = clamp(exactBase * factor, 0.01, exactCap);
  const wedgeProbability = clamp(BASE_ACCURACY.numericWedge * factor, exactProbability, 0.96);
  const roll = Math.random();

  // Das tatsächlich anvisierte Feld wird exakt mit Basiswahrscheinlichkeit × Bot-Faktor getroffen.
  if (roll < exactProbability) {
    return { target, multiplier: aimMultiplier, aimedAt: target, aimedMultiplier: aimMultiplier };
  }

  // Der Dart landet noch in derselben Zahl, aber in einem anderen Ring.
  if (roll < wedgeProbability) {
    let fallbackMultiplier = 1;
    if (aimMultiplier === 1) {
      fallbackMultiplier = weightedChoice([
        { value: 2, weight: 0.58 },
        { value: 3, weight: 0.42 },
      ]);
    } else if (aimMultiplier === 2) {
      fallbackMultiplier = weightedChoice([
        { value: 1, weight: 0.92 },
        { value: 3, weight: 0.08 },
      ]);
    } else {
      fallbackMultiplier = weightedChoice([
        { value: 1, weight: 0.91 },
        { value: 2, weight: 0.09 },
      ]);
    }
    return { target, multiplier: fallbackMultiplier, aimedAt: target, aimedMultiplier: aimMultiplier };
  }

  if (chance(0.70)) {
    const adjacent = adjacentBoardTarget(target);
    const multiplier = chance(0.035 * factor) ? 3 : chance(0.05 * factor) ? 2 : 1;
    return { target: adjacent, multiplier, aimedAt: target, aimedMultiplier: aimMultiplier };
  }

  return { target: null, multiplier: 0, aimedAt: target, aimedMultiplier: aimMultiplier };
}

function resolveBullBotDart(aimMultiplier, factor) {
  const anyBullProbability = clamp(BASE_ACCURACY.anyBull * factor, 0.10, 0.80);
  const innerProbability = clamp(BASE_ACCURACY.innerBull * factor * (aimMultiplier === 2 ? 1.18 : 0.58), 0.025, 0.44);

  const roll = Math.random();
  if (roll < innerProbability) return { target: 'Bull', multiplier: 2, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };
  if (roll < anyBullProbability) return { target: 'Bull', multiplier: 1, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };

  if (chance(0.58)) {
    const numericTarget = String(Math.floor(Math.random() * 20) + 1);
    const multiplier = chance(0.03 * factor) ? 3 : chance(0.045 * factor) ? 2 : 1;
    return { target: numericTarget, multiplier, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };
  }

  return { target: null, multiplier: 0, aimedAt: 'Bull', aimedMultiplier: aimMultiplier };
}

function resolveBotDart(target, aimMultiplier, levelKey) {
  const factor = BOT_LEVELS[levelKey]?.factor || 1;
  return target === 'Bull'
    ? resolveBullBotDart(aimMultiplier, factor)
    : resolveNumericBotDart(target, aimMultiplier, factor);
}

function targetPriority(playerIndex, target) {
  const player = game.players[playerIndex];
  const ownMarks = Number(player.marks[target]) || 0;
  const openOpponents = game.players.filter((opponent, index) => index !== playerIndex && Number(opponent.marks[target]) < 3).length;
  if (openOpponents === 0 && ownMarks >= 3) return -Infinity;

  const maxOpponentScore = Math.max(...game.players.filter((_, index) => index !== playerIndex).map((opponent) => opponent.score));
  const scoreDeficit = Math.max(0, maxOpponentScore - player.score);
  const closingNeed = Math.max(0, 3 - ownMarks);
  const pointPotential = ownMarks >= 3 && openOpponents > 0 ? TARGET_VALUES[target] : 0;
  const highNumberBias = TARGET_VALUES[target] / 3;
  const urgency = scoreDeficit > 0 ? pointPotential * 1.7 : pointPotential * 0.8;
  const closeBias = closingNeed * 24;
  const bullPenalty = target === 'Bull' ? 7 : 0;

  return closeBias + urgency + highNumberBias + openOpponents * 3 - bullPenalty + Math.random() * 3;
}

function chooseSuggestedTarget(playerIndex) {
  return [...CRICKET_TARGETS].sort((a, b) => targetPriority(playerIndex, b) - targetPriority(playerIndex, a))[0] || '20';
}

function chooseBotAim(playerIndex) {
  const target = chooseSuggestedTarget(playerIndex);
  const player = game.players[playerIndex];
  const marks = Number(player.marks[target]) || 0;
  let aimMultiplier;

  if (target === 'Bull') {
    aimMultiplier = 2;
  } else if (marks < 3) {
    aimMultiplier = marks === 2 ? 1 : 3;
  } else {
    aimMultiplier = 3;
  }

  return { target, aimMultiplier };
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function botThrow() {
  if (!game || game.finished || getCurrentPlayer().type !== 'bot' || botBusy) return;
  botBusy = true;
  renderGame();

  const playerIndex = game.currentPlayerIndex;
  const remaining = 3 - game.dartsThisTurn.length;

  for (let i = 0; i < remaining; i += 1) {
    await wait(70);
    if (!game || game.finished || game.currentPlayerIndex !== playerIndex) break;
    const player = game.players[playerIndex];
    const aim = chooseBotAim(playerIndex);
    const dart = resolveBotDart(aim.target, aim.aimMultiplier, player.levelKey);
    recordDart(dart, 'bot');
  }

  botBusy = false;
  if (game && !game.finished) {
    persistActiveGame();
    renderGame();
  }
}

function finishGame(winnerIndex) {
  window.clearTimeout(botStartTimer);
  game.finished = true;
  game.winnerIndex = winnerIndex;
  const winner = game.players[winnerIndex];
  const record = {
    id: game.id,
    finishedAt: Date.now(),
    startedAt: game.startedAt,
    rounds: game.round,
    winnerName: winner.name,
    players: game.players.map((player) => ({ name: player.name, type: player.type, score: player.score })),
  };
  history.push(record);
  history = history.slice(-20);
  saveJson(HISTORY_KEY, history);
  localStorage.removeItem(ACTIVE_GAME_KEY);

  renderGame();
  elements.winnerTitle.textContent = `${winner.name} gewinnt!`;
  elements.winnerSummary.textContent = `Alle Cricket-Felder geschlossen und nach ${game.round} Runden mindestens punktgleich vorne.`;
  elements.finalScores.innerHTML = [...game.players]
    .sort((a, b) => b.score - a.score)
    .map((player) => `<div class="final-score-row ${player.instanceId === winner.instanceId ? 'winner' : ''}"><span>${escapeHtml(player.name)}</span><strong>${player.score} Punkte</strong></div>`)
    .join('');

  if (typeof elements.winnerDialog.showModal === 'function') elements.winnerDialog.showModal();
  else window.alert(`${winner.name} gewinnt!`);
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
  elements.cricketHistory.innerHTML = [...history].reverse().slice(0, 8).map((entry) => {
    const date = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.finishedAt));
    const names = entry.players.map((player) => player.name).join(', ');
    return `<div class="history-row"><div><div class="history-winner">${escapeHtml(entry.winnerName)} gewinnt</div><div class="lineup-meta">${escapeHtml(names)}</div></div><div class="history-meta">${escapeHtml(date)}<br>${Number(entry.rounds) || 1} Runden</div></div>`;
  }).join('');
}

function clearHistory() {
  if (!history.length || !window.confirm('Den gesamten Cricket-Verlauf löschen?')) return;
  history = [];
  saveJson(HISTORY_KEY, history);
  renderHistory();
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
    if (deleteButton) deleteProfile(deleteButton.dataset.deleteProfile);
  });
  elements.selectedLineup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-seat]');
    if (button) removeParticipant(button.dataset.removeSeat);
  });
  elements.addBotBtn.addEventListener('click', addBot);
  elements.startGameBtn.addEventListener('click', startGameFromLineup);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  elements.backToSetupBtn.addEventListener('click', leaveGameForSetup);
  elements.resetGameBtn.addEventListener('click', resetCurrentGame);
  elements.targetButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-target]');
    if (button && !button.disabled) recordHumanTarget(button.dataset.target);
  });
  elements.multiplierButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiplier]');
    if (button && !button.disabled) selectMultiplier(Number(button.dataset.multiplier));
  });
  elements.undoDartBtn.addEventListener('click', restoreUndo);
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
  registerServiceWorker();

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
  }
}


window.addEventListener('pageshow', () => {
  profiles = sanitizeProfiles(loadJson(PROFILE_KEY, []));
  history = sanitizeHistory(loadJson(HISTORY_KEY, []));
  renderProfiles();
  renderLineup();
  renderHistory();
});

init();
