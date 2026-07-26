'use strict';

const PROFILE_KEY = 'darts-cricket-profiles-v1';
const ACTIVE_GAME_KEY = 'darts-cricket-active-v1';
const HISTORY_KEY = 'darts-cricket-history-v1';
const THEME_KEY = 'darts-trainer-theme';
const MAX_PLAYERS = 6;
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
    label: 'Sehr leicht',
    factor: 0.32,
    description: 'Sehr viele Fehlwürfe und nur selten kleine Felder.',
  },
  casual: {
    label: 'Einfach',
    factor: 0.46,
    description: 'Ein klarer Anfänger-Bot mit schwankenden Singles.',
  },
  normal: {
    label: 'Leicht',
    factor: 0.62,
    description: 'Die mittlere leichte Stufe. Spielt sinnvoll, trifft aber deutlich ungenauer.',
  },
  strong: {
    label: 'Mittel',
    factor: 0.80,
    description: 'Solider Freizeitspieler mit vernünftiger Cricket-Taktik.',
  },
  expert: {
    label: 'Schwer',
    factor: 1.00,
    description: 'Der stärkste Bot, weiterhin klar schwächer als die bisherige Expertenstufe.',
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
  placementBadge: document.getElementById('placementBadge'),
  winnerTitle: document.getElementById('winnerTitle'),
  winnerSummary: document.getElementById('winnerSummary'),
  finalScores: document.getElementById('finalScores'),
  continuePlacementBtn: document.getElementById('continuePlacementBtn'),
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
let botRunId = 0;
let lineupDrag = null;


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
        ? `Bot · ${BOT_LEVELS[participant.levelKey]?.label || 'Leicht'}`
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
    lastThrows: [],
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
    player.lastThrows = Array.isArray(player.lastThrows) ? player.lastThrows.slice(-3) : [];
    player.botFocusTarget = CRICKET_TARGETS.includes(player.botFocusTarget) ? player.botFocusTarget : null;
  });
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
  const result = applyDartToPlayer(playerIndex, dart);
  const recordedDart = {
    ...dart,
    label: dartLabel(dart),
    marksAdded: result.marksAdded,
    pointsAdded: result.pointsAdded,
  };
  game.dartsThisTurn.push(recordedDart);
  player.lastThrows = [...(Array.isArray(player.lastThrows) ? player.lastThrows : []), compactDartLabel(dart)].slice(-3);

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

function renderScoreboard() {
  const headerCells = game.players.map((player, index) => {
    const placed = !isPlayerActive(player);
    const rank = placed ? `<span class="head-rank">${Number(player.placement)}.</span>` : '';
    const recentThrows = Array.isArray(player.lastThrows) ? player.lastThrows.slice(-3) : [];
    const paddedThrows = [...Array(Math.max(0, 3 - recentThrows.length)).fill(''), ...recentThrows];
    const lastThrowsMarkup = paddedThrows.map((label) => `<span class="last-dart-chip ${label ? '' : 'empty'}">${label ? escapeHtml(label) : ''}</span>`).join('');
    return `
      <th class="player-head ${index === game.currentPlayerIndex && !game.pausedForPlacement ? 'active-player' : ''} ${placed ? 'placed-player' : ''}" data-player-index="${index}">
        ${rank}
        <span class="head-name">${escapeHtml(player.name)}</span>
        <span class="head-score">${player.score}</span>
        <span class="head-last-darts" aria-label="Letzte drei Würfe von ${escapeHtml(player.name)}">${lastThrowsMarkup}</span>
      </th>
    `;
  }).join('');

  const rows = CRICKET_TARGETS.map((target) => {
    const targetComplete = game.players.every((player) => Number(player.marks[target]) >= 3);
    const cells = game.players.map((player, index) => {
      const marks = Math.min(3, Number(player.marks[target]) || 0);
      const placed = !isPlayerActive(player);
      return `<td class="mark-cell ${marks >= 3 ? 'closed' : ''} ${index === game.currentPlayerIndex && !game.pausedForPlacement ? 'active-player' : ''} ${placed ? 'placed-player' : ''}" aria-label="${escapeHtml(player.name)} ${escapeHtml(target)}: ${marks} Marks">${getMarkSymbol(marks)}</td>`;
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
      name: player.name,
      type: player.type,
      score: player.score,
      placement: player.placement,
    })),
  };
  history.push(record);
  history = history.slice(-20);
  saveJson(HISTORY_KEY, history);
  localStorage.removeItem(ACTIVE_GAME_KEY);
  renderHistory();
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
  const place = game.placements.length + 1;
  assignPlacement(playerIndex, place);
  game.pendingPlacementIndex = playerIndex;
  game.pausedForPlacement = true;
  game.dartsThisTurn = [];

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
  openPlacementDialog(playerIndex, game.finished, automaticLastPlayer);
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
    if (deleteButton) deleteProfile(deleteButton.dataset.deleteProfile);
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
  elements.startGameBtn.addEventListener('click', startGameFromLineup);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
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
});

init();
