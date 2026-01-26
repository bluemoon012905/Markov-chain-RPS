const MOVES = ["rock", "paper", "scissors"];
const MAX_HISTORY = 10;
const STORAGE_KEY = "markov-rps-state-v1";

const elements = {
  wins: document.getElementById("wins"),
  losses: document.getElementById("losses"),
  draws: document.getElementById("draws"),
  rounds: document.getElementById("rounds"),
  playerMove: document.getElementById("player-move"),
  aiMove: document.getElementById("ai-move"),
  outcome: document.getElementById("outcome"),
  prediction: document.getElementById("prediction"),
  hint: document.getElementById("hint"),
  history: document.getElementById("history"),
  transitions: document.getElementById("transitions"),
  reset: document.getElementById("reset"),
};

const defaultState = {
  playerHistory: [],
  stats: {
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: 0,
  },
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...defaultState, stats: { ...defaultState.stats } };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      playerHistory: Array.isArray(parsed.playerHistory)
        ? parsed.playerHistory
        : [],
      stats: { ...defaultState.stats, ...(parsed.stats || {}) },
    };
  } catch (error) {
    return { ...defaultState, stats: { ...defaultState.stats } };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function weightedPick(counts) {
  const entries = Object.entries(counts);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    return MOVES[Math.floor(Math.random() * MOVES.length)];
  }
  let roll = Math.random() * total;
  for (const [move, value] of entries) {
    roll -= value;
    if (roll <= 0) {
      return move;
    }
  }
  return entries[entries.length - 1][0];
}

function buildTransitions(history) {
  const transitions = {
    rock: { rock: 0, paper: 0, scissors: 0 },
    paper: { rock: 0, paper: 0, scissors: 0 },
    scissors: { rock: 0, paper: 0, scissors: 0 },
  };

  for (let index = 0; index < history.length - 1; index += 1) {
    const current = history[index];
    const next = history[index + 1];
    if (transitions[current]) {
      transitions[current][next] += 1;
    }
  }

  return transitions;
}

function predictNextMove(history) {
  const window = history.slice(-MAX_HISTORY);
  if (window.length < 2) {
    return {
      predicted: MOVES[Math.floor(Math.random() * MOVES.length)],
      reason: "Not enough data yet.",
      transitions: buildTransitions(window),
    };
  }

  const transitions = buildTransitions(window);
  const lastMove = window[window.length - 1];
  const nextCounts = transitions[lastMove];
  const totalNext = Object.values(nextCounts).reduce(
    (sum, value) => sum + value,
    0
  );

  if (totalNext > 0) {
    return {
      predicted: weightedPick(nextCounts),
      reason: `Based on your last move: ${formatMove(lastMove)}.`,
      transitions,
    };
  }

  const fallbackCounts = window.reduce(
    (counts, move) => {
      counts[move] += 1;
      return counts;
    },
    { rock: 0, paper: 0, scissors: 0 }
  );

  return {
    predicted: weightedPick(fallbackCounts),
    reason: "Using move frequency in the last 10 rounds.",
    transitions,
  };
}

function counterMove(move) {
  if (move === "rock") return "paper";
  if (move === "paper") return "scissors";
  return "rock";
}

function outcomeFor(player, ai) {
  if (player === ai) return "Draw";
  if (
    (player === "rock" && ai === "scissors") ||
    (player === "paper" && ai === "rock") ||
    (player === "scissors" && ai === "paper")
  ) {
    return "Win";
  }
  return "Loss";
}

function formatMove(move) {
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function renderHistory(history) {
  elements.history.innerHTML = "";
  const window = history.slice(-MAX_HISTORY);
  if (window.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "token";
    placeholder.textContent = "No moves yet";
    elements.history.appendChild(placeholder);
    return;
  }
  window.forEach((move, index) => {
    const token = document.createElement("div");
    token.className = "token";
    token.textContent = `${index + 1}. ${formatMove(move)}`;
    elements.history.appendChild(token);
  });
}

function renderTransitions(transitions) {
  const lines = MOVES.map((move) => {
    const next = transitions[move];
    return `${formatMove(move)} -> R:${next.rock} P:${next.paper} S:${next.scissors}`;
  });
  elements.transitions.textContent = lines.join("\n");
}

function updateScoreboard() {
  elements.wins.textContent = state.stats.wins;
  elements.losses.textContent = state.stats.losses;
  elements.draws.textContent = state.stats.draws;
  elements.rounds.textContent = state.stats.rounds;
}

function updateInsight(prediction) {
  elements.prediction.textContent = `${formatMove(prediction.predicted)}. ${prediction.reason}`;
  elements.hint.textContent =
    state.playerHistory.length < 4
      ? "Play a few rounds to train the model."
      : "The prediction updates every round.";
  renderTransitions(prediction.transitions);
}

function handleMove(playerMove) {
  const prediction = predictNextMove(state.playerHistory);
  const aiMove = counterMove(prediction.predicted);
  const outcome = outcomeFor(playerMove, aiMove);

  state.playerHistory.push(playerMove);
  if (state.playerHistory.length > MAX_HISTORY * 4) {
    state.playerHistory = state.playerHistory.slice(-MAX_HISTORY * 4);
  }

  state.stats.rounds += 1;
  if (outcome === "Win") state.stats.wins += 1;
  if (outcome === "Loss") state.stats.losses += 1;
  if (outcome === "Draw") state.stats.draws += 1;

  saveState(state);

  elements.playerMove.textContent = formatMove(playerMove);
  elements.aiMove.textContent = formatMove(aiMove);
  elements.outcome.textContent = outcome;

  updateScoreboard();
  renderHistory(state.playerHistory);
  updateInsight(predictNextMove(state.playerHistory));
}

function resetGame() {
  state = { ...defaultState, stats: { ...defaultState.stats } };
  saveState(state);
  elements.playerMove.textContent = "—";
  elements.aiMove.textContent = "—";
  elements.outcome.textContent = "—";
  elements.prediction.textContent = "—";
  elements.hint.textContent = "Play a few rounds to train the model.";
  updateScoreboard();
  renderHistory(state.playerHistory);
  renderTransitions(buildTransitions([]));
}

function bindEvents() {
  document.querySelectorAll(".move").forEach((button) => {
    button.addEventListener("click", () => {
      handleMove(button.dataset.move);
    });
  });

  elements.reset.addEventListener("click", resetGame);
}

function init() {
  updateScoreboard();
  renderHistory(state.playerHistory);
  updateInsight(predictNextMove(state.playerHistory));
  bindEvents();
}

init();
