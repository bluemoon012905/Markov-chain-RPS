const MOVES = ["rock", "paper", "scissors"];
const MAX_HISTORY = 10;
const BLOCK_SIZE = 10;
const MAX_OUTCOME_HISTORY = 500;
const MAX_PERSIST_HISTORY = 2000;
const MAX_LOOKBACK = 10;
const STORAGE_KEY = "markov-rps-state-v1";

const elements = {
  wins: document.getElementById("wins"),
  losses: document.getElementById("losses"),
  draws: document.getElementById("draws"),
  rounds: document.getElementById("rounds"),
  playerMove: document.getElementById("player-move"),
  aiMove: document.getElementById("ai-move"),
  outcome: document.getElementById("outcome"),
  forecast: document.getElementById("forecast"),
  aiModeToggle: document.getElementById("ai-mode-toggle"),
  forecastToggle: document.getElementById("forecast-toggle"),
  forecastLast10Last: document.getElementById("forecast-last10-last"),
  forecastLast10Next: document.getElementById("forecast-last10-next"),
  forecastLast10Ai: document.getElementById("forecast-last10-ai"),
  forecastPersistLast: document.getElementById("forecast-persist-last"),
  forecastPersistNext: document.getElementById("forecast-persist-next"),
  forecastPersistAi: document.getElementById("forecast-persist-ai"),
  forecastRandomLast: document.getElementById("forecast-random-last"),
  forecastRandomNext: document.getElementById("forecast-random-next"),
  forecastRandomAi: document.getElementById("forecast-random-ai"),
  hint: document.getElementById("hint"),
  history: document.getElementById("history"),
  transitions: document.getElementById("transitions"),
  mathBox: document.getElementById("math-box"),
  graph: document.getElementById("graph"),
  graphScroll: document.getElementById("graph-scroll"),
  reset: document.getElementById("reset"),
};

const defaultState = {
  playerHistory: [],
  persistHistory: [],
  lastRandomMove: null,
  outcomeHistoryByMode: {
    last10: [],
    persist: [],
    random: [],
  },
  statsByMode: {
    last10: { wins: 0, losses: 0, draws: 0, rounds: 0 },
    persist: { wins: 0, losses: 0, draws: 0, rounds: 0 },
    random: { wins: 0, losses: 0, draws: 0, rounds: 0 },
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
      persistHistory: Array.isArray(parsed.persistHistory)
        ? parsed.persistHistory
        : [],
      lastRandomMove: parsed.lastRandomMove || null,
      outcomeHistoryByMode: parsed.outcomeHistoryByMode || {
        last10: Array.isArray(parsed.outcomeHistory)
          ? parsed.outcomeHistory
          : [],
        persist: [],
        random: [],
      },
      statsByMode: parsed.statsByMode || {
        last10: { ...defaultState.statsByMode.last10, ...(parsed.stats || {}) },
        persist: { ...defaultState.statsByMode.persist },
        random: { ...defaultState.statsByMode.random },
      },
    };
  } catch (error) {
    return {
      ...defaultState,
      statsByMode: {
        last10: { ...defaultState.statsByMode.last10 },
        persist: { ...defaultState.statsByMode.persist },
        random: { ...defaultState.statsByMode.random },
      },
    };
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
  // Weighted random selection proportional to observed transition counts.
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

  // Count how often each move follows each other move in the window.
  for (let index = 0; index < history.length - 1; index += 1) {
    const current = history[index];
    const next = history[index + 1];
    if (transitions[current]) {
      transitions[current][next] += 1;
    }
  }

  return transitions;
}

function countNextForSequence(history, sequence) {
  const counts = { rock: 0, paper: 0, scissors: 0 };
  if (sequence.length === 0) return counts;

  for (let index = 0; index <= history.length - sequence.length - 1; index += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (history[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const next = history[index + sequence.length];
      counts[next] += 1;
    }
  }
  return counts;
}

function formatProb(value) {
  return value.toFixed(2);
}

function buildMathText(context, counts, predicted) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return "Not enough data yet.";
  }
  const probs = {
    rock: counts.rock / total,
    paper: counts.paper / total,
    scissors: counts.scissors / total,
  };
  const contextText = context.length
    ? context.map((move) => formatMove(move)).join(" → ")
    : "Any";
  return [
    `Legend: R=${formatProb(probs.rock)} P=${formatProb(probs.paper)} S=${formatProb(
      probs.scissors
    )}`,
    `Context: ${contextText}`,
    `P(R | context) = ${formatProb(probs.rock)}`,
    `P(P | context) = ${formatProb(probs.paper)}`,
    `P(S | context) = ${formatProb(probs.scissors)}`,
    `Chosen: ${formatMove(predicted)}`,
  ].join("\n");
}

