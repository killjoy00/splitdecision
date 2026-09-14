# Remote play deployment

Remote games use one Cloudflare Durable Object per six-character room code. The object is the authoritative game server: it authenticates each seat, keeps Closing Arguments and unsubmitted briefs private, validates actions with the same engine used by local play, runs Easy, Medium, and Hard bots, and expires inactive rooms after 30 days.

The static React app remains on GitHub Pages at `splitdecision.planitnow.us`. The room API is a separate Worker at `splitdecision-api.planitnow.us`.

## One-time Cloudflare and GitHub setup

1. In Cloudflare, open **My Profile → API Tokens → Create Token** and start with the **Edit Cloudflare Workers** template. Limit the token to the account that owns `planitnow.us`.
2. Copy the token when Cloudflare shows it. It is only displayed once.
3. Copy the account ID from the Cloudflare dashboard. It appears on the account or zone overview page.
4. In GitHub, open `killjoy00/splitdecision` and go to **Settings → Secrets and variables → Actions**.
5. Create a repository secret named `CLOUDFLARE_API_TOKEN` containing the token.
6. Create a repository secret named `CLOUDFLARE_ACCOUNT_ID` containing the account ID.
7. Open **Actions → Deploy remote play service → Run workflow → Run workflow**. The first deployment creates the Worker, its Durable Object namespace, and the SQLite-backed `GameRoom` class migration.
8. The deployment reads `wrangler.jsonc` and attaches `splitdecision-api.planitnow.us` as the Worker's Custom Domain. Cloudflare creates the DNS record and certificate automatically; do not also add a Worker Route.
9. In Cloudflare, open **Workers & Pages → split-decision-remote → Domains** and wait for `splitdecision-api.planitnow.us` to become active.
10. Visit `https://splitdecision.planitnow.us`, choose **Remote room**, create a room, and open the invite link in a second browser or device.

The GitHub Pages hostname `splitdecision.planitnow.us` should keep the DNS configuration required by GitHub Pages. The separate `splitdecision-api` hostname terminates at Cloudflare and should be proxied. They do not need to share an origin IP.

## Local development

Run these in separate terminals:

```bash
npm run dev
npm run dev:remote
```

Vite uses the local Worker automatically when the page itself is on `localhost` or `127.0.0.1`. To point the browser at another API, set `VITE_REMOTE_API_URL` before starting or building Vite.

## Verification

```bash
npm test
npm run build
npm run build:remote
npx playwright install chromium
npm run test:e2e
```

The remote integration suite runs inside Cloudflare's Workers Vitest runtime. It covers room creation, simultaneous private actions, authorization, redaction, bot difficulty, recovery, rematches, a complete verdict, protocol health, expiry alarms, and privacy-safe playtest telemetry. The Playwright smoke test checks the local flow at a mobile viewport and verifies that full Case-card rules are visible during both splitting and choosing.

`npm run smoke:production` is the live end-to-end deployment check. It verifies the deployed Pages HTML, confirms the deployed JavaScript bundle points at the production Worker, checks production CORS plus protocol/schema health, creates a real room, reads its lobby and authenticated state, and closes it again. The normal `main` deployment runs this command immediately after Pages finishes deploying. Smoke rooms use a reserved test name and are excluded from playtest summaries.

## Playtest telemetry

Cloudflare Worker observability is enabled in `wrangler.jsonc`. Remote rooms emit a single structured `split_decision_playtest_summary` JSON log when a real match reaches a verdict or when a room is abandoned. The telemetry wrapper is separate from the authoritative game-server implementation so instrumentation cannot change rules resolution.

The summary includes only aggregate playtest signals:

- room and game duration plus accumulated phase duration
- human action counts and decision-time aggregates by action type
- resolved Case action and Issue-selection counts
- Citation target count and first/second companion-position counts
- seat recovery/replacement, bot replacement, host-transfer, and reconnect/resume counts
- Hearing count, side-tiebreak count, close-margin count, and total margin
- final verdict tiebreak categories for completed games

The summary deliberately excludes player names, room codes, recovery/session tokens, seeds, full action payloads, per-player timing, and canonical hidden game state. The existing completion log still records aggregate Specialty outcomes after the verdict, when those choices are no longer secret.

### Generate a playtest report

The repository includes a report command that turns exported Worker logs into a compact Markdown or JSON playtest report. It accepts raw JSON, NDJSON, copied console lines, or nested Cloudflare log-export objects and ignores unrelated log entries.

For a live playtest session, capture the Worker tail while people play:

```bash
npx wrangler tail split-decision-remote --format json > playtest-2026-09-14.ndjson
```

Stop the tail after the session, then generate the report:

```bash
npm run report:playtest -- playtest-2026-09-14.ndjson --out playtest-report.md
```

For historical sessions, export or copy the relevant Worker observability log results from Cloudflare after filtering for `split_decision_playtest_summary`, save them to a local file, and pass that file to the same command.

Useful options:

```bash
# Exclude solo-with-bots games from mechanics/pacing analysis, while still counting all lifecycle/abandonment summaries.
npm run report:playtest -- playtest.ndjson --min-humans 2

# Machine-readable output for deeper analysis.
npm run report:playtest -- playtest.ndjson --format json --out playtest-report.json

# Pipe logs directly through stdin.
cat playtest.ndjson | npm run report:playtest -- -
```

The Markdown report focuses on the decisions most likely to matter after early human tests:

- completion/abandonment rate and abandonment reasons
- human-seat mix so bot-heavy sessions are visible
- completed-game median and P90 duration
- Case-action mix, including Citation and Second Chair usage
- Issue-selection mix
- Citation companion-target split
- phase duration and human decision timing
- plaintiff/defense verdict split, Hearing margins, close Hearings, and tiebreak frequency
- reconnects, seat recovery, bot replacement, and host-transfer friction
- evidence gates that label the sample **EARLY**, **DIRECTIONAL**, or **STABLE** and avoid recommending balance changes from tiny samples

The current evidence gates treat fewer than 10 completed multiplayer games as early, 10–24 as directional, and 25+ as stable. Citation and Second Chair each need at least 10 observed human uses before the report marks them ready for a directional review. These are evidence-quality gates, not automatic balance targets.

## Operations and recovery

- Room tokens are generated in the browser session response and stored only in that browser's local storage. Normal invite links contain the room code, not a seat token.
- Use **Copy private recovery link** to move or restore your own seat. That link contains the seat token in its URL fragment, so keep it private. The fragment is removed from the address bar as soon as the app restores it.
- **Leave room** now releases the seat on the server. During a game, the departing firm becomes an Easy bot so the room cannot stall. If the host leaves, host control transfers to another connected human; a room with no humans closes.
- Before play, the host can reopen a claimed non-host seat. During play, **Host seat recovery** can replace a disconnected non-host player with an Easy, Medium, or Hard bot.
- After the verdict, the host can start a rematch with the same table.
- The Worker permits browser requests from `https://splitdecision.planitnow.us` and local development origins. Update `FRONTEND_ORIGIN` in `wrangler.jsonc` if the production frontend moves.
- Inactive room data expires after 30 days. There is no permanent account or match-history database in this version.
- Protocol v2 deliberately expires stored v1 rooms because their game-state shape is incompatible with corrected Specialty scoring windows. Players should create a new room after this upgrade.
- Merging to `main` deploys the Worker first, verifies `GET /api/health`, deploys Pages, then runs the live production smoke. If the Worker health check fails, the public frontend remains on the prior compatible version. If the final smoke fails, the deployment run is marked failed so the production mismatch is visible immediately. The Worker-only workflow remains available for recovery.
