"use strict";

const PROFILE_KEY = "darts-cricket-profiles-v1";
const ACTIVE_KEY = "darts-501-active-v2";
const HISTORY_KEY = "darts-501-history-v1";
const THEME_KEY = "darts-trainer-theme";
const LEVELS = [
  ["rookie", "Anfänger", 0.30],
  ["casual", "Leicht", 0.43],
  ["normal", "Mittel", 0.57],
  ["strong", "Schwer", 0.72],
  ["expert", "Profi", 0.86],
];

const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let profiles = load(PROFILE_KEY, []);
let lineup = [];
let game = null;
let mult = 1;
let botTimer = null;

function applyTheme() {
  document.body.classList.toggle("dark", localStorage.getItem(THEME_KEY) === "dark");
}
applyTheme();
$("themeToggle").onclick = () => {
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "light" : "dark");
  applyTheme();
};

function levelInfo(key) {
  return LEVELS.find((x) => x[0] === key) || LEVELS[2];
}
function humanParticipant(p) {
  return { id: uid("seat"), profileId: p.id, name: p.name, type: "human" };
}
function botParticipant(level) {
  const info = levelInfo(level);
  return { id: uid("bot"), name: `Bot ${info[1]}`, type: "bot", level };
}
function displayType(p) {
  return p.type === "bot" ? `Bot · ${levelInfo(p.level)[1]}` : "Mensch";
}

function renderSetup() {
  $("savedPlayers").innerHTML = profiles.map((p) =>
    `<div class="profile-row"><span><strong>${p.name}</strong><br><small class="muted">Mensch</small></span><button class="mini" data-add="${p.id}">+</button></div>`
  ).join("");

  $("lineup").className = lineup.length ? "" : "empty";
  $("lineup").innerHTML = lineup.length
    ? lineup.map((p, i) => `<div class="lineup-row"><span><strong>${i + 1}. ${p.name}</strong><br><small class="muted">${displayType(p)}</small></span><button class="mini" data-rm="${p.id}">×</button></div>`).join("")
    : "Noch niemand ausgewählt.";

  $("startBtn").disabled = lineup.length < 1;
}

$("nameForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("nameInput").value.trim();
  if (!name) return;
  let profile = profiles.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!profile) {
    profile = { id: uid("human"), name };
    profiles.push(profile);
    save(PROFILE_KEY, profiles);
  }
  if (!lineup.some((x) => x.profileId === profile.id)) lineup.push(humanParticipant(profile));
  $("nameInput").value = "";
  renderSetup();
};

$("savedPlayers").onclick = (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const p = profiles.find((x) => x.id === btn.dataset.add);
  if (p && !lineup.some((x) => x.profileId === p.id)) lineup.push(humanParticipant(p));
  renderSetup();
};

$("lineup").onclick = (e) => {
  const btn = e.target.closest("[data-rm]");
  if (!btn) return;
  lineup = lineup.filter((x) => x.id !== btn.dataset.rm);
  renderSetup();
};

$("addBotBtn").onclick = () => {
  lineup.push(botParticipant($("botLevel").value));
  renderSetup();
};
$("addAllBotsBtn").onclick = () => {
  LEVELS.forEach(([key]) => lineup.push(botParticipant(key)));
  renderSetup();
};

function newGame() {
  return {
    id: uid("501"),
    players: lineup.map((p) => ({
      ...clone(p),
      score: 501,
      darts: 0,
      lastThrows: [],
    })),
    current: 0,
    dartsTurn: [],
    turnStart: 501,
    undo: [],
    startedAt: Date.now(),
    finished: false,
  };
}

function dartLabel(n, m) {
  if (!n || !m) return "Miss";
  if (n === 25) return m === 2 ? "DBull" : "Bull";
  const prefix = m === 3 ? "T" : m === 2 ? "D" : "S";
  return `${prefix}${n}`;
}

function lastThreeFor(player) {
  const current = game.dartsTurn.map((d) => dartLabel(d.n, d.m));
  const values = current.length ? current : (player.lastThrows || []);
  return [...values.slice(-3), ...Array(Math.max(0, 3 - values.length)).fill("–")].slice(0, 3);
}