function predictNextMove(history, windowSize = MAX_HISTORY) {
  const window = windowSize ? history.slice(-windowSize) : history.slice();
  if (window.length < 2) {
    return {
      predicted: MOVES[Math.floor(Math.random() * MOVES.length)],
      reason: "Not enough data yet.",
      transitions: buildTransitions(window),
      math: { context: [], counts: { rock: 0, paper: 0, scissors: 0 } },
    };
  }

  // Prefer the longest recent sequence available, up to MAX_LOOKBACK.
  const maxLookback = Math.min(MAX_LOOKBACK, window.length - 1);
  for (let lookback = maxLookback; lookback >= 1; lookback -= 1) {
    const sequence = window.slice(-lookback);
    const counts = countNextForSequence(window, sequence);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return {
        predicted: weightedPick(counts),
        reason:
          lookback === 1
            ? `Based on your last move: ${formatMove(sequence[0])}.`
            : `Based on your last ${lookback} moves: ${sequence
                .map((move) => formatMove(move))
                .join(" → ")}.`,
        transitions: { context: sequence, counts },
        math: { context: sequence, counts },
      };
    }
  }

  // If the last-move row is empty, fall back to overall frequency in the window.
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
    math: { context: [], counts: fallbackCounts },
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
  if (transitions === null) {
    elements.transitions.textContent = "Random control has no transitions.";
    return;
  }

  if (!transitions || Object.keys(transitions).length === 0) {
    elements.transitions.textContent = "No transitions yet.";
    return;
  }

  if (transitions.context && transitions.counts) {
    const label = transitions.context
      .map((move) => formatMove(move))
      .join(" → ");
    const next = transitions.counts;
    elements.transitions.textContent = `${label} -> R:${next.rock} P:${next.paper} S:${next.scissors}`;
    return;
  }

  const hasSingleMoves = MOVES.every((move) => transitions[move]);
  if (hasSingleMoves) {
    const lines = MOVES.map((move) => {
      const next = transitions[move];
      return `${formatMove(move)} -> R:${next.rock} P:${next.paper} S:${next.scissors}`;
    });
    elements.transitions.textContent = lines.join("\n");
    return;
  }

  const pairOrder = [];
  MOVES.forEach((first) => {
    MOVES.forEach((second) => {
      pairOrder.push(`${first}-${second}`);
    });
  });
  const lines = pairOrder
    .filter((key) => transitions[key])
    .map((key) => {
      const [first, second] = key.split("-");
      const next = transitions[key];
      return `${formatMove(first)}+${formatMove(
        second
      )} -> R:${next.rock} P:${next.paper} S:${next.scissors}`;
    });
  elements.transitions.textContent =
    lines.length > 0 ? lines.join("\n") : "No transitions yet.";
}

function renderMath(prediction, isRandom) {
  if (isRandom) {
    elements.mathBox.textContent = [
      "Legend: R=0.33 P=0.33 S=0.33",
      "Context: Random control",
      "P(R) = 0.33",
      "P(P) = 0.33",
      "P(S) = 0.33",
      "Chosen: Random draw",
    ].join("\n");
    return;
  }
  elements.mathBox.textContent = buildMathText(
    prediction.math.context,
    prediction.math.counts,
    prediction.predicted
  );
}

function renderGraph(outcomes) {
  elements.graph.innerHTML = "";
  const chunks = [];
  for (let index = 0; index < outcomes.length; index += BLOCK_SIZE) {
    chunks.push(outcomes.slice(index, index + BLOCK_SIZE));
  }

  if (chunks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "token";
    empty.textContent = "No rounds yet";
    elements.graph.appendChild(empty);
    return;
  }

  chunks.forEach((chunk, chunkIndex) => {
    const counts = chunk.reduce(
      (acc, outcome) => {
        if (outcome === "Win") acc.win += 1;
        if (outcome === "Loss") acc.loss += 1;
        if (outcome === "Draw") acc.draw += 1;
        return acc;
      },
      { win: 0, loss: 0, draw: 0 }
    );

    const emptyCount = BLOCK_SIZE - chunk.length;
    const order = [
      { type: "empty", count: emptyCount },
      { type: "loss", count: counts.loss },
      { type: "draw", count: counts.draw },
      { type: "win", count: counts.win },
    ];

    const bar = document.createElement("div");
    bar.className = "graph-bar";
    bar.setAttribute(
      "aria-label",
      `Rounds ${chunkIndex * BLOCK_SIZE + 1}-${chunkIndex * BLOCK_SIZE + BLOCK_SIZE}`
    );

    order.forEach((segment) => {
      for (let i = 0; i < segment.count; i += 1) {
        const cell = document.createElement("div");
        cell.className = "graph-cell";
        if (segment.type !== "empty") {
          cell.classList.add(segment.type);
        }
        bar.appendChild(cell);
      }
    });

    elements.graph.appendChild(bar);
  });

  requestAnimationFrame(() => {
    elements.graphScroll.scrollLeft = elements.graphScroll.scrollWidth;
  });
}

