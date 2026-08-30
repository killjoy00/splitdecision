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
```

The remote integration suite runs inside Cloudflare's Workers Vitest runtime. It covers room creation, four-player joins, authorization, per-player redaction, bot difficulty configuration, human actions, bot turns, a complete verdict, and expiry alarms.

## Operations and recovery

- Room tokens are generated in the browser session response and stored only in that browser's local storage. Invite links contain the room code, not a seat token.
- The Worker permits browser requests from `https://splitdecision.planitnow.us` and local development origins. Update `FRONTEND_ORIGIN` in `wrangler.jsonc` if the production frontend moves.
- Inactive room data expires after 30 days. There is no permanent account or match-history database in this version.
- A player who clears site data loses that seat token. Create a new room for this initial release; seat recovery is intentionally not implemented yet.
- To redeploy after a code change, merge the change to `main`, then run **Deploy remote play service** again. The workflow will stop if tests or the Worker dry-run fail.
