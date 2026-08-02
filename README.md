# Stream Overlay Package

A reskinnable browser-source overlay package for live streamers (Twitch + YouTube
Live), built for OBS / Streamlabs / vMix. One Node.js/Socket.io backend, one React
frontend, config-driven theming — reskinning a new client is a control-panel edit,
not a code change.

## What's included

- `/overlay/alerts` — Alert Box (follows, subs, gifted subs, cheers, donations, raids, super chats, memberships), with pop/slide/particle-burst animation styles and a per-event sound toggle
- `/overlay/goal` — Goal Bar (sub / follower / donation goal, animated fill)
- `/overlay/ticker` — Recent Events Ticker (last 5–10 events, fading list, backfills on reconnect)
- `/overlay/label` — Stream Label / Now Playing bar (static or scrolling)
- `/overlay/countdown` — Countdown / BRB / Starting Soon screen
- `/overlay/chat` — Chat Overlay (Twitch + YouTube live chat, normalized into one feed)
- `/overlay/webcam-frame` — Decorative animated webcam border (no data dependency)
- `/control-panel` — Per-client-login control panel: trigger test alerts, edit
  goal/label/countdown, a full theme editor (colors/fonts/sounds/messages/animation),
  a live preview pane, integration health status, and Ko-fi donation setup

Every overlay route accepts `?client=<name>` so one deployment serves multiple
streamers, each with their own look via `configs/<name>.json` and their own control
panel login.

## Architecture

```
server/
  src/events/schema.js          shared internal event format (platform-agnostic)
  src/events/eventBus.js        pub/sub; in-process by default, optional Redis bridge for multi-process deployments
  src/events/eventBacklog.js    rolling per-client backlog so a reconnecting browser source doesn't lose events
  src/events/testEvents.js      powers the control panel's "trigger test alert" buttons
  src/integrations/twitch/      EventSub (follows/subs/cheers/raids), OAuth token refresh, tmi.js chat reader
  src/integrations/youtube/     Live Chat API poller (super chats/memberships/chat)
  src/integrations/donations/   Ko-fi webhook receiver
  src/auth/credentialsStore.js  per-client control panel passwords (bcrypt-hashed)
  src/config/configStore.js     reads configs/*.json, persists runtime state (goal/label/countdown)
  src/config/schemas.js         Zod validation for every config/runtime write
  src/lib/                      logger (pino), integration status tracker, clientId validation, Twitch token manager
  src/routes/api.js             REST API consumed by the control panel
client/                         React (Vite) frontend — one route per widget + control panel
shared/alertTypes.json          single source of truth for alert icons/labels/default sound/tier — read by both server and client
configs/                        default.json + one JSON file per client (theme/fonts/sounds/durations)
```

All events — regardless of source — are normalized into one shape before they reach
any widget:

```js
{ id, type: 'follow'|'sub'|'giftsub'|'cheer'|'donation'|'raid'|'superchat'|'membership'|'chat',
  platform: 'twitch'|'youtube'|'system', username, amount, tier, months, message, timestamp }
```

## Running it locally

```bash
npm run install:all        # installs server + client dependencies
cp .env.example .env        # fill in real API keys later; blank = demo/mock mode
npm run dev:server          # backend on :4000
npm run dev:client          # frontend on :5173 (proxies /api and /socket.io to :4000)
```

Open any of these while both are running:

- http://localhost:5173/overlay/alerts?client=demo
- http://localhost:5173/overlay/goal?client=demo
- http://localhost:5173/overlay/ticker?client=demo
- http://localhost:5173/overlay/label?client=demo
- http://localhost:5173/overlay/countdown?client=demo
- http://localhost:5173/overlay/chat?client=demo
- http://localhost:5173/overlay/webcam-frame?client=demo
- http://localhost:5173/control-panel

**Demo/mock mode is on by default.** With no Twitch/YouTube credentials set, every
integration automatically emits realistic sample events on an interval, so every
widget is fully demoable out of the box.

### Logging into the control panel

There is no single shared password anymore. The server generates a random password
per client the first time it sees that client's config and **logs it once**:

```
INFO: Generated control panel password for new client — save this now, it will not be shown again
    clientId: "demo"
    password: "xxxxxxxxxxxx"
```

