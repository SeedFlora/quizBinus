# NUSAQUEST Architecture

Read together with `docs/DESIGN.md` (visual contract) and `AGENTS.md` (Next.js 16 notes:
this is Next **16.3**; `middleware.ts` is now **`proxy.ts`**; bundled docs live in
`node_modules/next/dist/docs/`).

**Deployment target: self-hosted** (Docker on Proxmox, a campus server, or any VM).
There are no managed cloud dependencies: no hosted database, auth or realtime provider, and
nothing that only runs on a hosting platform.

## Stack

Next.js 16 App Router (Node runtime, `output: "standalone"`) · React 19 · TypeScript strict ·
Tailwind CSS v4 (CSS-first tokens) · Motion (`motion/react`) · Zod 4 · PostgreSQL via
Drizzle ORM (`drizzle-orm` + `pg`, migrations with `drizzle-kit`) · Vitest + React Testing
Library · Playwright.

## Runtime modes

|                                 | Memory mode (no `DATABASE_URL`)                  | Database mode (`DATABASE_URL` set)            |
| ------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Game server (multi-device, SSE) | ✅ in the Next.js process                        | ✅ same, plus write-behind to Postgres        |
| Survives restart                | ❌ live games lost                               | ✅ running sessions restored                  |
| Lecturer login                  | ❌ demo lecturer, no sign-in                     | ✅ email + password, admin bootstrap from env |
| Quizzes stored in               | the lecturer's browser (localStorage + seeds)    | Postgres                                      |
| Media uploads                   | inline data URLs                                 | files on the `UPLOAD_DIR` volume              |
| Analytics                       | sessions in memory/this browser + simulated demo | Postgres (full engine state per session)      |

`npm run dev` with no env already gives **real multi-device play on the LAN**: phones join
the laptop's IP. `docker compose up` adds Postgres.

The **local** transport (BroadcastChannel, host tab as authority) remains for the
**offline solo demo** (PIN `482913` when no server demo is running) and as a fallback.

## Folder map

```
app/
  (player)/join, join/profile, room/[code]/lobby, play/[sessionId]{,/waiting,/result,/final}
  (host)/host/session/[id]{,/lobby,/podium}
  (creator)/dashboard, quizzes, quizzes/new, quizzes/[id]/edit, quizzes/[id]/analytics, sessions, settings
  (dev)/lab/audio · design · preview/*        tooling / fixtures
  login/                                       lecturer sign-in (database mode)
  api/                                         route handlers (thin; logic in lib/server)
  styles/                                      tokens.css (PROJECT TOKENS), nusa-frame.css, stage.css, answer.css
components/  brand · ui (+ ui/desk) · game · player · host · creator · analytics · dev
lib/
  game/        types, scoring, evaluate, engine (GameEngine), room-code, use-countdown
  realtime/    types (RealtimeGameProvider), authority (GameAuthority), index (provider factory),
               server/provider (ServerRealtimeProvider: fetch + SSE), local/ (runtime, provider, bots),
               credentials, use-game-session
  server/      game-runtime (ServerGameRuntime singleton), bootstrap, SSE + API handlers, media storage
  db/          Drizzle schema, client, repositories, session persistence, migrations runner
  auth/        password hashing (scrypt), DB-backed sessions (cookie), lecturer resolution
  quiz/        QuizRepository (+ Local, + Api), zod schema, factory
  analytics/   compute (pure, from EngineState), export (CSV), sources
  audio/       SFX engine + procedural music (gamelan × arcade)
  seed/ demo/ i18n/ validation/ security/ media/ ai/
drizzle/       generated SQL migrations (committed)
locales/       id.json (source of truth), en.json (mirrors keys; compile-time checked)
tests/         unit/, components/, e2e/
```

## The game engine is the only source of truth

