# Scaling NUSAQUEST: one server today, several tomorrow

This document is for the team that inherits NUSAQUEST. It explains what one self-hosted
instance carries, which signals mean it is time to grow, and a concrete plan for running
several instances with **Redis** for coordination and **PostgreSQL** as the shared store.
None of it requires changing a screen.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first. Two facts drive everything below:

1. All game rules live in the deterministic, serializable `GameEngine` (`lib/game/engine.ts`),
   wrapped by `GameAuthority` (`lib/realtime/authority.ts`), which adds timers, player tokens
   and event fan-out. **A session must have exactly one authority at a time** (single writer).
2. Every screen talks to a live game only through `RealtimeGameProvider`
   (`lib/realtime/types.ts`). Today that is `ServerRealtimeProvider`: JSON commands over
   HTTP + Server-Sent Events. Scaling means deciding **where each authority runs** and **how
   its events reach the phones**; the rules and the UI stay the same.

---

## 1. Today: a single instance

```
 phones / projector ──HTTP commands──▶ ┌──────────── app (one Node.js process) ──────────────┐
                    ◀──SSE events───── │ route handlers ─▶ ServerGameRuntime                 │
                                       │                   └─ Map<sessionId, GameAuthority>  │
                                       │                        timers · tokens · fan-out    │
                                       └───────────────┬─────────────────────────────────────┘
                                                       │ write-behind (debounced 400 ms)
                                                       ▼
                                              PostgreSQL (engine_state + normalized rows)
```

Why one process goes a long way:

- **Everything hot is in memory.** An answer is: parse + validate (Zod) → token hash check
  → `engine.submitAnswer` → ack. No database round trip on the answer path; duplicates are
  rejected by the engine, with `unique(session_id, player_id, question_id)` in Postgres as
  the final guard when results are synced.
- **Fan-out is cheap.** Each event is serialized **once** and the same string is written to
  every open stream (`lib/server/sse.ts`); player snapshots only append their own small
  `self` block. Slow clients are cut loose after 256 queued frames and reconnect to a
  fresh snapshot.
- **Persistence is write-behind.** `SessionPersistence.save()` runs at most every ~400 ms
  per session; normalized `players` / `player_answers` / `leaderboard_snapshots` rows are
  synced at reveal/finish. A restart restores unfinished sessions from `engine_state`, and
  deadlines are absolute timestamps, so timers re-arm correctly.
- **Idle cost is low.** An open SSE stream is one HTTP response plus a 15 s heartbeat.

### Design target (validate with the load test in §4, step 5)

| Dimension                       | Target                                           | Notes                                      |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Players per session             | 200–300                                          | one large lecture hall                     |
| Concurrent players per instance | ~300 comfortably; low thousands expected         | 2 vCPU / 2–4 GB VM                         |
| Answer burst                    | every player within ~2–5 s of a question opening | the hardest moment                         |
| Answer acknowledgement          | < 150 ms perceived                               | the UI locks optimistically, then confirms |
| Reveal fan-out                  | all phones within ~500 ms                        | projector and phones feel in sync          |

In practice the **campus Wi-Fi** (clients per access point, captive portals, guest-network
isolation) fails long before this server does. See `docs/DEPLOYMENT.md` §6.

### Limits of one instance

- **One JavaScript thread.** CPU beyond ~1 core does not help the game loop (extra vCPUs
  still help PostgreSQL, TLS termination and GC).
- **Single point of failure.** A crash or update costs ~10–20 s; sessions are restored from
  PostgreSQL and clients reconnect automatically. State written in the last ~400 ms
  before the process stops (the persistence debounce) may be missing after the restore;
  if a question is still open, affected players simply answer again.
- **Per-process state.** Rate limits (`SlidingWindowLimiter`) and the room-code index live in
  memory; they are only correct because there is one process.

### Signals that it is time to grow

- Event-loop lag above ~100 ms or one core above ~70% during answer bursts.
- Answer-ack p95 above 150 ms in the browser's network panel or the load test.
- Several thousand concurrent streams (`subscribers` in `GET /api/health`).
- A requirement for zero-downtime updates or surviving a VM failure without a restart gap.

---

## 2. Cheap wins before adding instances

In order of value per effort:

1. **Throttle `progress` events.** Today every accepted answer emits a `progress` event to
   every stream: 300 answers × 300 streams ≈ 90,000 frames per question, all within a few
   seconds. Coalescing to at most ~4 per second per session (latest value wins) removes
   the only O(n²) path. Change it in `GameAuthority.submitVerified`.
