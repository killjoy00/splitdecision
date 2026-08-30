import { useEffect, useMemo, useState } from 'react';
import {
  GAME_DATA,
  ISSUE_IDS,
  SEAT_ORDER,
  SIDE_IDS,
  SLOTS,
  applyAction,
  assertGameInvariants,
  chooseBotAction,
  createGame,
  createRandom,
  getLegalActions,
  getPendingActors,
  getPlayerView,
  hashPublicGameState,
  type DocketCardState,
  type AutomatedBotLevel,
  type BotLevel,
  type GameAction,
  type GameState,
  type HearingResult,
  type IssueId,
  type SeatId,
  type SideId,
  type Slot,
  SPECIALTY_BY_ID,
} from '../engine/index.js';
import type { PlayerView } from '../engine/visibility.js';
import type {
  RemoteApiResult,
  RemoteLobby,
  RemotePlayerSnapshot,
  RemoteSession,
} from '../remote/protocol.js';
import { REMOTE_PROTOCOL_VERSION } from '../remote/protocol.js';

type Controller = BotLevel;

interface SeatProfile {
  name: string;
  controller: Controller;
}

type SeatProfiles = Record<SeatId, SeatProfile>;
type DisplayGame = GameState | PlayerView;

interface SavedSession {
  version: 2;
  game: GameState;
  profiles: SeatProfiles;
}

type BotSpeed = 'step' | 'normal' | 'instant';

const STORAGE_KEY = 'split-decision/session-v2';
const REMOTE_SESSIONS_KEY = 'split-decision/remote-sessions-v1';
const IS_LOCAL_BROWSER = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';
const REMOTE_API_URL = (
  import.meta.env.VITE_REMOTE_API_URL
  || (IS_LOCAL_BROWSER ? 'http://localhost:8787' : 'https://splitdecision-api.planitnow.us')
).replace(/\/$/, '');
const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));
const ISSUE_BY_ID = new Map(GAME_DATA.issues.map((issue) => [issue.id, issue]));

function recoverySessionFromHash(): RemoteSession | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('room')?.toUpperCase() ?? '';
  const seat = params.get('seat');
  const token = params.get('token') ?? '';
  return /^[A-Z2-9]{6}$/.test(code)
      && SEAT_ORDER.includes(seat as SeatId)
      && token.length >= 20
    ? { code, seat: seat as SeatId, token }
    : null;
}

const URL_RECOVERY_SESSION = recoverySessionFromHash();

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
    if (parsed.version !== 2 || parsed.game.schemaVersion !== GAME_DATA.schemaVersion) return null;
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

