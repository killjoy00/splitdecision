import { simulateGames } from '../dist/engine/index.js';

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const games = Number.parseInt(valueAfter('--games', '1000'), 10);
const seed = valueAfter('--seed', 'split-decision');
const summary = simulateGames(games, seed);

console.log(JSON.stringify(summary, null, 2));