function currentStats() {
  return state.statsByMode[activeMode];
}

function updateScoreboard() {
  const stats = currentStats();
  elements.wins.textContent = stats.wins;
  elements.losses.textContent = stats.losses;
  elements.draws.textContent = stats.draws;
  elements.rounds.textContent = stats.rounds;
}

let activeMode = "last10";

function currentPredictions() {
  return {
    last10: predictNextMove(state.playerHistory, MAX_HISTORY),
    persist: predictNextMove(state.persistHistory, null),
  };
}

function updateForecast(predictions, lastMoveLast10, lastMovePersist, randomMove) {
  const last10Ai = counterMove(predictions.last10.predicted);
  const persistAi = counterMove(predictions.persist.predicted);
  elements.forecastLast10Last.textContent = lastMoveLast10
    ? formatMove(lastMoveLast10)
    : "—";
  elements.forecastLast10Next.textContent = formatMove(
    predictions.last10.predicted
  );
  elements.forecastLast10Ai.textContent = formatMove(last10Ai);
  elements.forecastPersistLast.textContent = lastMovePersist
    ? formatMove(lastMovePersist)
    : "—";
  elements.forecastPersistNext.textContent = formatMove(
    predictions.persist.predicted
  );
  elements.forecastPersistAi.textContent = formatMove(persistAi);
  elements.forecastRandomLast.textContent = lastMoveLast10
    ? formatMove(lastMoveLast10)
    : "—";
  elements.forecastRandomNext.textContent = "—";
  elements.forecastRandomAi.textContent = randomMove
    ? formatMove(randomMove)
    : "—";
  elements.hint.textContent =
    state.playerHistory.length < 4
      ? "Play a few rounds to train the model."
      : "The prediction updates every round.";
  const transitions =
    activeMode === "persist"
      ? predictions.persist.transitions
      : activeMode === "random"
        ? null
        : predictions.last10.transitions;
  renderTransitions(transitions);
  const activePrediction =
    activeMode === "persist" ? predictions.persist : predictions.last10;
  renderMath(activePrediction, activeMode === "random");
}

function handleMove(playerMove) {
  const predictions = currentPredictions();
  const randomMove = MOVES[Math.floor(Math.random() * MOVES.length)];
  state.lastRandomMove = randomMove;
  const selectedPrediction =
    activeMode === "persist" ? predictions.persist : predictions.last10;
  const aiMove =
    activeMode === "random"
      ? randomMove
      : counterMove(selectedPrediction.predicted);
  const outcome = outcomeFor(playerMove, aiMove);
  const last10Outcome = outcomeFor(
    playerMove,
    counterMove(predictions.last10.predicted)
  );
  const persistOutcome = outcomeFor(
    playerMove,
    counterMove(predictions.persist.predicted)
  );
  const randomOutcome = outcomeFor(playerMove, randomMove);

  state.playerHistory.push(playerMove);
  if (state.playerHistory.length > MAX_HISTORY * 4) {
    state.playerHistory = state.playerHistory.slice(-MAX_HISTORY * 4);
  }

  state.persistHistory.push(playerMove);
  if (state.persistHistory.length > MAX_PERSIST_HISTORY) {
    state.persistHistory = state.persistHistory.slice(-MAX_PERSIST_HISTORY);
  }

  state.outcomeHistoryByMode.last10.push(last10Outcome);
  if (state.outcomeHistoryByMode.last10.length > MAX_OUTCOME_HISTORY) {
    state.outcomeHistoryByMode.last10 =
      state.outcomeHistoryByMode.last10.slice(-MAX_OUTCOME_HISTORY);
  }
  state.outcomeHistoryByMode.persist.push(persistOutcome);
  if (state.outcomeHistoryByMode.persist.length > MAX_OUTCOME_HISTORY) {
    state.outcomeHistoryByMode.persist =
      state.outcomeHistoryByMode.persist.slice(-MAX_OUTCOME_HISTORY);
  }
  state.outcomeHistoryByMode.random.push(randomOutcome);
  if (state.outcomeHistoryByMode.random.length > MAX_OUTCOME_HISTORY) {
    state.outcomeHistoryByMode.random =
      state.outcomeHistoryByMode.random.slice(-MAX_OUTCOME_HISTORY);
  }

  state.statsByMode.last10.rounds += 1;
  if (last10Outcome === "Win") state.statsByMode.last10.wins += 1;
  if (last10Outcome === "Loss") state.statsByMode.last10.losses += 1;
  if (last10Outcome === "Draw") state.statsByMode.last10.draws += 1;

  state.statsByMode.persist.rounds += 1;
  if (persistOutcome === "Win") state.statsByMode.persist.wins += 1;
  if (persistOutcome === "Loss") state.statsByMode.persist.losses += 1;
  if (persistOutcome === "Draw") state.statsByMode.persist.draws += 1;

  state.statsByMode.random.rounds += 1;
  if (randomOutcome === "Win") state.statsByMode.random.wins += 1;
  if (randomOutcome === "Loss") state.statsByMode.random.losses += 1;
  if (randomOutcome === "Draw") state.statsByMode.random.draws += 1;

  saveState(state);

  elements.playerMove.textContent = formatMove(playerMove);
  elements.aiMove.textContent = formatMove(aiMove);
  elements.outcome.textContent = outcome;

  updateScoreboard();
  renderHistory(state.playerHistory);
  renderGraph(state.outcomeHistoryByMode[activeMode]);
  const lastMoveLast10 =
    state.playerHistory[state.playerHistory.length - 1] || null;
  const lastMovePersist =
    state.persistHistory[state.persistHistory.length - 1] || null;
  updateForecast(predictions, lastMoveLast10, lastMovePersist, randomMove);
}

