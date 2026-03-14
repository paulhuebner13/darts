const STORAGE_KEY = 'darts-trainer-data-v1';
const THEME_KEY = 'darts-trainer-theme';
const TARGETS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'Bull'
];
const STATS_WINDOW = 30;
const PREVIEW_WINDOW = 30;
const NEXT_TARGET_COUNT = 3;
const MOVING_AVERAGE_WINDOW = 10;
const FLASH_DURATION_MS = 220;

const elements = {
  currentTarget: document.getElementById('currentTarget'),
  nextTargetsPreview: document.getElementById('nextTargetsPreview'),
  totalThrows: document.getElementById('totalThrows'),
  avgThrowsPerHit: document.getElementById('avgThrowsPerHit'),
  projectedTotal: document.getElementById('projectedTotal'),
  throw1: document.getElementById('throw1'),
  throw2: document.getElementById('throw2'),
  throw3: document.getElementById('throw3'),
  continueBtn: document.getElementById('continueBtn'),
  undoBtn: document.getElementById('undoBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  gamesPlayed: document.getElementById('gamesPlayed'),
  avgTotalThrows: document.getElementById('avgTotalThrows'),
  bestOverall: document.getElementById('bestOverall'),
  longestStreak: document.getElementById('longestStreak'),
  targetBars: document.getElementById('targetBars'),
  movingAverageChart: document.getElementById('movingAverageChart'),
  historyList: document.getElementById('historyList'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  clearDataBtn: document.getElementById('clearDataBtn'),
  finishDialog: document.getElementById('finishDialog'),
  finishSummary: document.getElementById('finishSummary'),
  closeDialogBtn: document.getElementById('closeDialogBtn'),
  gameDetailDialog: document.getElementById('gameDetailDialog'),
  detailTitle: document.getElementById('detailTitle'),
  detailMeta: document.getElementById('detailMeta'),
  detailBars: document.getElementById('detailBars'),
  deleteGameBtn: document.getElementById('deleteGameBtn'),
  closeDetailDialogBtn: document.getElementById('closeDetailDialogBtn'),
  themeToggle: document.getElementById('themeToggle'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: Array.from(document.querySelectorAll('.view')),
};

const throwInputs = [elements.throw1, elements.throw2, elements.throw3];
const throwCircles = [
  document.getElementById('throwCircle1'),
  document.getElementById('throwCircle2'),
  document.getElementById('throwCircle3'),
];

let appData = loadData();
let currentGame = createEmptyGame();
let currentTab = 'play';
let finishTimeoutId = null;
let selectedGameId = null;

function createEmptyGame() {
  return {
    currentIndex: 0,
    totalThrows: 0,
    throwsPerTarget: Object.fromEntries(TARGETS.map((target) => [target, 0])),
    actionLog: [],
  };
}

function sanitizeThrowsPerTarget(raw) {
  const sanitized = Object.fromEntries(TARGETS.map((target) => [target, 0]));
  if (!raw || typeof raw !== 'object') return sanitized;
  TARGETS.forEach((target) => {
    const value = raw[target];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      sanitized[target] = value;
    }
  });
  return sanitized;
}

function sanitizeGame(game) {
  if (!game || typeof game !== 'object') return null;
  const totalThrows = Number(game.totalThrows);
  if (!Number.isFinite(totalThrows) || totalThrows < 0) return null;
  return {
    id: typeof game.id === 'string' && game.id ? game.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    finishedAt: Number.isFinite(Number(game.finishedAt)) ? Number(game.finishedAt) : Date.now(),
    totalThrows,
    throwsPerTarget: sanitizeThrowsPerTarget(game.throwsPerTarget),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { games: [] };
    const parsed = JSON.parse(raw);
    const games = Array.isArray(parsed?.games) ? parsed.games.map(sanitizeGame).filter(Boolean) : [];
    return { games };
  } catch {
    return { games: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

function switchTab(tabId) {
  currentTab = tabId;
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === tabId));
  if (tabId === 'stats') renderStats();
  if (tabId === 'history') renderHistory();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getLastGames(limit) {
  return appData.games.slice(-limit);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getSelectedHits() {
  return throwInputs.map((input) => input.checked);
}

function clearThrowInputs() {
  throwInputs.forEach((input) => {
    input.checked = false;
  });
}

function createUndoSnapshot(game) {
  return {
    currentIndex: game.currentIndex,
    totalThrows: game.totalThrows,
    throwsPerTarget: { ...game.throwsPerTarget },
  };
}

function restoreFromSnapshot(snapshot) {
  currentGame.currentIndex = snapshot.currentIndex;
  currentGame.totalThrows = snapshot.totalThrows;
  currentGame.throwsPerTarget = { ...snapshot.throwsPerTarget };
}

function getTargetAverageMap(limit = STATS_WINDOW) {
  const games = getLastGames(limit);
  return Object.fromEntries(TARGETS.map((target) => {
    const values = games
      .map((game) => game.throwsPerTarget?.[target])
      .filter((value) => typeof value === 'number' && value > 0);
    return [target, values.length ? average(values) : null];
  }));
}

function getCurrentTargetPreviewData() {
  const averages = getTargetAverageMap(PREVIEW_WINDOW);
  return TARGETS.slice(currentGame.currentIndex, currentGame.currentIndex + NEXT_TARGET_COUNT).map((target) => ({
    target,
    average: averages[target],
  }));
}

function renderNextTargetsPreview() {
  const previewItems = getCurrentTargetPreviewData();
  if (!previewItems.length) {
    elements.nextTargetsPreview.innerHTML = '<div class="next-target-empty">Fertig</div>';
    return;
  }

  elements.nextTargetsPreview.innerHTML = previewItems.map((item) => `
    <div class="next-target-row">
      <div class="next-target-label">${escapeHtml(item.target)}</div>
      <div class="next-target-value">${item.average !== null ? item.average.toFixed(2) : '–'}</div>
    </div>
  `).join('');
}

function calculateProjectedTotal() {
  const progressedCount = currentGame.currentIndex;
  if (progressedCount === 0 || currentGame.totalThrows === 0) return null;

  const averages = getTargetAverageMap(STATS_WINDOW);
  const completedTargets = TARGETS.slice(0, progressedCount);
  const remainingTargets = TARGETS.slice(progressedCount);

  const completedAverageTotal = completedTargets.reduce((sum, target) => sum + (averages[target] ?? 0), 0);
  const remainingAverageTotal = remainingTargets.reduce((sum, target) => sum + (averages[target] ?? 0), 0);

  if (completedAverageTotal <= 0) return null;
  return currentGame.totalThrows + (currentGame.totalThrows / completedAverageTotal) * remainingAverageTotal;
}

function updateGameView() {
  const finished = currentGame.currentIndex >= TARGETS.length;
  elements.currentTarget.textContent = finished ? 'Fertig' : TARGETS[currentGame.currentIndex];
  elements.totalThrows.textContent = String(currentGame.totalThrows);

  const hitsSoFar = currentGame.currentIndex;
  const avgThrowsPerHit = hitsSoFar > 0 ? currentGame.totalThrows / hitsSoFar : 0;
  elements.avgThrowsPerHit.textContent = hitsSoFar > 0 ? avgThrowsPerHit.toFixed(2) : '0.0';

  const projectedTotal = calculateProjectedTotal();
  elements.projectedTotal.textContent = projectedTotal !== null ? projectedTotal.toFixed(1) : '–';

  elements.continueBtn.disabled = finished;
  renderNextTargetsPreview();
}

function flashMissedThrows(selectedHits) {
  selectedHits.forEach((hit, index) => {
    if (hit) return;
    throwCircles[index].classList.add('miss-flash');
    window.setTimeout(() => {
      throwCircles[index].classList.remove('miss-flash');
    }, FLASH_DURATION_MS);
  });
}

function completeGame() {
  finishTimeoutId = null;
  const finishedAt = Date.now();
  const gameRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    finishedAt,
    totalThrows: currentGame.totalThrows,
    throwsPerTarget: { ...currentGame.throwsPerTarget },
  };

  appData.games.push(gameRecord);
  saveData();
  renderStats();
  renderHistory();

  elements.finishSummary.textContent = `Du hast ${currentGame.totalThrows} Würfe gebraucht.`;
  if (typeof elements.finishDialog.showModal === 'function') {
    elements.finishDialog.showModal();
  } else {
    alert(elements.finishSummary.textContent);
  }

  currentGame = createEmptyGame();
  clearThrowInputs();
  updateGameView();
}

function applyTurn() {
  if (currentGame.currentIndex >= TARGETS.length) return;

  const selectedHits = getSelectedHits();
  currentGame.actionLog.push(createUndoSnapshot(currentGame));
  flashMissedThrows(selectedHits);

  selectedHits.forEach((hit) => {
    if (currentGame.currentIndex >= TARGETS.length) return;
    const target = TARGETS[currentGame.currentIndex];
    currentGame.totalThrows += 1;
    currentGame.throwsPerTarget[target] += 1;
    if (hit) currentGame.currentIndex += 1;
  });

  clearThrowInputs();
  updateGameView();

  if (currentGame.currentIndex >= TARGETS.length) {
    window.clearTimeout(finishTimeoutId);
    finishTimeoutId = window.setTimeout(completeGame, FLASH_DURATION_MS);
  }
}

function undoLastAction() {
  if (finishTimeoutId) {
    window.clearTimeout(finishTimeoutId);
    finishTimeoutId = null;
  }
  const previous = currentGame.actionLog.pop();
  if (!previous) return;
  restoreFromSnapshot(previous);
  clearThrowInputs();
  updateGameView();
}

function startNewGame() {
  const hasProgress = currentGame.totalThrows > 0 && currentGame.currentIndex < TARGETS.length;
  if (hasProgress && !window.confirm('Aktuelles Spiel wirklich verwerfen und neu starten?')) return;
  if (finishTimeoutId) {
    window.clearTimeout(finishTimeoutId);
    finishTimeoutId = null;
  }
  currentGame = createEmptyGame();
  clearThrowInputs();
  updateGameView();
}

function getRollingTargetStats(limit = STATS_WINDOW) {
  const games = getLastGames(limit);
  return TARGETS.map((target) => {
    const values = games
      .map((game) => game.throwsPerTarget?.[target])
      .filter((value) => typeof value === 'number' && value > 0);
    return {
      target,
      average: values.length ? average(values) : null,
    };
  });
}

function renderTargetBars() {
  const targetStats = getRollingTargetStats(STATS_WINDOW);
  const maxAverage = Math.max(...targetStats.map((item) => item.average || 0), 1);
  const anyData = targetStats.some((item) => item.average !== null);

  if (!anyData) {
    elements.targetBars.className = 'target-bars empty-state';
    elements.targetBars.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  elements.targetBars.className = 'target-bars';
  elements.targetBars.innerHTML = `
    <div class="target-bar-header">
      <div>Ziel</div>
      <div>Ø letzte 30</div>
      <div>Ø</div>
    </div>
  ` + targetStats.map((item) => {
    const widthPercent = item.average !== null ? (item.average / maxAverage) * 100 : 0;
    return `
      <div class="target-bar-row">
        <div class="target-name">${escapeHtml(item.target)}</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${widthPercent.toFixed(2)}%"></div></div>
        <div class="bar-value">${item.average !== null ? item.average.toFixed(2) : '–'}</div>
      </div>
    `;
  }).join('');
}

function getLongestStreak() {
  return appData.games.reduce((best, game) => {
    let streak = 0;
    let gameBest = 0;
    TARGETS.forEach((target) => {
      if (game.throwsPerTarget?.[target] === 1) {
        streak += 1;
        gameBest = Math.max(gameBest, streak);
      } else {
        streak = 0;
      }
    });
    return Math.max(best, gameBest);
  }, 0);
}

function buildMovingAverageSeries(games, windowSize) {
  return games.map((game, index) => {
    const hasFullWindow = index + 1 >= windowSize;
    const slice = hasFullWindow ? games.slice(index - windowSize + 1, index + 1) : games.slice(0, index + 1);
    return {
      gameNumber: index + 1,
      pointValue: game.totalThrows,
      average: average(slice.map((entry) => entry.totalThrows)),
      isFullWindow: hasFullWindow,
    };
  });
}

function renderMovingAverageChart() {
  const games = appData.games;
  if (!games.length) {
    elements.movingAverageChart.className = 'chart-box empty-state';
    elements.movingAverageChart.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  const series = buildMovingAverageSeries(games, MOVING_AVERAGE_WINDOW);
  const values = series.flatMap((item) => item.isFullWindow ? [item.pointValue, item.average] : [item.pointValue]);
  const width = 680;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 32, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(1, maxValue - minValue);

  const points = series.map((item, index) => {
    const x = padding.left + (series.length === 1 ? chartWidth / 2 : (index / (series.length - 1)) * chartWidth);
    const pointY = padding.top + ((maxValue - item.pointValue) / valueRange) * chartHeight;
    const avgY = padding.top + ((maxValue - item.average) / valueRange) * chartHeight;
    return { ...item, x, pointY, avgY };
  });

  const linePoints = points.filter((point) => point.isFullWindow);
  const polyline = linePoints.map((point) => `${point.x.toFixed(1)},${point.avgY.toFixed(1)}`).join(' ');
  const tickValues = [maxValue, minValue + valueRange / 2, minValue];
  const gridLines = tickValues.map((tick) => {
    const y = padding.top + ((maxValue - tick) / valueRange) * chartHeight;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}"></line>
      <text class="chart-label" x="6" y="${(y + 4).toFixed(1)}">${tick.toFixed(1)}</text>
    `;
  }).join('');

  const pointsMarkup = points.map((point) => `
    <circle class="chart-point" cx="${point.x.toFixed(1)}" cy="${point.pointY.toFixed(1)}" r="3.5"></circle>
  `).join('');

  const latest = points[points.length - 1];
  const metaText = points.length >= MOVING_AVERAGE_WINDOW
    ? `MA10 zuletzt: ${latest.average.toFixed(1)} Würfe`
    : `Noch keine volle MA10-Linie`;

  elements.movingAverageChart.className = 'chart-box';
  elements.movingAverageChart.innerHTML = `
    <div class="chart-meta">
      <span>Punkte = einzelne Spiele</span>
      <span>${metaText}</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Verlauf der Gesamtwürfe mit Moving Average">
      ${gridLines}
      <line class="chart-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      ${polyline ? `<polyline class="chart-line moving-average-line" points="${polyline}"></polyline>` : ''}
      ${pointsMarkup}
      <text class="chart-label" x="${padding.left}" y="${height - 8}">1</text>
      <text class="chart-label" x="${width - padding.right - 16}" y="${height - 8}">${games.length}</text>
    </svg>
  `;
}

function renderStats() {
  const allGames = appData.games;
  const statsGames = getLastGames(STATS_WINDOW);
  elements.gamesPlayed.textContent = String(allGames.length);
  elements.avgTotalThrows.textContent = statsGames.length ? average(statsGames.map((game) => game.totalThrows)).toFixed(1) : '0.0';
  elements.bestOverall.textContent = allGames.length ? String(Math.min(...allGames.map((game) => game.totalThrows))) : '–';
  const longest = getLongestStreak();
  elements.longestStreak.textContent = longest ? String(longest) : '–';
  renderTargetBars();
}

function renderHistory() {
  const games = appData.games;
  renderMovingAverageChart();

  const reversedGames = [...games].reverse();
  if (!reversedGames.length) {
    elements.historyList.className = 'history-list empty-state';
    elements.historyList.textContent = 'Noch keine Spiele gespeichert.';
    return;
  }

  elements.historyList.className = 'history-list';
  elements.historyList.innerHTML = reversedGames.map((game, index) => `
    <button class="history-item" type="button" data-game-id="${escapeHtml(game.id)}">
      <div class="history-top">
        <strong>Spiel ${games.length - index}</strong>
        <strong>${game.totalThrows} Würfe</strong>
      </div>
      <div class="history-meta">${formatDate(game.finishedAt)}</div>
    </button>
  `).join('');
}

function renderDetailBars(game) {
  const maxThrows = Math.max(...TARGETS.map((target) => game.throwsPerTarget?.[target] || 0), 1);
  elements.detailBars.innerHTML = `
    <div class="target-bar-header">
      <div>Ziel</div>
      <div>Würfe</div>
      <div>#</div>
    </div>
  ` + TARGETS.map((target) => {
    const value = game.throwsPerTarget?.[target] || 0;
    const widthPercent = (value / maxThrows) * 100;
    return `
      <div class="target-bar-row">
        <div class="target-name">${escapeHtml(target)}</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${widthPercent.toFixed(2)}%"></div></div>
        <div class="bar-value">${value}</div>
      </div>
    `;
  }).join('');
}

function openGameDetail(gameId) {
  const game = appData.games.find((entry) => entry.id === gameId);
  if (!game) return;
  selectedGameId = gameId;
  const gameIndex = appData.games.findIndex((entry) => entry.id === gameId) + 1;
  elements.detailTitle.textContent = `Spiel ${gameIndex}`;
  elements.detailMeta.textContent = `${formatDate(game.finishedAt)} • ${game.totalThrows} Würfe gesamt`;
  renderDetailBars(game);
  if (typeof elements.gameDetailDialog.showModal === 'function') {
    elements.gameDetailDialog.showModal();
  }
}

function deleteSelectedGame() {
  if (!selectedGameId) return;
  const game = appData.games.find((entry) => entry.id === selectedGameId);
  if (!game) return;
  if (!window.confirm('Dieses Spiel wirklich löschen?')) return;
  appData.games = appData.games.filter((entry) => entry.id !== selectedGameId);
  saveData();
  renderStats();
  renderHistory();
  selectedGameId = null;
  elements.gameDetailDialog.close();
}

function exportData() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `darts-trainer-export-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || !Array.isArray(parsed.games)) throw new Error('Ungültiges Format');
      appData = { games: parsed.games.map(sanitizeGame).filter(Boolean) };
      saveData();
      renderStats();
      renderHistory();
      updateGameView();
      alert('Daten erfolgreich importiert.');
    } catch {
      alert('Import fehlgeschlagen. Bitte eine gültige JSON-Datei verwenden.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!window.confirm('Wirklich alle gespeicherten Daten löschen?')) return;
  appData = { games: [] };
  saveData();
  renderStats();
  renderHistory();
  updateGameView();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function initEvents() {
  elements.continueBtn.addEventListener('click', applyTurn);
  elements.undoBtn.addEventListener('click', undoLastAction);
  elements.newGameBtn.addEventListener('click', startNewGame);
  elements.exportBtn.addEventListener('click', exportData);
  elements.importInput.addEventListener('change', importData);
  elements.clearDataBtn.addEventListener('click', clearAllData);
  elements.closeDialogBtn.addEventListener('click', () => elements.finishDialog.close());
  elements.closeDetailDialogBtn.addEventListener('click', () => elements.gameDetailDialog.close());
  elements.deleteGameBtn.addEventListener('click', deleteSelectedGame);
  elements.themeToggle.addEventListener('click', () => {
    const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
  });
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  elements.historyList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-game-id]');
    if (!item) return;
    openGameDetail(item.dataset.gameId);
  });
}

function init() {
  applyTheme(loadTheme());
  initEvents();
  renderStats();
  renderHistory();
  updateGameView();
  registerServiceWorker();
}

init();