function phaseName(game: DisplayGame): string {
  switch (game.phase) {
    case 'setup_specialty_choice':
      return 'Choose a Specialty';
    case 'specialty_power_window':
      return 'Specialty Window';
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

function actorInstruction(game: DisplayGame): string {
  switch (game.phase) {
    case 'setup_specialty_choice':
      return 'You will secretly choose one of two Specialties for your firm.';
    case 'specialty_power_window':
      return 'One firm may have a private decision before the court continues.';
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
  const initialRoom = new URLSearchParams(window.location.search).get('room')?.toUpperCase()
    ?? URL_RECOVERY_SESSION?.code
    ?? '';
  const [playMode, setPlayMode] = useState<'local' | 'remote'>(() => initialRoom ? 'remote' : 'local');
  const [restored] = useState<SavedSession | null>(() => loadSession());
  const [game, setGame] = useState<GameState | null>(() => restored?.game ?? null);
  const [profiles, setProfiles] = useState<SeatProfiles>(() => restored?.profiles ?? defaultProfiles());
  const [setupSeed, setSetupSeed] = useState(makeSeed);
  const [specialtiesEnabled, setSpecialtiesEnabled] = useState(true);
  const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal');
  const [botStepRequested, setBotStepRequested] = useState(false);
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
  const isBotTurn = pendingActor !== null && game?.players[pendingActor].controller !== 'human';
  const playerView = useMemo(
    () => game && pendingActor && unlocked ? getPlayerView(game, pendingActor) : null,
    [game, pendingActor, unlocked],
  );
  const legalActions = useMemo(
    () => game && pendingActor ? getLegalActions(game, pendingActor) : [],
    [game, pendingActor],
  );

  useEffect(() => {
    if (!game) return;
    const session: SavedSession = { version: 2, game, profiles };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [game, profiles]);

  useEffect(() => {
    setSelectedSlots([]);
    setError(null);
  }, [pendingActor, game?.phase, game?.round]);

  useEffect(() => {
    if (!game || !pendingActor || !isBotTurn || game.phase === 'complete') return;
    if (botSpeed === 'step' && !botStepRequested) return;
    const timer = window.setTimeout(() => {
      const random = createRandom(`browser-bot:${hashPublicGameState(game)}:${pendingActor}`);
      try {
        const level = game.players[pendingActor].controller as AutomatedBotLevel;
        const action = chooseBotAction(game, pendingActor, level, random);
        const result = applyAction(game, action);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setTurnNotice(describeTransition(game, result.state, pendingActor));
        setGame(result.state);
        setUnlocked(false);
        setBotStepRequested(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, botSpeed === 'instant' ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [botSpeed, botStepRequested, game, isBotTurn, pendingActor]);

  function startGame() {
    const seed = setupSeed.trim() || makeSeed();
    const controllers = Object.fromEntries(
      SEAT_ORDER.map((seat) => [seat, profiles[seat].controller]),
    ) as Record<SeatId, Controller>;
    const next = createGame({
      seed,
      controllers,
      rules: { specialtiesEnabled },
    });
    setGame(next);
    setUnlocked(false);
    setError(null);
    setTurnNotice(specialtiesEnabled
      ? 'The case is ready. Each firm chooses a private Specialty before Round 1 is revealed.'
      : 'The case is ready. Pass the device to the first Divider.');
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

  if (playMode === 'remote') {
    return (
      <RemoteExperience
        initialCode={initialRoom}
        onLocalPlay={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          window.history.replaceState({}, '', url);
          setPlayMode('local');
        }}
      />
    );
  }

  if (!game) {
    return (
      <SetupScreen
        profiles={profiles}
        seed={setupSeed}
        onSeedChange={setSetupSeed}
        specialtiesEnabled={specialtiesEnabled}
        onSpecialtiesEnabledChange={setSpecialtiesEnabled}
        botSpeed={botSpeed}
        onBotSpeedChange={setBotSpeed}
        onProfileChange={updateProfile}
        onStart={startGame}
        onRemote={() => setPlayMode('remote')}
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
        <BotTurnPanel
          actor={pendingActor}
          profiles={profiles}
          error={error}
          privateDecision={game.phase === 'specialty_power_window'}
          stepMode={botSpeed === 'step'}
          onStep={() => setBotStepRequested(true)}
        />
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
          legalActions={legalActions}
          selectedSlots={selectedSlots}
          error={error}
          onSelectedSlotsChange={setSelectedSlots}
          onSubmit={submitAction}
          onHide={() => setUnlocked(false)}
        />
      ) : null}

      <Scoreboard
        game={game}
        profiles={profiles}
        activeSeat={game.phase === 'specialty_power_window' ? null : pendingActor}
      />
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
  specialtiesEnabled,
  onSpecialtiesEnabledChange,
  botSpeed,
  onBotSpeedChange,
  onProfileChange,
  onStart,
  onRemote,
}: {
  profiles: SeatProfiles;
  seed: string;
  onSeedChange: (seed: string) => void;
  specialtiesEnabled: boolean;
  onSpecialtiesEnabledChange: (enabled: boolean) => void;
  botSpeed: BotSpeed;
  onBotSpeedChange: (speed: BotSpeed) => void;
  onProfileChange: (seat: SeatId, update: Partial<SeatProfile>) => void;
  onStart: () => void;
  onRemote: () => void;
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

      <section className="play-mode-card" aria-label="Play mode">
        <div><p className="section-label">Play mode</p><h2>How is your table meeting?</h2></div>
        <div className="play-mode-actions">
          <button className="play-mode-option play-mode-active" type="button">
            <strong>Same device</strong><span>Pass one screen around the table</span>
          </button>
          <button className="play-mode-option" type="button" onClick={onRemote}>
            <strong>Remote room</strong><span>Invite players on their own devices</span>
          </button>
        </div>
      </section>

      <form className="setup-card" onSubmit={(event) => { event.preventDefault(); onStart(); }}>
        <div className="setup-heading">
          <div><p className="section-label">Seat the firms</p><h2>Open a new case</h2></div>
          <div className="seed-controls">
            <label className="seed-field">Case seed<input value={seed} onChange={(event) => onSeedChange(event.target.value)} /></label>
            <button className="button button-quiet" type="button" onClick={() => {
              const randomized = makeSeed();
              onSeedChange(randomized === seed ? `${randomized}-new` : randomized);
            }}>Randomize seed</button>
          </div>
        </div>

        <div className="game-options-grid">
          <label className="setup-option">
            <input
              type="checkbox"
              checked={specialtiesEnabled}
              onChange={(event) => onSpecialtiesEnabledChange(event.target.checked)}
            />
            <span><strong>Use Specialties</strong><small>Deal two private roles to each firm and choose one.</small></span>
          </label>
          <label className="bot-speed-field">
            Bot pace
            <select value={botSpeed} onChange={(event) => onBotSpeedChange(event.target.value as BotSpeed)}>
              <option value="step">Step — tap for each move</option>
              <option value="normal">Normal — readable pause</option>
              <option value="instant">Instant — no delay</option>
            </select>
          </label>
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
                      <option value="medium">Medium bot</option>
                      <option value="hard">Hard bot</option>
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
  const specialtyCheck = game.phase === 'specialty_power_window';
  return (
    <section className="handoff-panel" aria-labelledby="handoff-title">
      {notice && <p className="turn-notice" role="status">{notice}</p>}
      <div className={`handoff-seal ${specialtyCheck ? '' : `side-${SEAT_META[actor].side}`}`}>{specialtyCheck ? '?' : actor}</div>
      <p className="section-label">Private turn</p>
      <h2 id="handoff-title">{specialtyCheck ? 'A private Specialty check is ready' : `Pass the device to ${seatName(profiles, actor)}`}</h2>
      <p>{actorInstruction(game)}</p>
      <button className="button button-primary button-large" type="button" onClick={onUnlock}>{specialtyCheck ? 'Reveal the firm privately' : `I am ${seatName(profiles, actor)}`}</button>
      <small>Other players should look away before continuing.</small>
    </section>
  );
}

function BotTurnPanel({ actor, profiles, error, privateDecision, stepMode, onStep }: {
  actor: SeatId;
  profiles: SeatProfiles;
  error: string | null;
  privateDecision: boolean;
  stepMode: boolean;
  onStep: () => void;
}) {
  return (
    <section className="handoff-panel bot-panel" aria-live="polite">
      <div className={`handoff-seal ${privateDecision ? '' : `side-${SEAT_META[actor].side}`}`}>AI</div>
      <p className="section-label">{profiles[actor].controller} bot</p>
      <h2>{privateDecision ? 'A bot is resolving a private Specialty check' : `${seatName(profiles, actor)} is reviewing the Docket`}</h2>
      <p>{error ?? (stepMode ? 'Ready to select one legal action.' : 'Selecting one legal action…')}</p>
      {stepMode ? (
        <button className="button button-primary" type="button" onClick={onStep}>Run bot move</button>
      ) : (
        <div className="thinking-dots" aria-hidden="true"><span /><span /><span /></div>
      )}
    </section>
  );
}

function TurnPanel({ actor, game, profiles, playerView, legalActions, selectedSlots, error, onSelectedSlotsChange, onSubmit, onHide }: {
  actor: SeatId;
  game: DisplayGame;
  profiles: SeatProfiles;
  playerView: PlayerView;
  legalActions: GameAction[];
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

      <SpecialtyReminder player={game.players[actor]} />

      {error && <p className="error-banner" role="alert">{error}</p>}
      {game.phase === 'setup_specialty_choice' && (
        <SpecialtyDraftControls actor={actor} legalActions={legalActions} onSubmit={onSubmit} />
      )}
      {game.phase === 'specialty_power_window' && (
        <SpecialtyPowerControls actor={actor} game={game} legalActions={legalActions} onSubmit={onSubmit} />
      )}
      {game.phase === 'round_split_commit' && (
        <SplitControls actor={actor} game={game} selectedSlots={selectedSlots} onSelectedSlotsChange={onSelectedSlotsChange} onSubmit={onSubmit} />
      )}
      {game.phase === 'round_choose_commit' && <BriefChoiceControls actor={actor} game={game} onSubmit={onSubmit} />}
      {game.phase === 'round_argue' && (
        <ArgumentControls actor={actor} game={game} legalActions={legalActions} onSubmit={onSubmit} />
      )}
    </section>
  );
}

function SplitControls({ actor, game, selectedSlots, onSelectedSlotsChange, onSubmit }: {
  actor: SeatId;
  game: DisplayGame;
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
  game: DisplayGame;
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

function SpecialtyReminder({ player }: { player: DisplayGame['players'][SeatId] }) {
  if (!player.specialtyId) return null;
  const specialty = SPECIALTY_BY_ID.get(player.specialtyId);
  if (!specialty) return null;
  return (
    <div className="secret-reminder specialty-reminder">
      <span>Your Specialty</span>
      <strong>{specialty.name}</strong>
      <small>
        {player.specialtyUsed
          ? `Power spent · Bonus +${specialty.bonusPoints}: ${specialty.bonus}`
          : specialty.power}
      </small>
    </div>
  );
}

function SpecialtyDraftControls({ actor, legalActions, onSubmit }: {
  actor: SeatId;
  legalActions: GameAction[];
  onSubmit: (action: GameAction) => void;
}) {
  const choices = legalActions.filter(
    (action): action is Extract<GameAction, { type: 'choose_specialty' }> =>
      action.type === 'choose_specialty',
  );
  return (
    <div className="decision-area">
      <div className="decision-copy">
        <p className="section-label">Setup · {actor}</p>
        <h3>Choose your Specialty</h3>
        <p>Your Specialty stays secret until you spend its power or the case ends.</p>
      </div>
      <div className="specialty-grid">
        {choices.map((action) => {
          const specialty = SPECIALTY_BY_ID.get(action.specialtyId);
          if (!specialty) return null;
          return (
            <button
              className="specialty-card"
              type="button"
              key={action.specialtyId}
              onClick={() => onSubmit(action)}
            >
              <strong>{specialty.name}</strong>
              <span className="specialty-power">{specialty.power}</span>
              <span className="specialty-bonus">+{specialty.bonusPoints} · {specialty.bonus}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpecialtyPowerControls({ actor, game, legalActions, onSubmit }: {
  actor: SeatId;
  game: DisplayGame;
  legalActions: GameAction[];
  onSubmit: (action: GameAction) => void;
}) {
  const moves = legalActions.filter(
    (action): action is Extract<GameAction, { type: 'use_specialty' }> =>
      action.type === 'use_specialty',
  );
  const pass = legalActions.find((action) => action.type === 'pass_specialty');
  const beforeScore = game.specialtyWindow?.kind === 'before_issue_scores';
  const pendingIssue = game.specialtyWindow?.issueId ?? null;
  if (beforeScore) {
    const usePower = moves[0];
    return (
      <div className="decision-area">
        <div className="decision-copy">
          <p className="section-label">Before the court scores</p>
          <h3>{pendingIssue ? issueName(pendingIssue) : 'This Issue'} is about to score</h3>
          <p>Add your Specialty marker now, or pass and keep the power for a later scoring of this Issue.</p>
        </div>
        <div className="decision-footer">
          {pass && <button className="button button-quiet" type="button" onClick={() => onSubmit(pass)}>Pass for now</button>}
          {usePower && <button className="button button-specialty" type="button" onClick={() => onSubmit(usePower)}>Use my Specialty</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="decision-area">
      <div className="decision-copy">
        <p className="section-label">Closing Arguments revealed</p>
        <h3>Move up to two Firm markers</h3>
        <p>
          Revealed Issues: {game.closingRevealed.map(issueName).join(' · ')}. Markers may only
          leave Issues that were not revealed.
        </p>
      </div>
      <div className="action-options closing-power-options">
        {moves.map((action) => (
          <button
            className="action-button"
            type="button"
            key={`${action.toIssue}-${(action.fromIssues ?? []).join(',')}`}
            onClick={() => onSubmit(action)}
          >
            <span>{(action.fromIssues ?? []).map(issueName).join(' + ')}</span>
            <strong>→ {action.toIssue ? issueName(action.toIssue) : ''}</strong>
          </button>
        ))}
      </div>
      {pass && (
        <button className="button button-quiet" type="button" onClick={() => onSubmit(pass)}>
          Keep my markers where they are
        </button>
      )}
    </div>
  );
}

function ArgumentControls({ actor, game, legalActions, onSubmit }: {
  actor: SeatId;
  game: DisplayGame;
  legalActions: GameAction[];
  onSubmit: (action: GameAction) => void;
}) {
  const side = SEAT_META[actor].side;
  const assignedSlots = game.briefs[side].assignments[actor] ?? [];
  const cardActions = legalActions.filter(
    (action): action is Extract<GameAction, { type: 'play_docket_card' }> => action.type === 'play_docket_card',
  );
  return (
    <div className="decision-area">
      <div className="decision-copy"><p className="section-label">Argument {game.actionsResolvedThisRound + 1} of 12</p><h3>Play one Case card</h3><p>Pick an assigned card, then choose its eligible Issue or Lead/Co-Counsel action.</p></div>
      <div className="argument-grid">
        {assignedSlots.map((slot) => {
          const docket = game.docket.find((entry) => entry.slot === slot);
          const card = docket ? CARD_BY_ID.get(docket.cardId) : null;
          const actions = cardActions.filter((action) => action.slot === slot);
          if (!docket || !card) return null;
          return (
            <article className={`argument-card ${actions.length === 0 ? 'argument-card-used' : ''}`} key={slot}>
              <div className="case-card-heading"><span className="slot-number">{slot}</span><div><strong>{card.title}</strong><small>{card.rulesText}</small></div></div>
              {actions.length > 0 ? (
                <div className="action-options">
                  {actions.map((action) => {
                    const actionType = action.focusAction ?? card.action;
                    const withPower = action.useSpecialty === true;
                    return (
                      <button
                        className={`action-button action-${actionType} ${withPower ? 'action-specialty' : ''}`}
                        type="button"
                        key={`${action.slot}-${action.chosenIssue}-${action.focusAction ?? card.action}-${withPower ? 'power' : 'plain'}`}
                        onClick={() => onSubmit(action)}
                      >
                        <span>{issueName(action.chosenIssue)}</span>
                        <strong>{actionType === 'lead' ? 'Lead' : 'Co-Counsel'}</strong>
                        {withPower && <em className="action-specialty-tag">Specialty</em>}
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
      <p className="docket-choice-rules">{card?.rulesText}</p>
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
        return (
          <li key={slot}>
            <span>{slot}</span>
            <div><strong>{card?.title ?? `Card ${slot}`}</strong><small>{card?.rulesText}</small></div>
          </li>
        );
      })}
    </ul>
  );
}

function Scoreboard({ game, profiles, activeSeat }: { game: DisplayGame; profiles: SeatProfiles; activeSeat: SeatId | null }) {
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
                {seats.map((seat) => {
                  const specialtyId = game.players[seat].specialtyRevealed
                    ? game.players[seat].specialtyId
                    : null;
                  const specialty = specialtyId ? SPECIALTY_BY_ID.get(specialtyId) : null;
                  return (
                  <div className={`firm-score ${activeSeat === seat ? 'firm-score-active' : ''}`} key={seat}>
                    <span className={`seat-chip seat-${seat.toLowerCase()}`}>{seat}</span>
                    <div>
                      <strong>{seatName(profiles, seat)}</strong>
                      <small>{game.players[seat].leadCredits.length} Lead Credits</small>
                      {specialty && <small className="revealed-specialty">Revealed: {specialty.name} · {specialty.power}</small>}
                    </div>
                    <b>{game.players[seat].reputation}</b>
                  </div>
                  );
                })}
              </div>
              <div className="side-floor">Side floor <strong>{Math.min(...seats.map((seat) => game.players[seat].reputation))}</strong></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IssueBoard({ game, profiles }: { game: DisplayGame; profiles: SeatProfiles }) {
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

function DocketBoard({ game, profiles }: { game: DisplayGame; profiles: SeatProfiles }) {
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

function VerdictPanel({ game, profiles, onNewCase, actionLabel = 'Open another case', actionDisabled = false }: {
  game: DisplayGame;
  profiles: SeatProfiles;
  onNewCase: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
}) {
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
      {game.specialtyBonuses.length > 0 && (
        <div className="verdict-specialties">
          <p className="section-label">Specialties</p>
          <ul>
            {game.specialtyBonuses.map((bonus) => {
              const specialty = SPECIALTY_BY_ID.get(bonus.specialtyId);
              return (
                <li className={bonus.earned ? 'specialty-earned' : 'specialty-missed'} key={bonus.seatId}>
                  <span>{bonus.seatId} · {specialty?.name ?? bonus.specialtyId}</span>
                  <strong>{bonus.earned ? `+${bonus.bonusPoints}` : 'no bonus'}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="verdict-detail">Side tiebreak: {verdict.sideTieBreaker.replaceAll('_', ' ')} · Firm tiebreak: {verdict.firmTieBreaker.replaceAll('_', ' ')}</p>
      <button className="button button-primary button-large" type="button" disabled={actionDisabled} onClick={onNewCase}>{actionLabel}</button>
    </section>
  );
}

function loadRemoteSessions(): Record<string, RemoteSession> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(REMOTE_SESSIONS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, RemoteSession>
      : {};
  } catch {
    return {};
  }
}

function remoteSessionFor(code: string): RemoteSession | null {
  if (!code) return null;
  const session = loadRemoteSessions()[code];
  return session?.code === code && SEAT_ORDER.includes(session.seat) && session.token
    ? session
    : null;
}

function saveRemoteSession(session: RemoteSession): void {
  const sessions = loadRemoteSessions();
  sessions[session.code] = session;
  window.localStorage.setItem(REMOTE_SESSIONS_KEY, JSON.stringify(sessions));
}

function forgetRemoteSession(code: string): void {
  const sessions = loadRemoteSessions();
  delete sessions[code];
  window.localStorage.setItem(REMOTE_SESSIONS_KEY, JSON.stringify(sessions));
}

function setRoomUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState({}, '', url);
}

async function remoteRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: Record<string, unknown> } = {},
): Promise<RemoteApiResult<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${REMOTE_API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    const result = await response.json() as RemoteApiResult<T>;
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok) {
        const value = result.value as unknown;
        const record = value && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown>
          : null;
        const snapshot = record?.snapshot && typeof record.snapshot === 'object'
          ? record.snapshot as Record<string, unknown>
          : null;
        const version = record?.protocolVersion ?? snapshot?.protocolVersion;
        if (version !== REMOTE_PROTOCOL_VERSION) {
          return {
            ok: false,
            status: 503,
            code: 'protocol_mismatch',
            error: 'Remote play is still updating. Wait for the Worker deployment to finish, then refresh.',
          };
        }
      }
      return result;
    }
    return {
      ok: false,
      status: response.status,
      code: 'invalid_response',
      error: 'The remote service returned an invalid response.',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'service_unavailable',
      error: 'The remote service is not responding yet. Try again shortly.',
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function profilesFromLobby(lobby: RemoteLobby): SeatProfiles {
  return Object.fromEntries(lobby.seats.map((seat) => [
    seat.seat,
    { name: seat.name, controller: seat.controller },
  ])) as SeatProfiles;
}

function RemoteExperience({ initialCode, onLocalPlay }: {
  initialCode: string;
  onLocalPlay: () => void;
}) {
  const normalizedInitialCode = /^[A-Z2-9]{6}$/.test(initialCode) ? initialCode : '';
  const [session, setSession] = useState<RemoteSession | null>(
    () => {
      if (URL_RECOVERY_SESSION?.code === normalizedInitialCode) {
        saveRemoteSession(URL_RECOVERY_SESSION);
        window.history.replaceState({}, '', `${window.location.pathname}?room=${normalizedInitialCode}`);
        return URL_RECOVERY_SESSION;
      }
      return remoteSessionFor(normalizedInitialCode);
    },
  );
  const [snapshot, setSnapshot] = useState<RemotePlayerSnapshot | null>(null);
  const [targetLobby, setTargetLobby] = useState<RemoteLobby | null>(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(normalizedInitialCode);
  const [seed, setSeed] = useState(makeSeed);
  const [specialtiesEnabled, setSpecialtiesEnabled] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  const [turnHidden, setTurnHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let cancelled = false;
    let timer = 0;
    async function refresh() {
      const result = await remoteRequest<RemotePlayerSnapshot>(
        `/api/rooms/${activeSession.code}/state`,
        { token: activeSession.token },
      );
      if (!cancelled) {
        if (result.ok) {
          setSnapshot(result.value);
          setError(null);
        } else if (result.code === 'invalid_session' || result.code === 'room_not_found') {
          forgetRemoteSession(activeSession.code);
          setSession(null);
          setSnapshot(null);
          setError(result.error);
        } else {
          setError(result.error);
        }
        timer = window.setTimeout(refresh, 1_200);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session]);

  useEffect(() => {
    if (session || !roomCode || targetLobby) return;
    void findRoom(roomCode);
  }, []);

  useEffect(() => {
    setSelectedSlots([]);
    setTurnHidden(false);
  }, [snapshot?.pendingActors.join(','), snapshot?.game?.phase, snapshot?.game?.round]);

  function acceptSession(nextSession: RemoteSession, nextSnapshot: RemotePlayerSnapshot) {
    saveRemoteSession(nextSession);
    setRoomUrl(nextSession.code);
    setSession(nextSession);
    setSnapshot(nextSnapshot);
    setTargetLobby(null);
    setRoomCode(nextSession.code);
    setError(null);
  }

  async function createRoom() {
    if (!name.trim()) {
      setError('Enter your name before creating a room.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await remoteRequest<{
      session: RemoteSession;
      snapshot: RemotePlayerSnapshot;
    }>('/api/rooms', { method: 'POST', body: { name } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    acceptSession(result.value.session, result.value.snapshot);
    setNotice('Room created. Share the code or invite link.');
  }

  async function findRoom(codeValue = roomCode) {
    const code = codeValue.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      setError('Enter the six-character room code.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await remoteRequest<RemoteLobby>(`/api/rooms/${code}/lobby`);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRoomCode(code);
    setRoomUrl(code);
    setTargetLobby(result.value);
  }

  async function joinSeat(seat: SeatId) {
    if (!name.trim()) {
      setError('Enter your name before choosing a seat.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await remoteRequest<{
      session: RemoteSession;
      snapshot: RemotePlayerSnapshot;
    }>(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      body: { name, seat },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      await findRoom(roomCode);
      return;
    }
    acceptSession(result.value.session, result.value.snapshot);
    setNotice(`You joined room ${roomCode} as ${seat}.`);
  }

  async function configureBot(seat: SeatId, controller: Controller) {
    if (!session) return;
    setBusy(true);
    setError(null);
    const result = await remoteRequest<RemotePlayerSnapshot>(
      `/api/rooms/${session.code}/bot`,
      { method: 'POST', token: session.token, body: { seat, controller } },
    );
    setBusy(false);
    if (result.ok) setSnapshot(result.value);
    else setError(result.error);
  }

  async function startRemoteGame() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const result = await remoteRequest<RemotePlayerSnapshot>(
      `/api/rooms/${session.code}/start`,
      {
        method: 'POST',
        token: session.token,
        body: { seed, specialtiesEnabled },
      },
    );
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.value);
      setNotice('The case is open. Every player can use their own device.');
    } else {
      setError(result.error);
    }
  }

  async function submitRemoteAction(action: GameAction) {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    const result = await remoteRequest<RemotePlayerSnapshot>(
      `/api/rooms/${session.code}/action`,
      { method: 'POST', token: session.token, body: { action } },
    );
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.value);
      setSelectedSlots([]);
      setNotice('Decision accepted. The room has been updated.');
    } else {
      setError(result.error);
    }
  }

  async function copyInvite(code: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice('Invite link copied.');
    } catch {
      setNotice(`Share room code ${code}.`);
    }
  }

  async function copyRecoveryLink() {
    if (!session) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', session.code);
    url.hash = new URLSearchParams({
      room: session.code,
      seat: session.seat,
      token: session.token,
    }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice('Private recovery link copied. Keep it secret—it controls your seat.');
    } catch {
      setError('Could not copy the recovery link on this device.');
    }
  }

  async function releaseSeat(seat: SeatId, controller: Controller) {
    if (!session) return;
    setBusy(true);
    const result = await remoteRequest<RemotePlayerSnapshot>(
      `/api/rooms/${session.code}/release`,
      { method: 'POST', token: session.token, body: { seat, controller } },
    );
    setBusy(false);
    if (result.ok) setSnapshot(result.value);
    else setError(result.error);
  }

  async function leaveRoom() {
    if (session) {
      if (snapshot?.game?.phase !== undefined
          && snapshot.game.phase !== 'complete'
          && !window.confirm('Leave this live game? An Easy bot will take over your firm and this recovery link will stop working.')) {
        return;
      }
      setBusy(true);
      const result = await remoteRequest<{
        protocolVersion: typeof REMOTE_PROTOCOL_VERSION;
        closed: boolean;
      }>(`/api/rooms/${session.code}/leave`, {
        method: 'POST',
        token: session.token,
      });
      setBusy(false);
      if (!result.ok && result.code !== 'room_not_found' && result.code !== 'invalid_session') {
        setError(`Could not release your seat: ${result.error}`);
        return;
      }
      forgetRemoteSession(session.code);
    }
    setRoomUrl(null);
    setSession(null);
    setSnapshot(null);
    setTargetLobby(null);
    setRoomCode('');
    setError(null);
    setNotice(null);
  }

  if (!session || !snapshot) {
    return (
      <RemoteEntry
        busy={busy}
        error={error}
        name={name}
        roomCode={roomCode}
        lobby={targetLobby}
        onNameChange={setName}
        onRoomCodeChange={(value) => setRoomCode(value.toUpperCase())}
        onCreate={() => { void createRoom(); }}
        onFind={() => { void findRoom(); }}
        onJoin={(seat) => { void joinSeat(seat); }}
        onBack={() => {
          setTargetLobby(null);
          setRoomUrl(null);
        }}
        onLocalPlay={onLocalPlay}
      />
    );
  }

  const lobby = snapshot.lobby;
  const profiles = profilesFromLobby(lobby);
  const isHost = session.seat === lobby.hostSeat;
  if (!snapshot.game) {
    return (
      <RemoteLobbyPanel
        lobby={lobby}
        session={session}
        isHost={isHost}
        seed={seed}
        specialtiesEnabled={specialtiesEnabled}
        busy={busy}
        error={error}
        notice={notice}
        onSeedChange={setSeed}
        onSpecialtiesEnabledChange={setSpecialtiesEnabled}
        onCopyInvite={() => { void copyInvite(lobby.code); }}
        onCopyRecovery={() => { void copyRecoveryLink(); }}
        onConfigureBot={(seat, controller) => { void configureBot(seat, controller); }}
        onReleaseSeat={(seat, controller) => { void releaseSeat(seat, controller); }}
        onStart={() => { void startRemoteGame(); }}
        onLeave={() => { void leaveRoom(); }}
      />
    );
  }

  const game = snapshot.game;
  const actor = snapshot.pendingActors.includes(session.seat)
    ? session.seat
    : snapshot.pendingActor;
  const myTurn = snapshot.pendingActors.includes(session.seat);
  const actorName = actor ? seatName(profiles, actor) : null;
  return (
    <main className="game-shell">
      <header className="game-header">
        <div><p className="eyebrow">Remote room {lobby.code}</p><h1>Split Decision</h1></div>
        <div className="header-actions">
          <span className="save-status">Live · You are {session.seat}</span>
          <button className="button button-quiet" type="button" onClick={() => { void copyInvite(lobby.code); }}>Invite</button>
          <button className="button button-quiet" type="button" onClick={() => { void copyRecoveryLink(); }}>Recovery link</button>
          <button className="button button-quiet" type="button" onClick={() => { void leaveRoom(); }}>Leave</button>
        </div>
      </header>

      <section className="case-strip" aria-label="Current case status">
        <div><span>Round</span><strong>{game.round} / {game.rules.rounds}</strong></div>
        <div><span>Phase</span><strong>{phaseName(game)}</strong></div>
        <div><span>Court’s Favor</span><strong>{SIDE_LABEL[game.courtFavor]}</strong></div>
        <div><span>Docket arguments</span><strong>{game.actionsResolvedThisRound} / 12</strong></div>
      </section>

      {notice && <p className="remote-notice" role="status">{notice}</p>}
      {error && <p className="error-banner remote-error" role="alert">{error}</p>}

      {game.phase === 'complete' && game.verdict ? (
        <VerdictPanel
          game={game}
          profiles={profiles}
          onNewCase={() => {
            if (isHost) void startRemoteGame();
          }}
          actionLabel={isHost ? 'Start rematch' : 'Waiting for host'}
          actionDisabled={!isHost || busy}
        />
      ) : myTurn && actor && !turnHidden ? (
        <TurnPanel
          actor={actor}
          game={game}
          profiles={profiles}
          playerView={game}
          legalActions={snapshot.legalActions}
          selectedSlots={selectedSlots}
          error={error}
          onSelectedSlotsChange={setSelectedSlots}
          onSubmit={(action) => { void submitRemoteAction(action); }}
          onHide={() => setTurnHidden(true)}
        />
      ) : myTurn && actor ? (
        <section className="remote-wait-panel">
          <div className={`handoff-seal side-${SEAT_META[actor].side}`}>{actor}</div>
          <p className="section-label">Your private turn</p>
          <h2>Your decision is hidden</h2>
          <button className="button button-primary" type="button" onClick={() => setTurnHidden(false)}>Show my turn</button>
        </section>
      ) : (
        <section className="remote-wait-panel" aria-live="polite">
          <div className={`handoff-seal ${actor ? `side-${SEAT_META[actor].side}` : ''}`}>{actor ?? '…'}</div>
          <p className="section-label">Room is live</p>
          <h2>{actorName ? `Waiting for ${actorName}` : 'Resolving the court record'}</h2>
          <p>The board refreshes automatically. You can leave this tab open.</p>
          <div className="thinking-dots" aria-hidden="true"><span /><span /><span /></div>
        </section>
      )}

      {isHost && game.phase !== 'complete' && (
        <RemoteSeatManager
          lobby={lobby}
          busy={busy}
          onReplace={(seat, controller) => { void releaseSeat(seat, controller); }}
        />
      )}

      <Scoreboard game={game} profiles={profiles} activeSeat={actor} />
      <IssueBoard game={game} profiles={profiles} />
      <DocketBoard game={game} profiles={profiles} />
      <RecentResults results={game.hearingResults} profiles={profiles} />
      <RulesGuide />
    </main>
  );
}

function RemoteEntry({
  busy,
  error,
  name,
  roomCode,
  lobby,
  onNameChange,
  onRoomCodeChange,
  onCreate,
  onFind,
  onJoin,
  onBack,
  onLocalPlay,
}: {
  busy: boolean;
  error: string | null;
  name: string;
  roomCode: string;
  lobby: RemoteLobby | null;
  onNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreate: () => void;
  onFind: () => void;
  onJoin: (seat: SeatId) => void;
  onBack: () => void;
  onLocalPlay: () => void;
}) {
  return (
    <main className="setup-shell">
      <section className="remote-hero">
        <div><p className="eyebrow">Play from anywhere</p><h1>Remote court</h1><p>Every firm uses its own device. Private arguments stay private, and the shared board updates automatically.</p></div>
        <button className="button button-quiet" type="button" onClick={onLocalPlay}>Use one device instead</button>
      </section>

      {error && <p className="error-banner remote-entry-error" role="alert">{error}</p>}
      {lobby ? (
        <section className="remote-entry-card">
          <div className="remote-entry-heading">
            <div><p className="section-label">Room {lobby.code}</p><h2>Choose an open firm</h2></div>
            <button className="button button-quiet" type="button" onClick={onBack}>Different room</button>
          </div>
          <label>Your name<input value={name} maxLength={36} onChange={(event) => onNameChange(event.target.value)} placeholder="Ryan" /></label>
          <div className="remote-seat-grid">
            {lobby.seats.map((seat) => (
              <button
                className={`remote-seat side-${SEAT_META[seat.seat].side}`}
                type="button"
                key={seat.seat}
                disabled={busy || seat.claimed || lobby.phase !== 'lobby'}
                onClick={() => onJoin(seat.seat)}
              >
                <span className={`seat-chip seat-${seat.seat.toLowerCase()}`}>{seat.seat}</span>
                <strong>{seat.name}</strong>
                <small>{seat.claimed ? seat.controller !== 'human' ? `${seat.controller} bot` : 'Claimed' : 'Join this firm'}</small>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="remote-entry-grid">
          <form className="remote-entry-card" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
            <p className="section-label">Host</p><h2>Create a room</h2>
            <p>Start a private lobby, then invite up to three people or fill seats with bots.</p>
            <label>Your name<input value={name} maxLength={36} onChange={(event) => onNameChange(event.target.value)} placeholder="Ryan" /></label>
            <button className="button button-primary button-large" type="submit" disabled={busy}>Create remote room</button>
          </form>
          <form className="remote-entry-card" onSubmit={(event) => { event.preventDefault(); onFind(); }}>
            <p className="section-label">Guest</p><h2>Join a room</h2>
            <p>Use the six-character code from your host, then choose an available firm.</p>
            <label>Room code<input value={roomCode} maxLength={6} onChange={(event) => onRoomCodeChange(event.target.value)} placeholder="ABC234" autoCapitalize="characters" /></label>
            <button className="button button-primary button-large" type="submit" disabled={busy}>Find room</button>
          </form>
        </section>
      )}
    </main>
  );
}

function RemoteLobbyPanel({
  lobby,
  session,
  isHost,
  seed,
  specialtiesEnabled,
  busy,
  error,
  notice,
  onSeedChange,
  onSpecialtiesEnabledChange,
  onCopyInvite,
  onCopyRecovery,
  onConfigureBot,
  onReleaseSeat,
  onStart,
  onLeave,
}: {
  lobby: RemoteLobby;
  session: RemoteSession;
  isHost: boolean;
  seed: string;
  specialtiesEnabled: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onSeedChange: (value: string) => void;
  onSpecialtiesEnabledChange: (enabled: boolean) => void;
  onCopyInvite: () => void;
  onCopyRecovery: () => void;
  onConfigureBot: (seat: SeatId, controller: Controller) => void;
  onReleaseSeat: (seat: SeatId, controller: Controller) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const allSeatsReady = lobby.seats.every((seat) => seat.claimed);
  return (
    <main className="setup-shell">
      <section className="remote-lobby-header">
        <div><p className="eyebrow">Remote courtroom</p><h1>{lobby.code}</h1><p>Share this code or copy the invite link. You are seated as {session.seat}.</p></div>
        <div className="remote-lobby-actions">
          <button className="button button-primary" type="button" onClick={onCopyInvite}>Copy invite link</button>
          <button className="button button-quiet" type="button" onClick={onCopyRecovery}>Copy private recovery link</button>
          <button className="button button-quiet" type="button" onClick={onLeave}>Leave room</button>
        </div>
      </section>
      {notice && <p className="remote-notice" role="status">{notice}</p>}
      {error && <p className="error-banner remote-error" role="alert">{error}</p>}
      <section className="remote-entry-card remote-lobby-card">
        <div><p className="section-label">Counsel table</p><h2>Waiting for the firms</h2></div>
        <div className="remote-seat-grid">
          {lobby.seats.map((seat) => (
            <article className={`remote-seat side-${SEAT_META[seat.seat].side}`} key={seat.seat}>
              <span className={`seat-chip seat-${seat.seat.toLowerCase()}`}>{seat.seat}</span>
              <strong>{seat.name}</strong>
              <small>{seat.claimed ? seat.controller !== 'human' ? `${seat.controller} bot ready` : 'Player ready' : 'Open seat'}</small>
              {isHost && seat.seat !== lobby.hostSeat
                  && (!seat.claimed || seat.controller !== 'human') && (
                <label className="bot-level-field">
                  Seat type
                  <select
                    value={seat.controller}
                    disabled={busy}
                    onChange={(event) => onConfigureBot(seat.seat, event.target.value as Controller)}
                  >
                    <option value="human">Open to player</option>
                    <option value="easy">Easy bot</option>
                    <option value="medium">Medium bot</option>
                    <option value="hard">Hard bot</option>
                  </select>
                </label>
              )}
              {isHost && seat.seat !== lobby.hostSeat
                  && seat.claimed && seat.controller === 'human' && (
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Reopen ${seat.seat}? Their current recovery link will stop working.`)) {
                      onReleaseSeat(seat.seat, 'human');
                    }
                  }}
                >
                  Reopen seat
                </button>
              )}
            </article>
          ))}
        </div>
        {isHost ? (
          <div className="remote-start-row">
            <div className="remote-case-options">
              <label>Case seed<input value={seed} onChange={(event) => onSeedChange(event.target.value)} /></label>
              <button className="button button-quiet" type="button" onClick={() => {
                const randomized = makeSeed();
                onSeedChange(randomized === seed ? `${randomized}-new` : randomized);
              }}>Randomize seed</button>
              <label className="setup-option">
                <input type="checkbox" checked={specialtiesEnabled} onChange={(event) => onSpecialtiesEnabledChange(event.target.checked)} />
                <span><strong>Use Specialties</strong><small>Draft private roles before Round 1.</small></span>
              </label>
            </div>
            <div><span>{allSeatsReady ? 'All four firms are ready.' : 'Fill every seat with a player or bot.'}</span><button className="button button-primary button-large" type="button" disabled={busy || !allSeatsReady} onClick={onStart}>Call the case</button></div>
          </div>
        ) : (
          <div className="remote-waiting-copy"><strong>Waiting for the host</strong><span>The game will appear here automatically when the host starts it.</span></div>
        )}
      </section>
    </main>
  );
}

function RemoteSeatManager({ lobby, busy, onReplace }: {
  lobby: RemoteLobby;
  busy: boolean;
  onReplace: (seat: SeatId, controller: Exclude<Controller, 'human'>) => void;
}) {
  const replaceable = lobby.seats.filter(
    (seat) => seat.seat !== lobby.hostSeat && seat.controller === 'human',
  );
  if (replaceable.length === 0) return null;
  return (
    <details className="rules-guide remote-seat-manager">
      <summary>Host seat recovery</summary>
      <div className="remote-recovery-list">
        {replaceable.map((seat) => (
          <div key={seat.seat}>
            <span>{seat.seat} · {seat.name}</span>
            <div>
              {(['easy', 'medium', 'hard'] as const).map((controller) => (
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={busy}
                  key={controller}
                  onClick={() => {
                    if (window.confirm(`Replace ${seat.name} with a ${controller} bot? Their recovery link will stop working.`)) {
                      onReplace(seat.seat, controller);
                    }
                  }}
                >Replace with {controller}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
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
        <div><span>6</span><strong>Specialize</strong><p>Your private Specialty has one power and one endgame bonus. Reveal it only when used or when the case ends.</p></div>
        <div><span>7</span><strong>Verdict</strong><p>Compare each side’s lower firm score. The higher floor wins; its higher firm wins the game.</p></div>
      </div>
    </details>
  );
}