`lib/game/engine.ts` (`GameEngine`) is a deterministic, serializable state machine:
`lobby → intro → question → reveal → leaderboard → … → finished | ended`. Time is always
passed in. Scoring lives in `lib/game/scoring.ts`. **`snapshotFor(now, playerId?)`** is the
only way state leaves the engine; it never contains correctness data for an open question
(`toPublicQuestion` strips `isCorrect`; ordering questions are shuffled stably per session
with the engine's secret `shuffleSeed`, never with the public session id).

`GameAuthority` (`lib/realtime/authority.ts`) wraps an engine with timers (auto-close at the
deadline, early close when every connected player answered), player tokens and event fan-out.
**The same class runs in the server process (production) and in a browser tab (offline demo).**

## RealtimeGameProvider

`lib/realtime/types.ts` is the single interface every screen uses:
`createSession · joinSession · leaveSession · startGame · publishQuestion · submitAnswer ·
closeQuestion · publishResults · publishLeaderboard · nextQuestion · finishGame` plus
pause/resume/skip/lock/kick/end, `getSnapshot`, `subscribe`.

| Implementation                     | Authority                                       | Transport                                                                                    | Use                         |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| `ServerRealtimeProvider` (default) | `ServerGameRuntime` in the Next.js Node process | JSON POST commands + Server-Sent Events (fetch-streamed, POST body carries the player token) | classrooms, production      |
| `LocalRealtimeProvider`            | a browser tab (`LocalRuntime`)                  | BroadcastChannel                                                                             | offline solo demo, fallback |

A Socket.IO/Redis implementation only has to satisfy the same interface (docs/SCALING.md).

### Server mode data flow

```
phone ──POST /api/rooms/:code/join──────────▶ route ─▶ ServerGameRuntime ─▶ GameAuthority ─▶ GameEngine
phone ──POST /api/sessions/:id/answer───────▶ route ─┘             │ events
phone ◀─POST /api/sessions/:id/events (SSE)── route ◀── subscriber ┘
projector (host, cookie-authenticated) uses the same routes + /host commands
                                       ServerGameRuntime ──write-behind──▶ PostgreSQL (database mode)
```

- The runtime is a process-wide singleton (`getGameRuntime()`); each live session is a
  `GameAuthority` plus its SSE subscribers. Single instance by design; one container serves a campus.
- Persistence is write-behind through the `SessionPersistence` interface: `game_sessions.engine_state`
  holds the full persisted authority (engine state incl. players, answers, reveals); normalized
  `players`, `player_answers`, `leaderboard_snapshots`, `session_events` rows are synced on each
  reveal/finish for reporting. On boot the runtime restores unfinished sessions.
- Players authenticate with an opaque per-session token (only a hash is persisted).
- Lecturers authenticate with email + password; sessions are random tokens in an HttpOnly
  cookie, stored hashed in `auth_sessions`. Host commands require the session's `host_id`.
- Reverse proxies must not buffer `/api/sessions/*/events` (see docs/DEPLOYMENT.md).

## Player identity & reconnect

`lib/realtime/credentials.ts` stores `{sessionId, playerId, token, roomCode, nickname, avatarSeed}` in
localStorage for the session's lifetime. On load, `PlayerGame` calls `resumePlayer`; the snapshot for
that player includes `self.currentAnswer`, so a refresh after answering shows "Jawaban terkunci" and can
never submit twice. Every SSE (re)connection begins with a full snapshot
("Tersambung ulang…" → "Kembali ke permainan.").

## Rules for contributors (humans and agents)

1. Colours only from tokens (Tailwind palette is cleared; see `app/globals.css` `@theme`).
2. Containers use NUSA FRAME classes (`nf nf-{sm|md|lg|xl} nf-{solid|panel|outline|ghost|kapas|energy|sun|desk}`), not ad-hoc rounded cards.
3. Motion timing from `lib/motion.ts`; always respect `useReducedMotion()`.
4. All UI copy through `useT()` / `getT()` with keys in **both** `locales/id.json` and `locales/en.json`.
5. Game HUD labels may be uppercase (`hud-label`); creator UI is sentence case.
6. Never send `isCorrect` / correct answer ids to players before the reveal.
7. Answers are always colour + symbol + letter + position.
8. No managed-cloud dependencies; everything must run from `docker compose up`.
