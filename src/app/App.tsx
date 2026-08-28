import { useMemo, useState } from 'react';
import { createGame, enumerateThreeThreeSplits, getSideFloor } from '../engine/index.js';

export function App() {
  const [seed, setSeed] = useState('first-chair');
  const game = useMemo(() => createGame({ seed }), [seed]);
  const splits = enumerateThreeThreeSplits();

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Four firms. Two sides. One winner.</p>
        <h1>Split Decision</h1>
        <p className="lede">
          A deterministic browser playtest for co-counsel, divided credit, and one decisive verdict.
        </p>
      </header>

      <section className="panel setup-panel" aria-labelledby="setup-title">
        <div>
          <p className="section-label">Milestone 0</p>
          <h2 id="setup-title">Rules-engine scaffold</h2>
          <p>
            The first build prioritizes reproducible setup, legal 3/3 splits, scoring, replayable actions,
            and automated simulations before visual polish.
          </p>
        </div>
        <label>
          Seed
          <input value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
      </section>

      <section className="summary-grid" aria-label="Generated game summary">
        <article className="panel metric">
          <span>Round</span>
          <strong>{game.round} / {game.rules.rounds}</strong>
        </article>
        <article className="panel metric">
          <span>Opening docket</span>
          <strong>{game.docket.map((card) => card.cardId).join(' · ')}</strong>
        </article>
        <article className="panel metric">
          <span>Legal 3/3 splits</span>
          <strong>{splits.length}</strong>
        </article>
        <article className="panel metric">
          <span>Current floors</span>
          <strong>
            P {getSideFloor(game, 'plaintiff')} · D {getSideFloor(game, 'defense')}
          </strong>
        </article>
      </section>

      <section className="panel schedule" aria-labelledby="schedule-title">
        <div>
          <p className="section-label">Public schedule</p>
          <h2 id="schedule-title">Hearings</h2>
        </div>
        <ol>
          {game.hearingSchedule.map((pair, index) => (
            <li key={index}>
              <span>Round {index + 1}</span>
              <strong>{pair.join(' / ')}</strong>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
