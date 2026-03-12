const STORAGE_KEY = 'darts-trainer-data-v1';
const THEME_KEY = 'darts-trainer-theme';
const TARGETS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'Bull'
];
const MOVING_AVERAGE_WINDOW = 10;
const STATS_WINDOW = 30;
const PLAY_PREVIEW_WINDOW = 20;
const FLASH_DURATION_MS = 390;

const elements = {
  currentTarget: document.getElementById('currentTarget'),
  nextTargetsPreview: document.getElementById('nextTargetsPreview'),
  totalThrows: document.getElementById('totalThrows'),
  avgThrowsPerHit: document.getElementById('avgThrowsPerHit'),
  throw1: document.getElementById('throw1'),
  throw2: document.getElementById('throw2'),
  throw3: document.getElementById('throw3'),
  throwCircle1: document.getElementById('throwCircle1'),
  throwCircle2: document.getElementById('throwCircle2'),
  throwCircle3: document.getElementById('throwCircle3'),
  continueBtn: document.getElementById('continueBtn'),
  undoBtn: document.getElementById('undoBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  gamesPlayed: document.getElementById('gamesPlayed'),
  avgTotalThrows: document.getElementById('avgTotalThrows'),
  bestOverall: document.getElementById('bestOverall'),
  targetBars: document.getElementById('targetBars'),
  movingAverageChart: document.getElementById('movingAverageChart'),
  historyList: document.getElementById('historyList'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  clearDataBtn: document.getElementById('clearDataBtn'),
  finishDialog: document.getElementById('finishDialog'),
  finishSummary: document.getElementById('finishSummary'),
  closeDialogBtn: document.getElementById('closeDialogBtn'),
  themeToggle: document.getElementById('themeToggle'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: Array.from(document.querySelectorAll('.view')),
};

const throwInputs = [elements.throw1, elements.throw2, elements.throw3];
const throwCircles = [elements.throwCircle1, elements.throwCircle2, elements.throwCircle3];

let appData = loadData();
let currentGame = createEmptyGame();
let currentTab = 'play';
let statsDirty = true;
let historyDirty = true;
let finishTimeoutId = null;

function createEmptyGame() {
  return {
    currentIndex: 0,
    totalThrows: 0,
    throwsPerTarget: Object.fromEntries(TARGETS.map((target) => [target, 0])),
    startTime: Date.now(),
    actionLog: [],
  };
}

function sanitizeGame(game) {
  if (!game || typeof game.totalThrows !== 'number' || typeof game.throwsPerTarget !== 'object') {
    return null;
  }

  const throwsPerTarget = Object.fromEntries(
    TARGETS.map((target) => {
      const raw = game.throwsPerTarget?.[target];
      return [target, typeof raw === 'number' ? raw : 0];
    })
  );

  return {
    id: game.id || `${game.finishedAt || Date.now()}-${Math.random().toString(16).slice(2)}`,
    finishedAt: typeof game.finishedAt === 'number' ? game.finishedAt : Date.now(),
    totalThrows: game.totalThrows,
    throwsPerTarget,
    durationMs: typeof game.durationMs === 'number' ? game.durationMs : undefined,
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { games: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.games)) return { games: [] };
    return { games: parsed.games.map(sanitizeGame).filter(Boolean) };
  } catch (error) {
    return { games: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  saveTheme(theme);
}

function markStatsDirty() {
  statsDirty = true;
  historyDirty = true;
}

function getLastGames(limit) {
  return appData.games.slice(-limit);
}

function switchTab(tabId) {
  currentTab = tabId;
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === tabId));

  if (tabId === 'stats' && statsDirty) renderStats();
  if (tabId === 'history' && historyDirty) renderHistory();
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function flashMissedThrows(selectedHits) {
  throwCircles.forEach((circle, index) => {
    circle.classList.remove('miss-flash');
    if (!selectedHits[index]) {
      void circle.offsetWidth;
      circle.classList.add('miss-flash');
      window.setTimeout(() => circle.classList.remove('miss-flash'), FLASH_DURATION_MS);
    }
  });
}

function getRollingTargetStats(limit) {
  const games = getLastGames(limit);
  return TARGETS.map((target) => {
    const values = games
      .map((game) => game.throwsPerTarget?.[target])
      .filter((value) => typeof value === 'number');

    return {
      target,
      average: values.length ? average(values) : null,
      best: values.length ? Math.min(...values) : null,
      samples: values.length,
    };
  });
}

function renderNextTargetsPreview() {
  const statsByTarget = new Map(getRollingTargetStats(PLAY_PREVIEW_WINDOW).map((item) => [item.target, item]));
  const previewTargets = TARGETS.slice(currentGame.currentIndex, currentGame.currentIndex + 3);

  if (!previewTargets.length) {
    elements.nextTargetsPreview.className = 'next-targets-preview empty-mini';
    elements.nextTargetsPreview.textContent = 'Fertig';
    return;
  }

  elements.nextTargetsPreview.className = 'next-targets-preview';
  elements.nextTargetsPreview.innerHTML = previewTargets.map((target) => {
    const stat = statsByTarget.get(target);
    const valueText = stat && stat.average !== null
      ? `${stat.average.toFixed(2)} Ø`
      : '–';

    return `
      <div class="next-target-row">
        <div class="next-target-label">${escapeHtml(target)}</div>
        <div class="next-target-value">${valueText}</div>
      </div>
    `;
  }).join('');
}


function updateGameView() {
  const finished = currentGame.currentIndex >= TARGETS.length;
  const hitsCompleted = currentGame.currentIndex;
  const avgThrowsPerHit = hitsCompleted > 0 ? currentGame.totalThrows / hitsCompleted : 0;

  elements.currentTarget.textContent = finished ? 'Fertig' : TARGETS[currentGame.currentIndex];
  elements.totalThrows.textContent = String(currentGame.totalThrows);
  elements.avgThrowsPerHit.textContent = avgThrowsPerHit ? avgThrowsPerHit.toFixed(2) : '0.0';
  elements.continueBtn.disabled = finished;
  renderNextTargetsPreview();
}

function completeGame() {
  const finishedAt = Date.now();
  const gameRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    finishedAt,
    totalThrows: currentGame.totalThrows,
    throwsPerTarget: { ...currentGame.throwsPerTarget },
  };

  appData.games.push(gameRecord);
  saveData();
  markStatsDirty();

  if (currentTab === 'stats') renderStats();
  if (currentTab === 'history') renderHistory();

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
    const currentTarget = TARGETS[currentGame.currentIndex];
    currentGame.totalThrows += 1;
    currentGame.throwsPerTarget[currentTarget] += 1;
    if (hit) {
      currentGame.currentIndex += 1;
    }
  });

  clearThrowInputs();
  updateGameView();

  if (currentGame.currentIndex >= TARGETS.length) {
    window.clearTimeout(finishTimeoutId);
    finishTimeoutId = window.setTimeout(() => completeGame(), FLASH_DURATION_MS);
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
  if (hasProgress) {
    const confirmed = window.confirm('Aktuelles Spiel wirklich verwerfen und neu starten?');
    if (!confirmed) return;
  }
  if (finishTimeoutId) {
    window.clearTimeout(finishTimeoutId);
    finishTimeoutId = null;
  }
  currentGame = createEmptyGame();
  clearThrowInputs();
  updateGameView();
}

function renderTargetBars() {
  const games = getLastGames(STATS_WINDOW);
  if (!games.length) {
    elements.targetBars.className = 'target-bars empty-state';
    elements.targetBars.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  const targetStats = getRollingTargetStats(STATS_WINDOW);
  const maxAverage = Math.max(...targetStats.map((item) => item.average || 0), 1);

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

function calculateMovingAveragePoints(games, windowSize) {
  return games.map((game, index) => {
    const hasFullWindow = index + 1 >= windowSize;
    const slice = hasFullWindow
      ? games.slice(index - windowSize + 1, index + 1)
      : games.slice(0, index + 1);

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

  const pointsData = calculateMovingAveragePoints(games, MOVING_AVERAGE_WINDOW);
  const values = pointsData.flatMap((item) => item.isFullWindow ? [item.pointValue, item.average] : [item.pointValue]);
  const width = 680;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 32, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(1, maxValue - minValue);

  const points = pointsData.map((item, index) => {
    const x = padding.left + (pointsData.length === 1 ? chartWidth / 2 : (index / (pointsData.length - 1)) * chartWidth);
    const pointY = padding.top + ((maxValue - item.pointValue) / valueRange) * chartHeight;
    const avgY = padding.top + ((maxValue - item.average) / valueRange) * chartHeight;
    return { ...item, x, pointY, avgY };
  });

  const fullWindowPoints = points.filter((point) => point.isFullWindow);
  const polyline = fullWindowPoints.map((point) => `${point.x.toFixed(1)},${point.avgY.toFixed(1)}`).join(' ');
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
    : `Aktueller Schnitt: ${latest.average.toFixed(1)} Würfe`;

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
      ${polyline ? `<polyline class="chart-line" points="${polyline}"></polyline>` : ''}
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
  renderTargetBars();
  statsDirty = false;
}

function renderHistory() {
  const games = appData.games;
  renderMovingAverageChart();

  const reversedGames = [...games].reverse();
  if (!reversedGames.length) {
    elements.historyList.className = 'history-list empty-state';
    elements.historyList.textContent = 'Noch keine Spiele gespeichert.';
    historyDirty = false;
    return;
  }

  elements.historyList.className = 'history-list';
  elements.historyList.innerHTML = reversedGames.map((game, index) => `
    <article class="history-item">
      <div class="history-top">
        <strong>Spiel ${games.length - index}</strong>
        <strong>${game.totalThrows} Würfe</strong>
      </div>
      <div class="history-meta">${formatDate(game.finishedAt)}</div>
    </article>
  `).join('');
  historyDirty = false;
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
      if (!parsed || !Array.isArray(parsed.games)) {
        throw new Error('Ungültiges Format');
      }
      appData = {
        games: parsed.games.map(sanitizeGame).filter(Boolean),
      };
      saveData();
      markStatsDirty();
      renderNextTargetsPreview();
      if (currentTab === 'stats') renderStats();
      if (currentTab === 'history') renderHistory();
      alert('Daten erfolgreich importiert.');
    } catch (error) {
      alert('Import fehlgeschlagen. Bitte eine gültige JSON-Datei verwenden.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function clearAllData() {
  const confirmed = window.confirm('Wirklich alle gespeicherten Daten löschen?');
  if (!confirmed) return;
  appData = { games: [] };
  saveData();
  markStatsDirty();
  updateGameView();
  if (currentTab === 'stats') renderStats();
  if (currentTab === 'history') renderHistory();
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
  elements.themeToggle.addEventListener('click', () => {
    const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
  });
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function init() {
  applyTheme(loadTheme());
  initEvents();
  updateGameView();
  switchTab('play');
  registerServiceWorker();
}

init();
