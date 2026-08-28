import { useEffect, useMemo, useState } from 'react';
import {
  GAME_DATA,
  ISSUE_IDS,
  SEAT_ORDER,
  SIDE_IDS,
  SLOTS,
  applyAction,
  assertGameInvariants,
  chooseEasyAction,
  createGame,
  createRandom,
  getLegalActions,
  getPendingActors,
  getPlayerView,
  type DocketCardState,
  type GameAction,
  type GameState,
  type HearingResult,
  type IssueId,
  type SeatId,
  type SideId,
  type Slot,
} from '../engine/index.js';

type Controller = 'human' | 'easy';

interface SeatProfile {
  name: string;
  controller: Controller;
}

type SeatProfiles = Record<SeatId, SeatProfile>;

interface SavedSession {
  version: 1;
  game: GameState;
  profiles: SeatProfiles;
}

const STORAGE_KEY = 'split-decision/session-v1';
const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));
const ISSUE_BY_ID = new Map(GAME_DATA.issues.map((issue) => [issue.id, issue]));

const SIDE_LABEL: Record<SideId, string> = {
  plaintiff: 'Plaintiff',
  defense: 'Defense',
};

const SEAT_META: Record<SeatId, { side: SideId }> = {
  P1: { side: 'plaintiff' },
  P2: { side: 'plaintiff' },
  D1: { side: 'defense' },
  D2: { side: 'defense' },
};

function defaultProfiles(): SeatProfiles {
  return {
    P1: { name: 'Plaintiff Firm One', controller: 'human' },
    P2: { name: 'Plaintiff Firm Two', controller: 'human' },
    D1: { name: 'Defense Firm One', controller: 'human' },
    D2: { name: 'Defense Firm Two', controller: 'human' },
  };
}

function makeSeed(): string {
  return `case-${Date.now().toString(36)}`;
}

function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed.version !== 1 || parsed.game.schemaVersion !== GAME_DATA.schemaVersion) return null;
    assertGameInvariants(parsed.game);
    return parsed;
  } catch {
    return null;
  }
}

function issueName(issueId: IssueId): string {
  return ISSUE_BY_ID.get(issueId)?.name ?? issueId;
}

function seatName(profiles: SeatProfiles, seat: SeatId): string {
  return profiles[seat].name.trim() || seat;
}

function phaseName(game: GameState): string {
  switch (game.phase) {
    case 'round_split_commit':
      return 'Divide the Docket';
    case 'round_choose_commit':
      return 'Choose a Brief';
    case 'round_argue':
      return 'Argue the Case';
    case 'closing_scoring':
      return 'Closing Arguments';
    case 'complete':
      return 'Final Verdict';
  }
}

function actorInstruction(game: GameState): string {
  switch (game.phase) {
    case 'round_split_commit':
      return 'You will secretly divide the six Case cards into two briefs of three.';
    case 'round_choose_commit':
      return 'You will privately choose one of the two briefs. Your partner receives the other.';
    case 'round_argue':
      return 'You will play one assigned Case card and choose how to use it.';
    default:
      return 'Review the case and continue.';
  }
}

function describeTransition(previous: GameState, next: GameState, actor: SeatId): string {
  if (next.phase === 'complete' && next.verdict) {
    return 'Closing Arguments are complete. The court has reached its verdict.';
  }
  const newResults = next.hearingResults.slice(previous.hearingResults.length);
  if (newResults.length > 0) {
    return newResults
      .map((result) => `${issueName(result.issueId)}: ${result.winningSide ? `${SIDE_LABEL[result.winningSide]} wins` : 'unresolved'}`)
      .join(' · ');
  }
  if (next.round !== previous.round) return `Round ${previous.round} is complete. Round ${next.round} begins.`;
  return `${actor} locked in a decision.`;
}

