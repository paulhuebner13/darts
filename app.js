const TARGETS = [...Array.from({ length: 20 }, (_, index) => String(index + 1)), 'Bull'];
const STORAGE_KEY = 'darts-trainer-data-v1';
const THEME_KEY = 'darts-trainer-theme';

const elements = {
  currentTarget: document.getElementById('currentTarget'),
  progressText: document.getElementById('progressText'),
  totalThrows: document.getElementById('totalThrows'),
  elapsedTime: document.getElementById('elapsedTime'),
  throw1: document.getElementById('throw1'),
  throw2: document.getElementById('throw2'),
  throw3: document.getElementById('throw3'),
  continueBtn: document.getElementById('continueBtn'),
  undoBtn: document.getElementById('undoBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  previewText: document.getElementById('previewText'),
  gamesPlayed: document.getElementById('gamesPlayed'),
  avgTotalThrows: document.getElementById('avgTotalThrows'),
  bestGame: document.getElementById('bestGame'),
  lastGame: document.getElementById('lastGame'),
  targetStatsTable: document.getElementById('targetStatsTable'),
  trendBox: document.getElementById('trendBox'),
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

let appData = loadData();
let currentGame = createEmptyGame();
let timerId = null;

function createEmptyGame() {
  return {
    currentIndex: 0,
    totalThrows: 0,
    throwsPerTarget: Object.fromEntries(TARGETS.map((target) => [target, 0])),
    startTime: Date.now(),
    actionLog: [],
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { games: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.games)) return { games: [] };
    return parsed;
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

function switchTab(tabId) {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === tabId));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
  updatePreview();
}

function updatePreview() {
  if (currentGame.currentIndex >= TARGETS.length) {
    elements.previewText.textContent = 'Spiel bereits beendet.';
    return;
  }

  const hits = getSelectedHits();
  let simulatedIndex = currentGame.currentIndex;
  const parts = [];

  hits.forEach((hit, index) => {
    const target = TARGETS[simulatedIndex] || 'fertig';
    if (simulatedIndex >= TARGETS.length) {
      parts.push(`Wurf ${index + 1}: Spiel schon beendet`);
      return;
    }
    if (hit) {
      parts.push(`Wurf ${index + 1}: ${target} getroffen`);
      simulatedIndex += 1;
    } else {
      parts.push(`Wurf ${index + 1}: ${target} nicht getroffen`);
    }
  });

  elements.previewText.textContent = parts.join(' | ');
}

function updateGameView() {
  const finished = currentGame.currentIndex >= TARGETS.length;
  elements.currentTarget.textContent = finished ? 'Fertig' : TARGETS[currentGame.currentIndex];
  elements.progressText.textContent = finished
    ? 'Alle 21 Ziele geschafft'
    : `Ziel ${currentGame.currentIndex + 1} von ${TARGETS.length}`;
  elements.totalThrows.textContent = String(currentGame.totalThrows);
  elements.elapsedTime.textContent = formatDuration(Date.now() - currentGame.startTime);
  elements.continueBtn.disabled = finished;
  updatePreview();
}

function completeGame() {
  const finishedAt = Date.now();
  const gameRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    finishedAt,
    totalThrows: currentGame.totalThrows,
    durationMs: finishedAt - currentGame.startTime,
    throwsPerTarget: currentGame.throwsPerTarget,
  };

  appData.games.push(gameRecord);
  saveData();
  renderStats();
  renderHistory();

  elements.finishSummary.textContent = `Du hast ${currentGame.totalThrows} Würfe gebraucht. Dauer: ${formatDuration(gameRecord.durationMs)}.`;
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

  const hits = getSelectedHits();
  const snapshot = JSON.parse(JSON.stringify(currentGame));
  currentGame.actionLog.push(snapshot);

  hits.forEach((hit) => {
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
    completeGame();
  }
}

function undoLastAction() {
  const previous = currentGame.actionLog.pop();
  if (!previous) return;
  currentGame = previous;
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

function renderStats() {
  const games = appData.games;
  elements.gamesPlayed.textContent = String(games.length);
  elements.avgTotalThrows.textContent = games.length ? average(games.map((game) => game.totalThrows)).toFixed(1) : '0.0';
  elements.bestGame.textContent = games.length ? String(Math.min(...games.map((game) => game.totalThrows))) : '-';
  elements.lastGame.textContent = games.length ? String(games[games.length - 1].totalThrows) : '-';

  const rows = TARGETS.map((target) => {
    const values = games.map((game) => game.throwsPerTarget?.[target]).filter((value) => typeof value === 'number');
    const avg = values.length ? average(values).toFixed(2) : '-';
    const best = values.length ? Math.min(...values) : '-';
    const worst = values.length ? Math.max(...values) : '-';
    return `<tr><td>${target}</td><td>${avg}</td><td>${best}</td><td>${worst}</td></tr>`;
  }).join('');

  elements.targetStatsTable.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Ziel</th>
          <th>Ø Würfe</th>
          <th>Bestwert</th>
          <th>Schlechtester Wert</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (!games.length) {
    elements.trendBox.textContent = 'Noch keine abgeschlossenen Spiele vorhanden.';
    return;
  }

  const recent = games.slice(-10);
  const trendText = recent
    .map((game, index) => `${games.length - recent.length + index + 1}: ${game.totalThrows}`)
    .join(' | ');
  elements.trendBox.textContent = `Letzte Spiele nach Gesamtwürfen: ${trendText}`;
}

function renderHistory() {
  const games = [...appData.games].reverse();
  if (!games.length) {
    elements.historyList.className = 'history-list empty-state';
    elements.historyList.textContent = 'Noch keine Spiele gespeichert.';
    return;
  }

  elements.historyList.className = 'history-list';
  elements.historyList.innerHTML = games.map((game, index) => `
    <article class="history-item">
      <div class="history-top">
        <strong>Spiel ${appData.games.length - index}</strong>
        <strong>${game.totalThrows} Würfe</strong>
      </div>
      <div class="history-meta">${formatDate(game.finishedAt)} | Dauer ${formatDuration(game.durationMs || 0)}</div>
      <div class="history-meta">1: ${game.throwsPerTarget['1']} | 5: ${game.throwsPerTarget['5']} | 10: ${game.throwsPerTarget['10']} | 20: ${game.throwsPerTarget['20']} | Bull: ${game.throwsPerTarget['Bull']}</div>
    </article>
  `).join('');
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
      appData = parsed;
      saveData();
      renderStats();
      renderHistory();
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
  renderStats();
  renderHistory();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function startClock() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(updateGameView, 1000);
}

function initEvents() {
  [elements.throw1, elements.throw2, elements.throw3].forEach((checkbox) => {
    checkbox.addEventListener('change', updatePreview);
  });

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
  renderStats();
  renderHistory();
  updateGameView();
  startClock();
  registerServiceWorker();
}

init();