2. **Proxmox HA before app-level HA.** With shared storage (Ceph, or ZFS replication) put the
   VM in a Proxmox HA group. If a node dies the VM restarts elsewhere in ~1–2 minutes and
   NUSAQUEST restores its running sessions from PostgreSQL. No code changes, and good enough
   for most teaching use.
3. **Give PostgreSQL its own VM/LXC** on SSD storage when reports and history grow, and keep
   the app VM small. Only `DATABASE_URL` changes.
4. **HTTP/2 at the proxy** (Caddy does this by default). Browsers allow only 6 HTTP/1.1
   connections per origin, and each open game tab holds one for its stream; this matters for
   staff who open many host/preview tabs, not for phones.
5. **Leaderboards as top 10 + "your rank"** and snapshots kept small (target < 4 KB).
6. **Scale up** to 4 vCPU / 8 GB for campus events (headroom for GC, TLS and Postgres).

---

## 3. Target architecture: several instances

```
                         phones / projectors
                                 │  HTTPS (HTTP/2)
                                 ▼
             L7 proxy (nginx / HAProxy, keepalived VIP) ── consistent hash on session id
                 │                    │                   │
            app-1 (Node)         app-2 (Node)        app-N (Node)          same image everywhere
            owns sessions        owns sessions       owns sessions         GameAuthority per OWNED session
            A, D, …              B, C, …             …
                 │                    │                   │
                 └──────────┬─────────┴──────────┬────────┘
                            ▼                    ▼
                         Redis 7            PostgreSQL 17 (shared store)
          ownership leases · pub/sub         accounts, quizzes, game_sessions.engine_state,
          room index · shared rate limits    answers, reports; streaming replica + backups
```

### 3.1 One owner per session (keep the single writer)

- **Ownership lease in Redis.** The instance that creates (or restores) a session holds
  `SET nq:owner:<sessionId> <instanceId> NX PX 15000` and renews it every ~5 s. Only the
  lease holder mounts a `GameAuthority`. The lease is what guarantees two instances never
  run the same session.
- **Restore on boot must respect the lease.** Today `ServerGameRuntime.ready()` restores
  _every_ unfinished session. With several instances each one may only mount the sessions
  whose lease it wins; the rest are someone else's.