Log into `/control-panel` with Client ID `demo` and that password. A client
authenticated this way can only ever see/edit their own overlay — not any other
client's. If you also set `ADMIN_PASSWORD` in `.env`, leaving the Client ID field
blank on login logs in as an operator/admin who can switch between and manage every
client (including resetting a client's password from the control panel).

### Production build (single deployment)

```bash
npm run build:client   # builds client/dist
npm start               # server serves the built client + API + sockets on one port
```

Point OBS/Streamlabs/vMix browser sources at your deployed URL, e.g.:
`https://your-domain.com/overlay/alerts?client=streamername`

### One-click / hosted deploy

- `Dockerfile` — multi-stage build (client build → server runtime), single container, single port.
- `docker-compose.yml` — `docker compose up --build` runs the server + an optional Redis instance locally.
- `render.yaml` — a Render.com Blueprint; connect this repo on Render and it will offer to deploy this file directly, giving a non-technical buyer a real hosted URL without installing Node locally.

## Security notes (read this before going live)

- **`SESSION_SECRET` is required in production.** The server refuses to start in
  `NODE_ENV=production` without one set. In development it generates a random
  ephemeral secret each boot instead of using a hardcoded default.
- **`clientId` is strictly validated** (`^[a-z0-9-]{1,64}$`) everywhere it touches a
  filesystem path or an auth decision — on the API routes, the socket connection
  handler, and again inside `configStore.js` itself as defense in depth.
- **Per-client auth is enforced on every mutating route**, not just checked once at
  login — `requireClientAccess` compares the authenticated session's `clientId`
  against the `:clientId` in the route, so an authenticated client can never write
  another client's config/goal/label/countdown.
- **CORS is allowlist-based** (`CORS_ORIGIN`, comma-separated) instead of reflecting
  any origin; leave it blank to only allow same-origin requests.
- **Every config/runtime write is validated with Zod** before it touches disk, with
  field-level errors returned to (and shown in) the control panel — a malformed save
  can no longer silently break an overlay with zero feedback.
- Overlay routes are wrapped in a React error boundary that fails **transparent**
  (renders nothing) instead of crashing the whole browser source if it hits an
  unexpected event/config shape; add `?debug=1` to see a visible error instead of a
  silent blank page while testing.

## Going live with real Twitch / YouTube data

Fill these into `.env` (see `.env.example` for the full list):

**Twitch alerts (EventSub over WebSocket)**
- `TWITCH_CLIENT_ID`, `TWITCH_ACCESS_TOKEN` — from a registered Twitch app + user OAuth token
- `TWITCH_REFRESH_TOKEN`, `TWITCH_CLIENT_SECRET` — **required for the token to keep working.**
  Twitch user access tokens expire in a few hours; the server validates the token at
  boot and proactively refreshes it ahead of expiry (and reactively on a 401 from any
  Helix call), using these two values. Without them, alerts will silently stop once
  the initial access token expires — get a refresh token the same place you got the
  access token (Twitch OAuth authorization code flow, requesting offline access).
- `TWITCH_BROADCASTER_USER_ID` — the streamer's numeric user id
- `TWITCH_MODERATOR_USER_ID` — required for `channel.follow` (v2). As of Twitch's
  2023 API change, follow events require the `moderator:read:followers` scope and a
  moderator user id (can be the broadcaster themselves). **Confirm current
  requirements against Twitch's docs before going live** — this has changed before
  and could change again.
- Every configured client currently shares the same Twitch app credentials (they're
  process-wide env vars) — this is fine for one deployment = one Twitch channel, but
  if you're reselling to multiple streamers who each need their *own* Twitch
  channel connected, that needs per-client credential storage, which is not yet
  built (see Known gaps).

**Twitch chat (read-only, separate from EventSub)**
- `TWITCH_CHANNEL_NAME` — the channel login name. Uses `tmi.js` in anonymous mode,
  so no OAuth token is required just to read public chat.

**YouTube (polling, no real push equivalent exists)**
- `YOUTUBE_API_KEY`, `YOUTUBE_LIVE_CHAT_ID` — YouTube has no "follow" event; the
  closest analogues are channel subscriptions (not stream-specific, so not modeled
  here as an alert) and live chat super chats / memberships, which this polls via
  the YouTube Live Streaming + Data APIs. The poller respects the API's own
  `pollingIntervalMillis` hint (and a configurable floor via
  `YOUTUBE_POLL_INTERVAL_MS`) to stay within quota — do not lower this recklessly.

No code changes are required to switch from mock to live — each integration checks
for its own credentials at startup and only falls back to mock mode if they're missing.
Check `/api/status/:clientId` (or the "Integration Status" panel in the control
panel) any time to see whether each integration is currently `mock` or `real`,
whether it's connected, and its last event/error.

## Ko-fi donations

The `donation` alert type is wired to a real webhook now, not just the test-alert
button. In the control panel's "Ko-fi Donations" section: copy the shown webhook URL
into Ko-fi (Settings → Webhooks → Webhook URL), paste your Ko-fi verification token
into the control panel, save. Real Ko-fi donations then fire the Donation alert
automatically. Other donation platforms aren't wired yet — add a receiver under
`server/src/integrations/donations/` that calls
`eventBus.publish(clientId, makeEvent({ type: 'donation', ... }))` and it flows
through the existing Alert Box/Ticker with no other changes needed.

## Reskinning for a new client

Almost everything is now editable from the control panel's Theme tab — colors,
fonts, per-event alert message text, per-event sound on/off, alert animation style,
alert duration, and master sound volume — with no JSON editing required. For fields
not yet exposed in the UI:

1. Copy `configs/default.json` to `configs/<clientname>.json`.
2. Edit further as needed; the server discovers every `configs/*.json` file at boot
   and provisions a login + starts a Twitch/YouTube integration instance for each.
3. Send the client their browser-source URLs (shown in their own control panel) and
   their control panel login.

Fonts (`@fontsource/inter`, `@fontsource/poppins`) and three tiers of alert sound
(`alert-small/medium/big.mp3`, synthesized placeholders — see Known gaps) are
bundled into the client build; nothing overlay-critical depends on an external CDN
during a live stream.

## Horizontal scaling (optional)

By default everything — the event bus, the per-client backlog, Socket.io — is
in-process. Running more than one server process/host safely requires:

1. A shared `REDIS_URL` set on every process. This bridges `eventBus` publishes
   across processes and wires Socket.io's Redis adapter, so a socket connected to
   any process receives events published by any process's integrations (see
   `src/events/eventBus.js` and the cross-process test in
   `src/events/eventBus.redis.test.js`).
