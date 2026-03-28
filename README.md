# Markov-chain-RPS

## Markov chain
In probability theory and statistics, a Markov chain or Markov process is a stochastic process describing a sequence of possible events in which the probability of each event depends only on the state attained in the previous event. Informally, this may be thought of as, "What happens next depends only on the state of affairs now." A countably infinite sequence, in which the chain moves state at discrete time steps, gives a discrete-time Markov chain (DTMC). A continuous-time process is called a continuous-time Markov chain (CTMC). Markov processes are named in honor of the Russian mathematician Andrey Markov.
https://en.wikipedia.org/wiki/Markov_chain

https://bluemoon012905.github.io/Markov-chain-RPS/

## Project
A tiny, browser-based Rock Paper Scissors game that uses a simple Markov chain to predict your next move based on your last 10 moves. All data is stored locally in your browser via `localStorage`.

## How it works
- The game keeps a sliding window of your last 10 moves.
- It builds transition counts (e.g., Rock -> Paper) inside that window.
- Given your most recent move, it predicts your next move using those counts.
- The AI then plays the counter move.
- If there is not enough data, it falls back to a weighted guess based on the window frequency.

## Run it
Open `index.html` in a browser.

## Files
- `index.html` - UI and layout
- `style.css` - styles
- `app.js` - Markov logic, game state, and local storage

## Local storage
The game stores your move history and stats in `localStorage` so it persists between reloads on the same browser.

## Reset
Use the Reset button in the UI to clear local data.