- **Sticky routing.** Every game request carries the session id in its path
  (`/api/sessions/<id>/…`), so the proxy can hash on it and nearly all traffic for a class
  lands on its owner:

  ```nginx
  map $uri $nq_session { ~^/api/sessions/(?<sid>[^/]+)/ $sid; default $request_id; }
  upstream nusaquest_game { hash $nq_session consistent; server app1:3000; server app2:3000; }
  location /api/sessions/ { proxy_pass http://nusaquest_game; … }   # plus the SSE settings
  ```

  Joins arrive by room code (`/api/rooms/<code>/…`); keep an index `nq:room:<code>` →
  `sessionId` in Redis, and let any instance **forward** the command to the owner (the
  owner's internal address sits next to its lease). Forwarding is the rare path; the hash
  keeps it rare.

### 3.2 Events across instances

Two proven options; both keep `RealtimeGameProvider` unchanged for the screens.

**Option A: keep SSE, add Redis pub/sub** (smallest change).
The owner publishes each serialized `GameEvent` to `nq:events:<sessionId>`. Any instance can
serve a stream: it subscribes to that channel and writes frames to its local clients. Player
snapshots need the private `self` block, which only the owner can compute: publish
snapshot events together with a `playerId → self` map (≈100 bytes per player), and let each
instance append the right block exactly as `frameFor` does today. Commands that land on a
non-owner are forwarded (3.1).

**Option B: Socket.IO game server with the Redis adapter.**
Move the authority into a dedicated Node service (`server/` in this repo, importing
`lib/game/*` and `lib/realtime/authority.ts` directly: they have no Next.js dependency) that
speaks Socket.IO, with `@socket.io/redis-adapter` (or `redis-streams-adapter`, which tolerates
short Redis outages) for cross-node rooms. Write a `SocketIoRealtimeProvider` implementing
`RealtimeGameProvider` and select it in `lib/realtime/index.ts`. Sticky sessions are
**mandatory** if the long-polling fallback stays enabled; hash on `sessionId` as above.
Choose this if you also want WebSockets for other features; otherwise Option A is less work.

### 3.3 State, failover and persistence

- PostgreSQL remains the **source of durable truth**: `game_sessions.engine_state` holds the
  complete persisted authority (engine state, hashed player tokens), written behind by the
  owner. When an owner dies, its lease expires (≤ 15 s); another instance acquires it,
  loads `engine_state`, and `GameAuthority` re-arms its timers from the absolute deadlines.
  Clients reconnect and receive a full snapshot, the same path as today's restart.
- To make failover lossless for answers, write accepted answers through (a Redis stream or
  an immediate `player_answers` insert with `on conflict do nothing`) instead of relying on
  the 400 ms debounce alone.
- Room codes stay unique through the partial unique index on `game_sessions(room_code)`
  for lobby/running sessions, plus the Redis room index.

### 3.4 Everything else that must become shared

| Concern                          | Single instance today         | Several instances                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limits                      | in-process sliding window     | Redis (sorted set or `INCR` + `EXPIRE` per window)                                                                                                                                                                                       |
| Uploaded images                  | local volume `UPLOAD_DIR`     | shared filesystem (NFS/CephFS on Proxmox) or self-hosted S3 (MinIO, Garage, SeaweedFS) behind the media store (`lib/server/media-store.ts`)                                                                                              |
| Lecturer sessions                | `auth_sessions` in PostgreSQL | unchanged (already shared)                                                                                                                                                                                                               |
| Migrations                       | run at boot                   | unchanged: an advisory lock serializes concurrent boots                                                                                                                                                                                  |
| Next.js build                    | one image                     | **one image for all instances**; set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build time (the login form uses a Server Action) and a `deploymentId` for version skew (see `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`) |
| Shared demo (`demo`, PIN 482913) | one in-memory session         | owned via the same lease as any session                                                                                                                                                                                                  |
| Health                           | `/api/health`                 | per instance; the proxy removes unhealthy instances                                                                                                                                                                                      |

---

## 4. Implementation plan

1. **Coordinator interface.** Add `SessionCoordinator` next to `SessionPersistence` in
   `lib/server/game-runtime.ts` (`acquire/renew/release lease`, `publish`, `subscribe`,
   `lookupRoom`, `forward`). The default single-process implementation is a no-op, so memory
   and single-instance database mode keep working unchanged.
2. **Redis implementation** (`lib/server/redis-coordinator.ts`, `redis` or `ioredis` client,
   enabled by `REDIS_URL`). Move `rateLimit()` to Redis at the same time.
3. **Runtime changes.** Mount/restore only with a lease; forward commands for sessions owned
   elsewhere; serve streams from pub/sub for non-owned sessions; throttle `progress` (§2).
4. **Compose.** Add `redis:7-alpine` (no published port, `appendonly no`: it holds only
   ephemeral coordination data), run two `app` services, and an nginx/HAProxy front with the
   consistent-hash config above. On Proxmox: two small app VMs, one DB VM (PostgreSQL +
   streaming replica, Redis), and a proxy pair with a keepalived virtual IP.
5. **Load test** (k6 or Artillery, both self-hostable): 10 sessions × 300 simulated players,
   a full 10-question game, players reading the SSE stream. Pass criteria: answer-ack p95
   < 150 ms, reveal fan-out p95 < 500 ms, zero lost or duplicated answers (compare with
   `player_answers`), event-loop lag p99 < 100 ms. The in-repo bot driver
   (`lib/realtime/local/bots.ts`) is a good model for realistic answer timing.
6. **Chaos test.** Kill the owner mid-question: the session must resume on another instance
   within one lease timeout, the question must close at its original deadline, and every
   acknowledged answer must still count.
7. **Roll out gradually.** Run two instances for one semester with sticky routing before
   removing the "single instance" assumption from operations docs.

---

## 5. Capacity rules of thumb (validate with the load test)

- A Node.js process holds thousands of mostly idle streams; quiz traffic is one answer per
  player per question plus a few broadcasts. CPU goes into JSON serialization and TLS,
  so keep snapshots small and terminate TLS at the proxy.
- PostgreSQL load is modest: debounced session saves plus result syncs at each reveal.
  The default pool (10 connections per instance) is plenty; with N instances keep
  `N × 10` well below `max_connections` (100 by default).
- Start multi-instance with **2 app instances** (for failover, not throughput), 1 small Redis,
  and scale on CPU (> 60%) or stream count.
- Run the first large session with a network administrator present: access points, DHCP
  pools and captive portals are the usual failure points.
