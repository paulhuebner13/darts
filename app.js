const STORAGE_KEY = 'darts-trainer-data-v1';
const THEME_KEY = 'darts-trainer-theme';
const TARGETS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'Bull'
];
const MOVING_AVERAGE_WINDOW = 10;

const elements = {
  currentTarget: document.getElementById('currentTarget'),
  totalThrows: document.getElementById('totalThrows'),
  throw1: document.getElementById('throw1'),
  throw2: document.getElementById('throw2'),
  throw3: document.getElementById('throw3'),
  continueBtn: document.getElementById('continueBtn'),
  undoBtn: document.getElementById('undoBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  gamesPlayed: document.getElementById('gamesPlayed'),
  avgTotalThrows: document.getElementById('avgTotalThrows'),
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
  throwCircles: Array.from(document.querySelectorAll('.throw-circle')),
};

let appData = loadData();
let currentGame = createEmptyGame();
let currentTab = 'play';
let statsDirty = true;
let historyDirty = true;

function createEmptyGame() {
  return {
    currentIndex: 0,
    totalThrows: 0,
    throwsPerTarget: Object.fromEntries(TARGETS.map((target) => [target, 0])),
    startTime: Date.now(),
    actionLog: [],
  };
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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { games: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.games)) return { games: [] };
    return {
      games: parsed.games.filter((game) => game && typeof game.totalThrows === 'number' && game.throwsPerTarget),
    };
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

function switchTab(tabId) {
  currentTab = tabId;
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === tabId));

  if (tabId === 'stats' && statsDirty) {
    renderStats();
  }
  if (tabId === 'history' && historyDirty) {
    renderHistory();
  }
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function getSelectedHits() {
  return [elements.throw1.checked, elements.throw2.checked, elements.throw3.checked];
}

function clearThrowInputs() {
  elements.throw1.checked = false;
  elements.throw2.checked = false;
  elements.throw3.checked = false;
}


function flashMissedThrows(selectedHits) {
  const missedCircles = elements.throwCircles.filter((_, index) => !selectedHits[index]);
  if (!missedCircles.length) return;

  missedCircles.forEach((circle) => circle.classList.add('miss-flash'));
  window.setTimeout(() => {
    missedCircles.forEach((circle) => circle.classList.remove('miss-flash'));
  }, 380);
}

function updateGameView() {
  const finished = currentGame.currentIndex >= TARGETS.length;
  elements.currentTarget.textContent = finished ? 'Fertig' : TARGETS[currentGame.currentIndex];
  elements.totalThrows.textContent = String(currentGame.totalThrows);
  elements.continueBtn.disabled = finished;
  elements.undoBtn.disabled = currentGame.actionLog.length === 0;
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

  if (currentTab === 'stats') {
    renderStats();
  }
  if (currentTab === 'history') {
    renderHistory();
  }

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
  flashMissedThrows(selectedHits);
  currentGame.actionLog.push(createUndoSnapshot(currentGame));

  for (const hit of selectedHits) {
    if (currentGame.currentIndex >= TARGETS.length) break;
    const currentTarget = TARGETS[currentGame.currentIndex];
    currentGame.totalThrows += 1;
    currentGame.throwsPerTarget[currentTarget] += 1;
    if (hit) {
      currentGame.currentIndex += 1;
    }
  }

  clearThrowInputs();
  updateGameView();

  if (currentGame.currentIndex >= TARGETS.length) {
    window.setTimeout(() => completeGame(), 390);
  }
}

function undoLastAction() {
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
  currentGame = createEmptyGame();
  clearThrowInputs();
  updateGameView();
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

function renderTargetBars(games) {
  if (!games.length) {
    elements.targetBars.className = 'target-bars empty-state';
    elements.targetBars.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  const targetAverages = TARGETS.map((target) => {
    const values = games
      .map((game) => game.throwsPerTarget?.[target])
      .filter((value) => typeof value === 'number');
    return {
      target,
      average: values.length ? average(values) : 0,
    };
  });

  const maxAverage = Math.max(...targetAverages.map((item) => item.average), 1);

  elements.targetBars.className = 'target-bars';
  elements.targetBars.innerHTML = targetAverages.map((item) => {
    const widthPercent = (item.average / maxAverage) * 100;
    return `
      <div class="target-bar-row">
        <div class="target-name">${escapeHtml(item.target)}</div>
        <div class="bar-track"><div class="bar-fill" style="width: ${widthPercent.toFixed(2)}%"></div></div>
        <div class="bar-value">${item.average.toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

function calculateMovingAverages(games, windowSize) {
  return games.map((game, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = games.slice(start, index + 1);
    return average(slice.map((entry) => entry.totalThrows));
  });
}

function renderMovingAverageChart(games) {
  if (!games.length) {
    elements.movingAverageChart.className = 'chart-box empty-state';
    elements.movingAverageChart.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  const values = calculateMovingAverages(games, MOVING_AVERAGE_WINDOW);
  const width = 680;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 32, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(1, maxValue - minValue);

  const points = values.map((value, index) => {
    const x = padding.left + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth);
    const y = padding.top + ((maxValue - value) / valueRange) * chartHeight;
    return { x, y };
  });

  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const tickValues = [maxValue, minValue + valueRange / 2, minValue];

  const gridLines = tickValues.map((tick) => {
    const y = padding.top + ((maxValue - tick) / valueRange) * chartHeight;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}"></line>
      <text class="chart-label" x="6" y="${(y + 4).toFixed(1)}">${tick.toFixed(1)}</text>
    `;
  }).join('');

  const lastAverage = values[values.length - 1];

  elements.movingAverageChart.className = 'chart-box';
  elements.movingAverageChart.innerHTML = `
    <div class="chart-meta">
      <span>Fenster: letzte ${Math.min(MOVING_AVERAGE_WINDOW, games.length)} Spiele</span>
      <span>Aktueller MA: ${lastAverage.toFixed(1)} Würfe</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Moving Average der Gesamtwürfe">
      ${gridLines}
      <line class="chart-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      <polyline class="chart-line" points="${polyline}"></polyline>
      <text class="chart-label" x="${padding.left}" y="${height - 8}">1</text>
      <text class="chart-label" x="${(width - padding.right - 16)}" y="${height - 8}">${games.length}</text>
    </svg>
  `;
}

function renderStats() {
  const games = appData.games;
  elements.gamesPlayed.textContent = String(games.length);
  elements.avgTotalThrows.textContent = games.length ? average(games.map((game) => game.totalThrows)).toFixed(1) : '0.0';
  renderTargetBars(games);
  statsDirty = false;
}

function renderHistory() {
  const games = appData.games;
  renderMovingAverageChart(games);

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
        games: parsed.games.filter((game) => game && typeof game.totalThrows === 'number' && game.throwsPerTarget),
      };
      saveData();
      markStatsDirty();
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