2. `INTEGRATIONS_ENABLED=false` on all but one process — otherwise every process
   would open its own duplicate Twitch/YouTube/chat connections per client. Run
   exactly one process (or a dedicated "integrations worker") with integrations
   enabled, and the rest serving sockets/API only.

`docker-compose.yml` includes a Redis service to make this easy to try locally.

## Performance notes

- Alert/ticker/chat animations use CSS transforms/opacity and GSAP tweens (both
  GPU-accelerated), not JS animation loops, to stay light at 1080p/60fps in OBS.
- Root elements are `background: transparent` with no stray shadows/borders at the
  page level — only widget containers have visible backgrounds.
- Socket.io keeps one persistent connection per browser source instead of polling.
- Config reads are cached in memory (invalidated on save) instead of hitting disk
  synchronously on every socket connect/reconnect.

## Testing

```bash
npm test --prefix server   # Vitest: event normalization, config store, clientId
                            # validation, and a mocked-Redis cross-process bridge test
```

`.github/workflows/ci.yml` runs the same suite plus the client build and a server
boot smoke-test on every push/PR.

## Known gaps / next steps

- **No visual demo/screenshots bundled here.** If you're evaluating this as a
  potential buyer: build it and open the overlay URLs yourself, or deploy via the
  Render blueprint above for a shareable link — there's no hosted demo included in
  this repo.
- **Alert sounds are synthesized placeholder tones** (three tiers: small/medium/big),
  not licensed sound effects. Swap `client/public/sounds/alert-*.mp3` for real,
  licensed stingers before reselling this to a paying client.
- **Twitch/YouTube credentials are still process-wide, not per-client** — fine for a
  single-channel deployment, but a true multi-tenant reseller setup (each client
  connecting their *own* Twitch/YouTube account) needs per-client credential storage
  layered on top of the per-client auth that now exists for the control panel.
- Only Ko-fi is wired for donations; other platforms need their own receiver (see
  above — the pattern is small and self-contained).
- The in-process event backlog (last ~25 events / 30 chat messages per client) is
  intentionally small and process-local; it survives a browser-source reconnect but
  not a server restart, and doesn't share state across processes even with Redis
  enabled (each process keeps its own backlog buffer) — acceptable for "catch up
  after OBS reloaded this source," not a durable event log.
