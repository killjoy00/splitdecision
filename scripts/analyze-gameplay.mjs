import {
  CURRENT_CASE_CARD_IDS,
  GAME_DATA,
  simulateBotGames,
  simulateMatchup,
} from '../dist/engine/index.js';

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function positiveInteger(flag, fallback) {
  const value = Number.parseInt(valueAfter(flag, String(fallback)), 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer`);
  return value;
}

function controllers(level) {
  return { P1: level, D1: level, P2: level, D2: level };
}

const profileGames = positiveInteger('--profile-games', 300);
const matchupGames = positiveInteger('--matchup-games', 300);
const hardGames = positiveInteger('--hard-games', 80);
const seed = valueAfter('--seed', 'gameplay-analysis-v1');
const currentCards = GAME_DATA.caseCards.filter((card) => CURRENT_CASE_CARD_IDS.includes(card.id));
const fixedCards = currentCards.filter((card) => card.form === 'dual_issue');
const flexibleCards = currentCards.filter((card) => card.form === 'focus');

const report = {
  seed,
  samples: { profileGames, matchupGames, hardGames },
  deck: {
    cards: currentCards.length,
    fixedActionCards: fixedCards.length,
    flexibleActionCards: flexibleCards.length,
    leadCards: currentCards.filter((card) => card.action === 'lead').length,
    coCounselCards: currentCards.filter((card) => card.action === 'co_counsel').length,
    citationCards: currentCards.filter((card) => card.action === 'citation').length,
    secondChairCards: currentCards.filter((card) => card.action === 'second_chair').length,
    specialtiesInData: GAME_DATA.specialties.length,
  },
  profiles: {
    easy: simulateBotGames(profileGames, controllers('easy'), `${seed}:all-easy`),
    medium: simulateBotGames(profileGames, controllers('medium'), `${seed}:all-medium`),
    hard: simulateBotGames(hardGames, controllers('hard'), `${seed}:all-hard`),
  },
  matchups: {
    mediumVsEasy: simulateMatchup(matchupGames, 'medium', 'easy', `${seed}:medium-vs-easy`),
    hardVsMedium: simulateMatchup(hardGames, 'hard', 'medium', `${seed}:hard-vs-medium`),
    hardVsEasy: simulateMatchup(hardGames, 'hard', 'easy', `${seed}:hard-vs-easy`),
  },
};

console.log(JSON.stringify(report, null, 2));