function renderNumbers() {
  $("numbers").innerHTML = [...Array(20)].map((_, i) => `<button data-n="${i + 1}" type="button">${i + 1}</button>`).join("")
    + '<button data-n="25" type="button">Bull</button>';
}

function renderGame() {
  if (!game) return;
  const p = game.players[game.current];

  $("playerName").textContent = p.name;
  $("turnInfo").textContent = p.type === "bot" ? `${p.name} · ${levelInfo(p.level)[1]}` : p.name;
  $("dartCount").textContent = `${game.dartsTurn.length}/3`;

  $("scores").innerHTML = game.players.map((x, i) =>
    `<div class="score-row ${i === game.current ? "current" : ""}">
      <span><strong>${x.name}</strong><br><span class="player-type">${displayType(x)} · ${x.darts} Darts</span></span>
      <span class="score501">${x.score}</span>
    </div>`
  ).join("");

  const shown = lastThreeFor(p);
  $("lastThree").innerHTML = shown.map((x) => `<span>${x}</span>`).join("");

  renderNumbers();
  document.querySelectorAll("[data-m]").forEach((b) => b.classList.toggle("selected", +b.dataset.m === mult));
  $("checkoutHint").textContent = checkout(p.score);

  const isBot = p.type === "bot";
  document.querySelector(".throw-card").hidden = isBot;
  $("botStatus").hidden = !isBot;
  if (isBot) scheduleBot();
}

function checkout(score) {
  if (score < 2 || score > 170) return "";
  if (score === 50) return "Checkout: DBull";
  for (let d = 20; d >= 1; d--) if (score === d * 2) return `Checkout: D${d}`;
  return "";
}

function dartValue(n, m) {
  if (n === 25) return m === 2 ? 50 : 25;
  return n * m;
}

function pushUndo() {
  game.undo.push(clone({ ...game, undo: [] }));
  if (game.undo.length > 120) game.undo.shift();
}

function finishTurnAndAdvance() {
  const p = game.players[game.current];
  p.lastThrows = game.dartsTurn.map((d) => dartLabel(d.n, d.m)).slice(-3);
  game.current = (game.current + 1) % game.players.length;
  game.dartsTurn = [];
  game.turnStart = game.players[game.current].score;
  mult = 1;
  save(ACTIVE_KEY, game);
  renderGame();
}

function win(player) {
  player.lastThrows = game.dartsTurn.map((d) => dartLabel(d.n, d.m)).slice(-3);
  game.finished = true;
  localStorage.removeItem(ACTIVE_KEY);

  const history = load(HISTORY_KEY, []);
  history.push({
    id: game.id,
    winner: player.name,
    finishedAt: Date.now(),
    players: game.players.map((x) => ({
      name: x.name, type: x.type, level: x.level || null, score: x.score, darts: x.darts
    })),
  });
  save(HISTORY_KEY, history);

  $("winTitle").textContent = `${player.name} gewinnt`;
  $("winSummary").textContent = `Double Out geschafft nach ${player.darts} Darts.`;
  $("winDialog").showModal();
  renderGame();
}

function throwDart(n, m, source = "human") {
  if (!game || game.finished) return;
  const p = game.players[game.current];
  if (source === "human" && p.type === "bot") return;
  if (game.dartsTurn.length >= 3) return;

  pushUndo();
  if (game.dartsTurn.length === 0) game.turnStart = p.score;

  const val = n ? dartValue(n, m) : 0;
  p.darts += 1;
  const next = p.score - val;
  const validDouble = m === 2;

  game.dartsTurn.push({ n, m, val });

  if (next === 0 && validDouble) {
    p.score = 0;
    win(p);
    return;
  }

  if (next < 0 || next === 1 || (next === 0 && !validDouble)) {
    p.score = game.turnStart;
    finishTurnAndAdvance();
    return;
  }

  p.score = next;
  if (game.dartsTurn.length === 3) {
    finishTurnAndAdvance();
  } else {
    save(ACTIVE_KEY, game);
    renderGame();
  }
}