function resetGame() {
  state = {
    ...defaultState,
    persistHistory: [],
    outcomeHistoryByMode: {
      last10: [],
      persist: [],
      random: [],
    },
    statsByMode: {
      last10: { ...defaultState.statsByMode.last10 },
      persist: { ...defaultState.statsByMode.persist },
      random: { ...defaultState.statsByMode.random },
    },
  };
  saveState(state);
  elements.playerMove.textContent = "—";
  elements.aiMove.textContent = "—";
  elements.outcome.textContent = "—";
  elements.forecastLast10Last.textContent = "—";
  elements.forecastLast10Next.textContent = "—";
  elements.forecastLast10Ai.textContent = "—";
  elements.forecastPersistLast.textContent = "—";
  elements.forecastPersistNext.textContent = "—";
  elements.forecastPersistAi.textContent = "—";
  elements.forecastRandomLast.textContent = "—";
  elements.forecastRandomNext.textContent = "—";
  elements.forecastRandomAi.textContent = "—";
  elements.hint.textContent = "Play a few rounds to train the model.";
  updateScoreboard();
  renderHistory(state.playerHistory);
  renderGraph(state.outcomeHistoryByMode[activeMode]);
  renderTransitions(buildTransitions([]));
  elements.mathBox.textContent = "";
}

function bindEvents() {
  document.querySelectorAll(".move").forEach((button) => {
    button.addEventListener("click", () => {
      handleMove(button.dataset.move);
    });
  });

  elements.reset.addEventListener("click", resetGame);
  elements.forecastToggle.addEventListener("click", () => {
    const isHidden = elements.forecast.classList.toggle("is-hidden");
    elements.forecastToggle.textContent = isHidden
      ? "Show AI forecast"
      : "Hide AI forecast";
  });
  elements.aiModeToggle.addEventListener("click", () => {
    if (activeMode === "last10") {
      activeMode = "persist";
    } else if (activeMode === "persist") {
      activeMode = "random";
    } else {
      activeMode = "last10";
    }
    elements.aiModeToggle.textContent =
      activeMode === "persist"
        ? "AI mode: Persistent"
        : activeMode === "random"
          ? "AI mode: Random"
          : "AI mode: Last 10";
    const predictions = currentPredictions();
    const lastMoveLast10 =
      state.playerHistory[state.playerHistory.length - 1] || null;
    const lastMovePersist =
      state.persistHistory[state.persistHistory.length - 1] || null;
    updateForecast(
      predictions,
      lastMoveLast10,
      lastMovePersist,
      state.lastRandomMove
    );
    updateScoreboard();
    renderGraph(state.outcomeHistoryByMode[activeMode]);
  });
}

function init() {
  updateScoreboard();
  renderHistory(state.playerHistory);
  const predictions = currentPredictions();
  const lastMoveLast10 =
    state.playerHistory[state.playerHistory.length - 1] || null;
  const lastMovePersist =
    state.persistHistory[state.persistHistory.length - 1] || null;
  updateForecast(
    predictions,
    lastMoveLast10,
    lastMovePersist,
    state.lastRandomMove
  );
  renderGraph(state.outcomeHistoryByMode[activeMode]);
  bindEvents();
}

init();