export function App() {
  const [restored] = useState<SavedSession | null>(() => loadSession());
  const [game, setGame] = useState<GameState | null>(() => restored?.game ?? null);
  const [profiles, setProfiles] = useState<SeatProfiles>(() => restored?.profiles ?? defaultProfiles());
  const [setupSeed, setSetupSeed] = useState(makeSeed);
  const [unlocked, setUnlocked] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [turnNotice, setTurnNotice] = useState<string | null>(
    restored ? 'Saved case restored on this device.' : null,
  );

  const pendingActor = useMemo(
    () => game ? getPendingActors(game)[0] ?? null : null,
    [game],
  );
  const isBotTurn = pendingActor !== null && game?.players[pendingActor].controller === 'easy';
  const playerView = useMemo(
    () => game && pendingActor && unlocked ? getPlayerView(game, pendingActor) : null,
    [game, pendingActor, unlocked],
  );

  useEffect(() => {
    if (!game) return;
    const session: SavedSession = { version: 1, game, profiles };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [game, profiles]);

  useEffect(() => {
    setSelectedSlots([]);
    setError(null);
  }, [pendingActor, game?.phase, game?.round]);

  useEffect(() => {
    if (!game || !pendingActor || !isBotTurn || game.phase === 'complete') return;
    const timer = window.setTimeout(() => {
      const random = createRandom(`${game.seed}:browser-bot:${game.actionHistory.length}`);
      try {
        const action = chooseEasyAction(game, pendingActor, random);
        const result = applyAction(game, action);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setTurnNotice(describeTransition(game, result.state, pendingActor));
        setGame(result.state);
        setUnlocked(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [game, isBotTurn, pendingActor]);

  function startGame() {
    const seed = setupSeed.trim() || makeSeed();
    const controllers = Object.fromEntries(
      SEAT_ORDER.map((seat) => [seat, profiles[seat].controller]),
    ) as Record<SeatId, Controller>;
    const next = createGame({ seed, controllers });
    setGame(next);
    setUnlocked(false);
    setError(null);
    setTurnNotice('The case is ready. Pass the device to the first Divider.');
  }

  function updateProfile(seat: SeatId, update: Partial<SeatProfile>) {
    setProfiles((current) => ({
      ...current,
      [seat]: { ...current[seat], ...update },
    }));
  }

  function submitAction(action: GameAction) {
    if (!game) return;
    const result = applyAction(game, action);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTurnNotice(describeTransition(game, result.state, action.actor));
    setGame(result.state);
    setUnlocked(false);
    setSelectedSlots([]);
    setError(null);
  }

  function returnToSetup() {
    if (game?.phase !== 'complete'
        && !window.confirm('Start a new case? The current saved game will be replaced.')) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setGame(null);
    setSetupSeed(makeSeed());
    setUnlocked(false);
    setSelectedSlots([]);
    setError(null);
    setTurnNotice(null);
  }

  if (!game) {
    return (
      <SetupScreen
        profiles={profiles}
        seed={setupSeed}
        onSeedChange={setSetupSeed}
        onProfileChange={updateProfile}
        onStart={startGame}
      />
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">Four firms · Two sides · One winner</p>
          <h1>Split Decision</h1>
        </div>
        <div className="header-actions">
          <span className="save-status">Saved on this device</span>
          <button className="button button-quiet" type="button" onClick={returnToSetup}>New case</button>
        </div>
      </header>

      <section className="case-strip" aria-label="Current case status">
        <div><span>Round</span><strong>{game.round} / {game.rules.rounds}</strong></div>
        <div><span>Phase</span><strong>{phaseName(game)}</strong></div>
        <div><span>Court’s Favor</span><strong>{SIDE_LABEL[game.courtFavor]}</strong></div>
        <div><span>Docket arguments</span><strong>{game.actionsResolvedThisRound} / 12</strong></div>
      </section>

      {game.phase === 'complete' && game.verdict ? (
        <VerdictPanel game={game} profiles={profiles} onNewCase={returnToSetup} />
      ) : isBotTurn && pendingActor ? (
        <BotTurnPanel actor={pendingActor} profiles={profiles} error={error} />
      ) : !unlocked && pendingActor ? (
        <HandoffPanel
          actor={pendingActor}
          game={game}
          profiles={profiles}
          notice={turnNotice}
          onUnlock={() => {
            setTurnNotice(null);
            setUnlocked(true);
          }}
        />
      ) : pendingActor && playerView ? (
        <TurnPanel
          actor={pendingActor}
          game={game}
          profiles={profiles}
          playerView={playerView}
          selectedSlots={selectedSlots}
          error={error}
          onSelectedSlotsChange={setSelectedSlots}
          onSubmit={submitAction}
          onHide={() => setUnlocked(false)}
        />
      ) : null}

      <Scoreboard game={game} profiles={profiles} activeSeat={pendingActor} />
      <IssueBoard game={game} profiles={profiles} />
      <DocketBoard game={game} profiles={profiles} />
      <RecentResults results={game.hearingResults} profiles={profiles} />
      <RulesGuide />
    </main>
  );
}

function SetupScreen({
  profiles,
  seed,
  onSeedChange,
  onProfileChange,
  onStart,
}: {
  profiles: SeatProfiles;
  seed: string;
  onSeedChange: (seed: string) => void;
  onProfileChange: (seat: SeatId, update: Partial<SeatProfile>) => void;
  onStart: () => void;
}) {
  return (
    <main className="setup-shell">
      <section className="setup-hero">
        <div className="hero-copy">
          <p className="eyebrow">A pass-and-play strategy game</p>
          <h1>Split Decision</h1>
          <p className="hero-lede">
            Win the case together. Take the credit alone. Four law firms divide shared evidence,
            build six arguments, and discover which partnership survives the final verdict.
          </p>
          <div className="hero-pills" aria-label="Game details">
            <span>Exactly 4 seats</span><span>Pass &amp; play</span><span>6 rounds</span><span>Local save</span>
          </div>
        </div>
        <aside className="how-it-feels">
          <p className="section-label">The tension</p>
          <ol>
            <li><span>01</span>Help your side win each Hearing.</li>
            <li><span>02</span>Keep enough credit for your own firm.</li>
            <li><span>03</span>Prepare for one secret Closing Argument.</li>
          </ol>
        </aside>
      </section>

      <form className="setup-card" onSubmit={(event) => { event.preventDefault(); onStart(); }}>
        <div className="setup-heading">
          <div><p className="section-label">Seat the firms</p><h2>Open a new case</h2></div>
          <label className="seed-field">Case seed<input value={seed} onChange={(event) => onSeedChange(event.target.value)} /></label>
        </div>

        <div className="seat-setup-grid">
          {SIDE_IDS.map((side) => (
            <fieldset className={`side-setup side-${side}`} key={side}>
              <legend>{SIDE_LABEL[side]}</legend>
              {SEAT_ORDER.filter((seat) => SEAT_META[seat].side === side).map((seat) => (
                <div className="seat-setup-row" key={seat}>
                  <span className={`seat-chip seat-${seat.toLowerCase()}`}>{seat}</span>
                  <label>
                    Firm name
                    <input value={profiles[seat].name} onChange={(event) => onProfileChange(seat, { name: event.target.value })} maxLength={36} />
                  </label>
                  <label>
                    Player
                    <select value={profiles[seat].controller} onChange={(event) => onProfileChange(seat, { controller: event.target.value as Controller })}>
                      <option value="human">Human</option>
                      <option value="easy">Easy bot</option>
                    </select>
                  </label>
                </div>
              ))}
            </fieldset>
          ))}
        </div>

        <div className="setup-footer">
          <p>Private choices use a handoff screen. The game automatically saves after every action.</p>
          <button className="button button-primary button-large" type="submit">Call the case</button>
        </div>
      </form>
    </main>
  );
}

function HandoffPanel({ actor, game, profiles, notice, onUnlock }: {
  actor: SeatId;
  game: GameState;
  profiles: SeatProfiles;
  notice: string | null;
  onUnlock: () => void;
}) {
  return (
    <section className="handoff-panel" aria-labelledby="handoff-title">
      {notice && <p className="turn-notice" role="status">{notice}</p>}
      <div className={`handoff-seal side-${SEAT_META[actor].side}`}>{actor}</div>
      <p className="section-label">Private turn</p>
      <h2 id="handoff-title">Pass the device to {seatName(profiles, actor)}</h2>
      <p>{actorInstruction(game)}</p>
      <button className="button button-primary button-large" type="button" onClick={onUnlock}>I am {seatName(profiles, actor)}</button>
      <small>Other players should look away before continuing.</small>
    </section>
  );
}

function BotTurnPanel({ actor, profiles, error }: { actor: SeatId; profiles: SeatProfiles; error: string | null }) {
  return (
    <section className="handoff-panel bot-panel" aria-live="polite">
      <div className={`handoff-seal side-${SEAT_META[actor].side}`}>AI</div>
      <p className="section-label">Easy bot</p>
      <h2>{seatName(profiles, actor)} is reviewing the Docket</h2>
      <p>{error ?? 'Selecting one legal action…'}</p>
      <div className="thinking-dots" aria-hidden="true"><span /><span /><span /></div>
    </section>
  );
}

function TurnPanel({ actor, game, profiles, playerView, selectedSlots, error, onSelectedSlotsChange, onSubmit, onHide }: {
  actor: SeatId;
  game: GameState;
  profiles: SeatProfiles;
  playerView: ReturnType<typeof getPlayerView>;
  selectedSlots: Slot[];
  error: string | null;
  onSelectedSlotsChange: (slots: Slot[]) => void;
  onSubmit: (action: GameAction) => void;
  onHide: () => void;
}) {
  const secretIssue = playerView.players[actor].closingArgumentIssue;
  return (
    <section className="turn-panel" aria-labelledby="turn-title">
      <div className="turn-heading">
        <div><p className="section-label">{actor} · {SIDE_LABEL[SEAT_META[actor].side]}</p><h2 id="turn-title">{seatName(profiles, actor)} — {phaseName(game)}</h2></div>
        <button className="button button-quiet" type="button" onClick={onHide}>Hide my turn</button>
      </div>

      <div className="secret-reminder">
        <span>Your secret Closing Argument</span>
        <strong>{secretIssue ? issueName(secretIssue) : 'Revealed'}</strong>
        <small>This Issue scores again after Round 6.</small>
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}
      {game.phase === 'round_split_commit' && (
        <SplitControls actor={actor} game={game} selectedSlots={selectedSlots} onSelectedSlotsChange={onSelectedSlotsChange} onSubmit={onSubmit} />
      )}
      {game.phase === 'round_choose_commit' && <BriefChoiceControls actor={actor} game={game} onSubmit={onSubmit} />}
      {game.phase === 'round_argue' && <ArgumentControls actor={actor} game={game} onSubmit={onSubmit} />}
    </section>
  );
}

function SplitControls({ actor, game, selectedSlots, onSelectedSlotsChange, onSubmit }: {
  actor: SeatId;
  game: GameState;
  selectedSlots: Slot[];
  onSelectedSlotsChange: (slots: Slot[]) => void;
  onSubmit: (action: GameAction) => void;
}) {
  const remaining = SLOTS.filter((slot) => !selectedSlots.includes(slot));

  function toggleSlot(slot: Slot) {
    if (selectedSlots.includes(slot)) {
      onSelectedSlotsChange(selectedSlots.filter((selected) => selected !== slot));
    } else if (selectedSlots.length < 3) {
      onSelectedSlotsChange([...selectedSlots, slot].sort((left, right) => left - right));
    }
  }

  return (
    <div className="decision-area">
      <div className="decision-copy"><p className="section-label">Divider decision</p><h3>Select three cards for one brief</h3><p>The other three form the second brief. Your partner will choose which brief to keep.</p></div>
      <div className="split-grid">
        {game.docket.map((docket) => (
          <DocketChoiceCard key={docket.slot} docket={docket} selected={selectedSlots.includes(docket.slot)} onClick={() => toggleSlot(docket.slot)} />
        ))}
      </div>
      <div className="brief-preview-grid">
        <BriefPreview title="Brief containing slot 1" slots={selectedSlots.includes(1) ? selectedSlots : remaining} />
        <BriefPreview title="Other brief" slots={selectedSlots.includes(1) ? remaining : selectedSlots} />
      </div>
      <div className="decision-footer">
        <span>{selectedSlots.length} of 3 cards selected</span>
        <button className="button button-primary" type="button" disabled={selectedSlots.length !== 3} onClick={() => onSubmit({ type: 'commit_split', actor, groups: [selectedSlots, remaining] })}>Lock the split</button>
      </div>
    </div>
  );
}

function BriefChoiceControls({ actor, game, onSubmit }: {
  actor: SeatId;
  game: GameState;
  onSubmit: (action: GameAction) => void;
}) {
  const side = SEAT_META[actor].side;
  const split = game.briefs[side].submittedSplit;
  if (!split) return null;
  return (
    <div className="decision-area">
      <div className="decision-copy"><p className="section-label">Chooser decision</p><h3>Choose your brief</h3><p>You will argue these three cards. Your Divider receives the brief you leave behind.</p></div>
      <div className="choose-brief-grid">
        {split.map((slots, index) => (
          <button className="brief-option" type="button" key={slots.join('-')} onClick={() => onSubmit({ type: 'choose_brief', actor, briefIndex: index as 0 | 1 })}>
            <span className="section-label">Brief {index === 0 ? 'A' : 'B'}</span>
            <BriefCardList slots={slots} docket={game.docket} />
            <strong>Choose this brief</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArgumentControls({ actor, game, onSubmit }: {
  actor: SeatId;
  game: GameState;
  onSubmit: (action: GameAction) => void;
}) {
  const side = SEAT_META[actor].side;
  const assignedSlots = game.briefs[side].assignments[actor] ?? [];
  const legalActions = getLegalActions(game, actor).filter(
    (action): action is Extract<GameAction, { type: 'play_docket_card' }> => action.type === 'play_docket_card',
  );
  return (
    <div className="decision-area">
      <div className="decision-copy"><p className="section-label">Argument {game.actionsResolvedThisRound + 1} of 12</p><h3>Play one Case card</h3><p>Pick an assigned card, then choose its eligible Issue or Lead/Co-Counsel action.</p></div>
      <div className="argument-grid">
        {assignedSlots.map((slot) => {
          const docket = game.docket.find((entry) => entry.slot === slot);
          const card = docket ? CARD_BY_ID.get(docket.cardId) : null;
          const actions = legalActions.filter((action) => action.slot === slot);
          if (!docket || !card) return null;
          return (
            <article className={`argument-card ${actions.length === 0 ? 'argument-card-used' : ''}`} key={slot}>
              <div className="case-card-heading"><span className="slot-number">{slot}</span><div><strong>{card.title}</strong><small>{card.rulesText}</small></div></div>
              {actions.length > 0 ? (
                <div className="action-options">
                  {actions.map((action) => {
                    const actionType = action.focusAction ?? card.action;
                    return (
                      <button className={`action-button action-${actionType}`} type="button" key={`${action.slot}-${action.chosenIssue}-${action.focusAction ?? card.action}`} onClick={() => onSubmit(action)}>
                        <span>{issueName(action.chosenIssue)}</span><strong>{actionType === 'lead' ? 'Lead' : 'Co-Counsel'}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : <p className="resolved-label">Resolved by {docket.usedBy[side]}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DocketChoiceCard({ docket, selected, onClick }: { docket: DocketCardState; selected: boolean; onClick: () => void }) {
  const card = CARD_BY_ID.get(docket.cardId);
  return (
    <button className={`docket-choice ${selected ? 'docket-choice-selected' : ''}`} type="button" onClick={onClick} aria-pressed={selected}>
      <span className="slot-number">{docket.slot}</span>
      <strong>{card?.title}</strong>
      <small>{card?.issues.map(issueName).join(' / ')}</small>
      <span className={`card-action card-action-${card?.action}`}>{card?.action === 'choose' ? 'Choose action' : card?.action.replace('_', '-')}</span>
      <span className="selection-mark">{selected ? 'Selected' : 'Select'}</span>
    </button>
  );
}

function BriefPreview({ title, slots }: { title: string; slots: readonly Slot[] }) {
  return <div className="brief-preview"><span>{title}</span><strong>{slots.length > 0 ? slots.join(' · ') : '—'}</strong></div>;
}

function BriefCardList({ slots, docket }: { slots: readonly Slot[]; docket: DocketCardState[] }) {
  return (
    <ul className="brief-card-list">
      {slots.map((slot) => {
        const docketCard = docket.find((entry) => entry.slot === slot);
        const card = docketCard ? CARD_BY_ID.get(docketCard.cardId) : null;
        return <li key={slot}><span>{slot}</span><strong>{card?.title ?? `Card ${slot}`}</strong></li>;
      })}
    </ul>
  );
}

function Scoreboard({ game, profiles, activeSeat }: { game: GameState; profiles: SeatProfiles; activeSeat: SeatId | null }) {
  return (
    <section className="board-section" aria-labelledby="score-title">
      <div className="section-heading"><div><p className="section-label">Reputation</p><h2 id="score-title">Counsel table</h2></div><p>The lower-scoring firm on each side determines which side wins the case.</p></div>
      <div className="scoreboard-grid">
        {SIDE_IDS.map((side) => {
          const seats = SEAT_ORDER.filter((seat) => SEAT_META[seat].side === side);
          return (
            <article className={`side-score side-${side}`} key={side}>
              <div className="side-score-heading"><strong>{SIDE_LABEL[side]}</strong><span>First Chair: {game.firstChairBySide[side]}</span></div>
              <div className="firm-score-grid">
                {seats.map((seat) => (
                  <div className={`firm-score ${activeSeat === seat ? 'firm-score-active' : ''}`} key={seat}>
                    <span className={`seat-chip seat-${seat.toLowerCase()}`}>{seat}</span>
                    <div><strong>{seatName(profiles, seat)}</strong><small>{game.players[seat].leadCredits.length} Lead Credits</small></div>
                    <b>{game.players[seat].reputation}</b>
                  </div>
                ))}
              </div>
              <div className="side-floor">Side floor <strong>{Math.min(...seats.map((seat) => game.players[seat].reputation))}</strong></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IssueBoard({ game, profiles }: { game: GameState; profiles: SeatProfiles }) {
  const currentHearings = game.hearingSchedule[game.round - 1] ?? [];
  return (
    <section className="board-section" aria-labelledby="issues-title">
      <div className="section-heading"><div><p className="section-label">The board</p><h2 id="issues-title">Six Issues</h2></div><p>Joint Work contributes to the side total, but only personal markers determine the Lead Firm.</p></div>
      <div className="issue-grid">
        {ISSUE_IDS.map((issueId) => {
          const issue = game.issues[issueId];
          const isCurrent = currentHearings.includes(issueId);
          const isClosing = game.closingRevealed.includes(issueId);
          const plaintiffTotal = issue.firmMarkers.P1 + issue.firmMarkers.P2 + issue.jointWork.plaintiff;
          const defenseTotal = issue.firmMarkers.D1 + issue.firmMarkers.D2 + issue.jointWork.defense;
          return (
            <article className={`issue-card ${isCurrent ? 'issue-current' : ''}`} key={issueId}>
              <div className="issue-heading">
                <div><span>{ISSUE_BY_ID.get(issueId)?.abbr}</span><strong>{issueName(issueId)}</strong></div>
                <div className="issue-flags">{isCurrent && <span>Hearing</span>}{isClosing && <span>Closing</span>}</div>
              </div>
              <div className="issue-side-row side-plaintiff"><strong>{plaintiffTotal}</strong><div><span>P1 {issue.firmMarkers.P1}</span><span>P2 {issue.firmMarkers.P2}</span><span>Joint {issue.jointWork.plaintiff}</span></div></div>
              <div className="issue-side-row side-defense"><strong>{defenseTotal}</strong><div><span>D1 {issue.firmMarkers.D1}</span><span>D2 {issue.firmMarkers.D2}</span><span>Joint {issue.jointWork.defense}</span></div></div>
              <footer><span>{issue.normalHearingsResolved} / 2 Hearings resolved</span><span title={`${seatName(profiles, 'P1')} / ${seatName(profiles, 'D1')} / ${seatName(profiles, 'P2')} / ${seatName(profiles, 'D2')}`}>Firm order P1 · D1 · P2 · D2</span></footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DocketBoard({ game, profiles }: { game: GameState; profiles: SeatProfiles }) {
  return (
    <section className="board-section" aria-labelledby="docket-title">
      <div className="section-heading"><div><p className="section-label">Round {game.round}</p><h2 id="docket-title">Shared Docket</h2></div><p>Every card is argued once by Plaintiff and once by Defense.</p></div>
      <div className="public-docket-grid">
        {game.docket.map((docket) => {
          const card = CARD_BY_ID.get(docket.cardId);
          return (
            <article className="public-case-card" key={docket.slot}>
              <div className="case-card-heading"><span className="slot-number">{docket.slot}</span><div><strong>{card?.title}</strong><small>{card?.issues.map(issueName).join(' / ')}</small></div></div>
              <p>{card?.rulesText}</p>
              <div className="usage-row">
                {SIDE_IDS.map((side) => {
                  const usedBy = docket.usedBy[side];
                  return <span className={`usage-pill side-${side} ${usedBy ? 'usage-complete' : ''}`} key={side}>{SIDE_LABEL[side]}: {usedBy ? seatName(profiles, usedBy) : 'available'}</span>;
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RecentResults({ results, profiles }: { results: HearingResult[]; profiles: SeatProfiles }) {
  const recent = results.map((result, index) => ({ result, index })).slice(-6).reverse();
  return (
    <section className="board-section" aria-labelledby="results-title">
      <div className="section-heading"><div><p className="section-label">Court record</p><h2 id="results-title">Recent decisions</h2></div><p>Normal Hearings award 3/2 Reputation; Closing Arguments award 2/1.</p></div>
      {recent.length === 0 ? <div className="empty-state">No Issues have scored yet.</div> : (
        <div className="result-list">
          {recent.map(({ result, index }) => {
            const hearingNumber = results.slice(0, index + 1).filter((entry) => entry.source === 'hearing').length;
            const scoringRound = Math.ceil(hearingNumber / 2);
            return (
            <article className="result-row" key={`${result.source}-${index}-${result.issueId}`}>
              <span className="result-source">{result.source === 'closing' ? 'Closing' : `Round ${scoringRound}`}</span>
              <strong>{issueName(result.issueId)}</strong>
              <span>{result.winningSide ? SIDE_LABEL[result.winningSide] : 'Unresolved'}</span>
              <span>{result.leadFirm ? `${seatName(profiles, result.leadFirm)} leads` : 'No award'}</span>
              <span>{Object.entries(result.pointsAwarded).map(([seat, points]) => `${seat} +${points}`).join(' · ') || '0 points'}</span>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VerdictPanel({ game, profiles, onNewCase }: { game: GameState; profiles: SeatProfiles; onNewCase: () => void }) {
  const verdict = game.verdict;
  if (!verdict) return null;
  return (
    <section className={`verdict-panel side-${verdict.winningSide}`} aria-labelledby="verdict-title">
      <p className="section-label">The court has ruled</p>
      <h2 id="verdict-title">{seatName(profiles, verdict.winningFirm)} wins Split Decision</h2>
      <p>{SIDE_LABEL[verdict.winningSide]} wins the case with a side floor of {verdict.sideFloor[verdict.winningSide]}.</p>
      <div className="verdict-scores">
        {SEAT_ORDER.map((seat) => <div className={seat === verdict.winningFirm ? 'verdict-winner' : ''} key={seat}><span>{seat} · {seatName(profiles, seat)}</span><strong>{game.players[seat].reputation}</strong></div>)}
      </div>
      <div className="closing-list"><span>Closing Arguments</span>{game.closingRevealed.map((issue) => <strong key={issue}>{issueName(issue)}</strong>)}</div>
      <p className="verdict-detail">Side tiebreak: {verdict.sideTieBreaker.replaceAll('_', ' ')} · Firm tiebreak: {verdict.firmTieBreaker.replaceAll('_', ' ')}</p>
      <button className="button button-primary button-large" type="button" onClick={onNewCase}>Open another case</button>
    </section>
  );
}

function RulesGuide() {
  return (
    <details className="rules-guide">
      <summary>Quick rules reference</summary>
      <div className="rules-grid">
        <div><span>1</span><strong>Divide</strong><p>Each side’s Divider secretly splits the six cards into two briefs of three.</p></div>
        <div><span>2</span><strong>Choose</strong><p>Each Chooser takes one brief. The Divider receives the other.</p></div>
        <div><span>3</span><strong>Argue</strong><p>Lead adds 3 own markers. Co-Counsel adds 2 own, 1 partner, and 1 Joint Work.</p></div>
        <div><span>4</span><strong>Score</strong><p>Two scheduled Issues score each round. Lead earns 3 and a participating ally earns 2.</p></div>
        <div><span>5</span><strong>Close</strong><p>Four secret Closing Argument Issues score again after Round 6 for 2/1.</p></div>
        <div><span>6</span><strong>Verdict</strong><p>Compare each side’s lower firm score. The higher floor wins; its higher firm wins the game.</p></div>
      </div>
    </details>
  );
}