function chooseBotAim(player) {
  const score = player.score;

  // Direct double checkout when available.
  if (score === 50) return { n: 25, m: 2 };
  if (score <= 40 && score % 2 === 0) return { n: score / 2, m: 2 };

  // Prefer T20, but set up an even double when close.
  if (score <= 70) {
    const desired = score - 40;
    if (desired >= 1 && desired <= 20) return { n: desired, m: 1 };
  }
  return { n: 20, m: 3 };
}

function resolveBotDart(player) {
  const [,, accuracy] = levelInfo(player.level);
  const aim = chooseBotAim(player);

  if (Math.random() < accuracy) return aim;

  // Same level principle as Cricket: lower levels miss more often.
  if (Math.random() < 0.60) return { n: null, m: 0 };

  // Otherwise a plausible accidental single.
  const accidental = Math.max(1, Math.min(20, aim.n === 25 ? 20 : aim.n + (Math.random() < .5 ? -1 : 1)));
  return { n: accidental, m: 1 };
}

function scheduleBot() {
  clearTimeout(botTimer);
  if (!game || game.finished) return;
  const p = game.players[game.current];
  if (p.type !== "bot") return;
  botTimer = setTimeout(botTurn, 250);
}

async function botTurn() {
  if (!game || game.finished || game.players[game.current].type !== "bot") return;
  const playerIndex = game.current;

  for (let i = 0; i < 3; i++) {
    if (!game || game.finished || game.current !== playerIndex) return;
    await new Promise((r) => setTimeout(r, 180));
    const p = game.players[playerIndex];
    const dart = resolveBotDart(p);
    throwDart(dart.n, dart.m, "bot");
    if (!game || game.finished || game.current !== playerIndex) return;
  }
}

$("numbers").onclick = (e) => {
  const b = e.target.closest("[data-n]");
  if (!b || !game || game.players[game.current].type === "bot") return;
  const n = +b.dataset.n;
  const m = n === 25 ? Math.min(2, mult) : mult;
  throwDart(n, m);
  mult = 1;
};

$("missBtn").onclick = () => {
  if (!game || game.players[game.current].type === "bot") return;
  throwDart(null, 0);
  mult = 1;
};

document.querySelector(".mult-grid").onclick = (e) => {
  const b = e.target.closest("[data-m]");
  if (!b) return;
  mult = +b.dataset.m;
  renderGame();
};

$("undoBtn").onclick = () => {
  clearTimeout(botTimer);
  if (!game?.undo?.length) return;
  const stack = game.undo;
  const previous = stack.pop();
  game = previous;
  game.undo = stack;
  mult = 1;
  save(ACTIVE_KEY, game);
  renderGame();
};

$("backBtn").onclick = () => {
  clearTimeout(botTimer);
  $("game").hidden = true;
  $("setup").hidden = false;
  renderSetup();
};

$("resetBtn").onclick = () => {
  if (!confirm("501 neu starten?")) return;
  clearTimeout(botTimer);
  game = newGame();
  save(ACTIVE_KEY, game);
  renderGame();
};

$("startBtn").onclick = () => {
  game = newGame();
  save(ACTIVE_KEY, game);
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
};

$("againBtn").onclick = () => {
  $("winDialog").close();
  game = newGame();
  save(ACTIVE_KEY, game);
  renderGame();
};

$("setupBtn").onclick = () => {
  clearTimeout(botTimer);
  $("winDialog").close();
  game = null;
  $("game").hidden = true;
  $("setup").hidden = false;
  renderSetup();
};

const activeGame = load(ACTIVE_KEY, null);
if (activeGame && !activeGame.finished) {
  game = activeGame;
  game.players.forEach((p) => {
    p.lastThrows = Array.isArray(p.lastThrows) ? p.lastThrows : [];
    p.type = p.type || "human";
  });
  lineup = game.players.map((p) => ({
    id: p.id,
    profileId: p.profileId || null,
    name: p.name,
    type: p.type || "human",
    level: p.level || null,
  }));
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
} else {
  renderSetup();
}
