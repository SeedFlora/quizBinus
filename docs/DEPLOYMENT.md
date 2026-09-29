# Deploying NUSAQUEST (self-hosted on Proxmox)

NUSAQUEST is self-hosted by design: one Docker Compose stack on a Proxmox VM (or any Linux
host) runs everything. There are **no managed cloud services**: no hosted database or auth,
no hosting platform, no external realtime provider. Students' phones talk to your server only.

```
 students' phones ─┐                            ┌─────────────── Docker host (Proxmox VM) ───────────────┐
 projector laptop ─┼── HTTP(S) + SSE ──▶ [ Caddy / nginx ] ──▶ app :3000   Next.js + game server         │
 lecturer laptop  ─┘      (optional TLS proxy)  │                 │  (GameAuthority per live session)    │
                                                │                 ├──▶ db    PostgreSQL 17  (pgdata)     │
                                                │                 └──▶ /app/data/uploads   (uploads)     │
                                                └────────────────────────────────────────────────────────┘
```

| Piece                       | What it is                                                                                                                           | Persistent data                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `app`                       | Next.js 16 standalone server: pages, API, **and** the realtime game server (commands over HTTP, live events over Server-Sent Events) | `uploads` volume (question images) |
| `db`                        | PostgreSQL 17: lecturer accounts, quizzes, sessions, answers, reports. Not published on the host.                                    | `pgdata` volume                    |
| `caddy` (profile `https`)   | optional TLS front door with automatic certificates                                                                                  | `caddy_data` volume (certificates) |
| `backup` (profile `backup`) | optional scheduled `pg_dump` + uploads archive into `./backups`                                                                      | `./backups` on the host            |

On start the app applies pending database migrations, creates the first admin from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` (only while there are no users), and restores any game
that was running before a restart.

Contents:
[1. Proxmox guest](#1-choose-the-proxmox-guest) ·
[2. Docker](#2-install-docker) ·
[3. Configure](#3-get-the-code-and-configure) ·
[4. Start](#4-start-the-stack) ·
[5. Accounts](#5-first-login-and-lecturer-accounts) ·
[6. Classroom networking](#6-classroom-networking) ·
[7. HTTPS](#7-https) ·
[8. Backups](#8-backups-and-restore) ·
[9. Updates](#9-updates-and-rollback) ·
[10. Monitoring](#10-monitoring-and-logs) ·
[11. Environment](#11-environment-reference) ·
[12. Troubleshooting](#12-troubleshooting) ·
[13. Without Docker](#13-running-without-docker)

---

## 1. Choose the Proxmox guest

**Recommended: a VM** running Debian 12 (bookworm) or Debian 13 (trixie). Docker in a VM is
fully supported, isolated from the Proxmox kernel, and survives Proxmox upgrades unchanged.

| Setting | Value                                                                                  |
| ------- | -------------------------------------------------------------------------------------- |
| OS      | Debian 12/13 netinst or the Debian generic cloud image (cloud-init)                    |
| CPU     | 2 vCPU, type `host`                                                                    |
| Memory  | 4 GB (2 GB is enough for a pilot with one class at a time); ballooning off             |
| Disk    | 32 GB on SSD/NVMe storage, VirtIO SCSI single, `discard=on`, `ssd=1`                   |
| Network | VirtIO on the bridge/VLAN the campus Wi-Fi can route to; static IP or DHCP reservation |
| Options | QEMU guest agent enabled (`apt install qemu-guest-agent`), start at boot               |

**Alternative: an LXC container.** Lighter, but Docker inside LXC is not officially supported
by Proxmox and may break on host kernel/AppArmor changes. Use it for labs, prefer a VM for
production.

- Unprivileged Debian 12 template, then enable nesting and keyctl:
  `pct set <vmid> --features nesting=1,keyctl=1` (or _Options → Features_ in the UI), and
  restart the container.
- Storage: Docker's `overlay2` works on ZFS-backed root filesystems with ZFS ≥ 2.2
  (Proxmox VE 8.1+). On older setups use an ext4/LVM-thin volume for `/var/lib/docker`.
- Same sizing as the VM.

### Sizing

The whole game loop runs in memory in one Node.js process; PostgreSQL is written behind.
Traffic is small but bursty (every student answers within the same few seconds).

| Load                                                                             | vCPU  | RAM        | Notes                                                                   |
| -------------------------------------------------------------------------------- | ----- | ---------- | ----------------------------------------------------------------------- |
| Pilot: one class (≤ 100 players) at a time                                       | 2     | 2 GB       |                                                                         |
| **Standard: ~300 concurrent players** (a large hall, or several classes at once) | **2** | **2–4 GB** | the default recommendation                                              |
| Campus event: 1,000+ concurrent players                                          | 4     | 8 GB       | load-test first; beyond one process see [`docs/SCALING.md`](SCALING.md) |

Disk: the image and database need a few GB; add room for uploads (≤ 2 MB per image) and
14 days of backups. In practice, **Wi-Fi capacity (clients per access point) runs out long
before the server does**. See [§6](#6-classroom-networking).

---

## 2. Install Docker

Docker Engine + the Compose plugin from Docker's own repository (not Debian's `docker.io`):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"     # log out and back in afterwards
docker compose version              # v2.24+ required
```

Also recommended on the host: `unattended-upgrades`, SSH with keys only, and the Proxmox
firewall (below). **Docker-published ports bypass `ufw`/`iptables` INPUT rules**, so
filter at the Proxmox firewall (VM → _Firewall_) or publish the app on `127.0.0.1` behind a
proxy.

---

## 3. Get the code and configure

```bash
sudo mkdir -p /opt/nusaquest && sudo chown "$USER": /opt/nusaquest
git clone https://github.com/SeedFlora/quizBinus.git /opt/nusaquest
cd /opt/nusaquest
cp .env.example .env
chmod 600 .env
```

**Private repository?** Give the server read-only access of its own, never a personal
account: an SSH deploy key (repository _Settings → Deploy keys_ on GitHub, GitLab and Gitea,
with write access off) or a read-only access token. With a deploy key, clone like this
instead; `git pull` keeps using the key afterwards:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/nusaquest_deploy     # add ~/.ssh/nusaquest_deploy.pub as the deploy key
git clone -c core.sshCommand="ssh -i ~/.ssh/nusaquest_deploy" git@github.com:SeedFlora/quizBinus.git /opt/nusaquest
```

Edit `.env`. The minimum for a classroom server on the LAN:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 24)   # paste the value, letters+digits only (it goes into a URL)
ADMIN_EMAIL=it-admin@example.ac.id
ADMIN_PASSWORD=<12+ characters, not a campus SSO password; single-quote it if it contains $>
ADMIN_NAME=NUSAQUEST Admin
APP_URL=http://10.20.30.40:3000             # how phones reach this server
NEXT_PUBLIC_APP_URL=http://10.20.30.40:3000 # encoded in the lobby QR code (build time)
```

Use a DNS name instead of an IP as soon as you have one (`http://quiz.example.ac.id:3000` or,
with HTTPS, `https://quiz.example.ac.id`): printed QR codes and bookmarks then survive an IP
change. Every variable is described in [`.env.example`](../.env.example) and in
[§11](#11-environment-reference). Docker Compose expands `$` in unquoted and double-quoted
`.env` values, so a password containing `$` must be wrapped in single quotes
(`ADMIN_PASSWORD='pa$$phrase'`); the `openssl rand` generators never produce `$`.

> `NEXT_PUBLIC_*` values are compiled into the browser bundle. After changing one, rebuild:
> `docker compose up -d --build`.

---

## 4. Start the stack

```bash
docker compose up -d --build      # first build: ~3–6 minutes (downloads npm packages and fonts)
docker compose ps                 # app and db should become "healthy"
docker compose logs -f app        # first boot only: "created admin account …", "imported 5 demo quizzes …"
curl -s http://localhost:3000/api/health
# {"ok":true,"mode":"database","db":"up","sessions":0,"subscribers":0,"version":"0.1.0"}
```

Successful migrations and session restores log nothing; a problem shows up as
`[nusaquest] database startup failed …` in the log. The reliable check is the health
output: `"mode":"database"` and `"db":"up"`. Check it after every deploy, because a
malformed `DATABASE_URL` is ignored and would leave the server in memory mode.

The build needs outbound HTTPS access to Docker Hub (base images: `registry-1.docker.io`,
`auth.docker.io`, `production.cloudflare.docker.com`), the Alpine package mirror
(`dl-cdn.alpinelinux.org`, for `apk add libc6-compat`), the npm registry
(`registry.npmjs.org`) and Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). Behind a
campus HTTP proxy, pass it to the build: `docker compose build --build-arg HTTP_PROXY=http://proxy:3128
--build-arg HTTPS_PROXY=http://proxy:3128 app`.

Optional profiles can be added any time (they are independent):

```bash
docker compose --profile https up -d            # Caddy HTTPS: set DOMAIN (and the rest of §7) first
docker compose --profile backup up -d           # scheduled backups: create ./backups first, see §8
# or permanently, in .env:  COMPOSE_PROFILES=https,backup
```

To start on boot, nothing else is needed: Docker is enabled and every service has
`restart: unless-stopped`. If your team prefers `systemctl`, use
[`deploy/systemd/nusaquest.service`](../deploy/systemd/nusaquest.service).

---

## 5. First login and lecturer accounts

1. Open `http://<server>:3000/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
   The admin already owns the five demo quizzes (e.g. _OS Battle_), so a full game can be
   tried immediately: open a quiz → start a session → join from a phone.
2. Change the bootstrap password in **Settings** right away. After that you may remove
   `ADMIN_PASSWORD` from `.env`: it is only read while the users table is empty, and
   changing it later does **not** change the password.
3. Create lecturer accounts in **Settings → Lecturer accounts** (visible to admins only). The
   app generates a temporary password and shows it **once**; hand it over in person and ask
   the lecturer to change it in Settings. The same screen disables accounts (signs the
   person out everywhere; their quizzes and history are kept) and resets passwords.

**From the server shell** (forgotten admin password, automation, bulk changes) use
[`deploy/users.sh`](../deploy/users.sh). It runs inside the containers, prompts for passwords
without echoing them, hashes them with the app's own scrypt scheme, and refuses to disable
or demote the last active admin:

```bash
bash deploy/users.sh list
bash deploy/users.sh reset-password it-admin@example.ac.id               # also signs them out everywhere
bash deploy/users.sh add dosen1@example.ac.id "Dr. Rina Wijaya"          # lecturer
bash deploy/users.sh add it-ops@example.ac.id "IT Ops" admin             # another admin
bash deploy/users.sh disable dosen1@example.ac.id                        # or: enable
bash deploy/users.sh role dosen1@example.ac.id admin
```

Each lecturer sees only their own quizzes and sessions. Lecturer sign-in is an HttpOnly
cookie (`nq_session`, 14 days, stored hashed in `auth_sessions`). Students never sign in:
they join with the 6-digit PIN.

---

## 6. Classroom networking

**Every student phone must reach the server's address.** This is the part that decides
whether a lecture works, so test it in the actual room before the first real class.

- **Where the server lives.** A Proxmox VM in the data centre (wired, routed) is the normal
  setup. The campus network must route the **student Wi-Fi subnets → server IP** on port
  3000 (plain HTTP) or 443 (HTTPS). Guest SSIDs often allow only internet egress and block
  private (RFC 1918) addresses; ask the network team for an allow rule, or put NUSAQUEST on
  a public HTTPS name (§7).
- **Wi-Fi client isolation.** Access points commonly block traffic _between wireless
  clients_. That does not affect a server in the data centre, but it does break the
  "lecturer laptop runs NUSAQUEST, phones connect to the laptop" setup on the same SSID.
  For ad-hoc classrooms without infrastructure, a travel router or a phone hotspot works
  (hotspots cap out at roughly 10–15 devices).
- **Capacity.** A single access point realistically serves 30–60 active clients. A 200-seat
  hall needs several APs; the server is not the bottleneck.
- **Firewall.** In Proxmox (VM → _Firewall_ → _Add_): allow TCP 3000 (or 80/443 with a
  proxy) from the campus client subnets, SSH only from the admin network, then enable the
  firewall for the VM. Remember that Docker-published ports bypass `ufw`.
- **DNS.** Create an internal (or public) A record such as `quiz.example.ac.id` → the VM's
  IP. Campus resolvers then serve it to every phone. Set `APP_URL` and `NEXT_PUBLIC_APP_URL`
  to that name.
- **What phones get.** The host lobby shows the PIN, a QR code for
  `<NEXT_PUBLIC_APP_URL or the page origin>/join?room=<PIN>`, and, **when the projector page
  is opened on `localhost`**, the server's LAN addresses (from `GET /api/network`), because
  phones cannot open "localhost". On a server, open the projector page by the server's name
  or IP and the QR code is already correct.
- **QR scanning.** The phone's own camera app always works. The in-app scanner on `/join`
  needs a secure context (HTTPS), so on plain-HTTP LANs students use the camera app or type
  the PIN.
- **Smoke test from the room:** on a phone connected to the classroom Wi-Fi, open
  `http://<server>:3000/api/health` (or `<APP_URL>/api/health` behind HTTPS). If that loads,
  the game will work.
- **Offline fallback.** PIN `482913` always works on a single device (solo demo with 41
  simulated classmates), even without a network.

---

## 7. HTTPS

HTTPS is optional for a LAN pilot but **strongly recommended in production**: without it,
lecturer passwords cross the Wi-Fi in clear text, the session cookie cannot be `Secure`,
and the in-app QR scanner is disabled. With any proxy in front of the app:

```bash
# .env
APP_URL=https://quiz.example.ac.id
NEXT_PUBLIC_APP_URL=https://quiz.example.ac.id   # then rebuild
TRUST_PROXY=true                                 # the proxy's X-Forwarded-For is the client IP
SESSION_COOKIE_SECURE=true                       # or keep "auto" (Secure when X-Forwarded-Proto is https)
APP_PORT=127.0.0.1:3000                          # only when the proxy runs on this host
```

`TRUST_PROXY=true` makes the join/answer rate limits use the **first** `X-Forwarded-For`
hop, so the proxy must **overwrite** that header with the real peer address, never append
to a client-supplied one. All snippets below do.

The live event stream (`POST /api/sessions/<id>/events`) is Server-Sent Events: the proxy
must **not buffer or compress** it and must allow long-lived responses (the server sends a
heartbeat every 15 s). Uploads need a body limit of at least 3 MB.

### Option A: Caddy profile (automatic certificates)

```bash
# .env
DOMAIN=quiz.example.ac.id
APP_PORT=127.0.0.1:3000
docker compose --profile https up -d
```

[`deploy/Caddyfile`](../deploy/Caddyfile) proxies to `app:3000` with `flush_interval -1`,
skips compression for the event stream, and sets HSTS. Certificates:

- **Public DNS name** → Let's Encrypt/ZeroSSL. DNS must point at this server and ports 80 +
  443 must be reachable from the internet for the ACME challenge.
- **Internal-only name** (`*.local`, `*.internal`, `*.home.arpa`, an IP) → Caddy's internal
  CA. Phones will warn unless they trust Caddy's root certificate, so use this for staff
  testing only. For an internal name with a campus CA, use option B with that certificate.

### Option B: existing nginx

A complete, tested server block is in [`deploy/nginx/nusaquest.conf`](../deploy/nginx/nusaquest.conf).
The essentials:

```nginx
client_max_body_size 3m;

location ~ ^/api/sessions/[^/]+/events$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, never append
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 1h;
}
```

### Option C: Nginx Proxy Manager

Proxy host → forward to `http://<vm-ip>:3000`, request a Let's Encrypt certificate on the
_SSL_ tab, then paste this on the _Advanced_ tab. Because it contains `location /`, NPM
omits its default location (whose `$proxy_add_x_forwarded_for` would append to a
client-supplied header):

```nginx
client_max_body_size 3m;

location ~ ^/api/sessions/[^/]+/events$ {
    proxy_pass http://<vm-ip>:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 1h;
}

location / {
    proxy_pass http://<vm-ip>:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
}
```

### Option D: Traefik

Traefik streams `text/event-stream` without buffering and excludes it from its `compress`
middleware by default. Without `forwardedHeaders.trustedIPs` it discards client-supplied
`X-Forwarded-*` headers. Add labels to the `app` service in a `docker-compose.override.yml`
(and join Traefik's network):

```yaml
services:
  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.nusaquest.rule=Host(`quiz.example.ac.id`)
      - traefik.http.routers.nusaquest.entrypoints=websecure
      - traefik.http.routers.nusaquest.tls.certresolver=letsencrypt
      - traefik.http.services.nusaquest.loadbalancer.server.port=3000
```

For uploads, make sure no `buffering` middleware limits request bodies below 3 MB.

**Check any proxy** end to end with the shared demo. Sign in as a lecturer and open
`https://quiz.example.ac.id/host/session/demo` in a browser. That starts the server demo
(PIN 482913); in database mode only a signed-in lecturer can start and drive it. Then,
from any terminal:

```bash
BASE=https://quiz.example.ac.id
curl -fsS -X POST "$BASE/api/rooms/482913/join" -H 'content-type: application/json' \
  -d '{"nickname":"ProxyCheck","avatarSeed":"proxy"}'         # copy credentials.playerId and .token
curl -N -X POST "$BASE/api/sessions/demo/events" -H 'content-type: application/json' \
  -d '{"playerId":"<playerId>","token":"<token>"}'
```

The last command must print a `data: {"type":"snapshot",…}` frame **immediately**, then a
frame each time a simulated student joins, and `: ping` every 15 s. A long silence followed
by everything at once means the proxy is buffering.

---

## 8. Backups and restore

What to protect: the **database** (`pgdata`), the **uploads** volume, and your **`.env`**
(store it in the team's password manager; without `POSTGRES_PASSWORD` a restored volume
is unreadable).

**Create the backup folder yourself first**, as the deploy user: `mkdir -p backups && chmod 700 backups`.
The backup container and the systemd timer both run as root; if they create the folder, it
belongs to root and a later `bash deploy/backup/backup.sh` fails with _Permission denied_
(fix: `sudo chown "$USER": backups && chmod 700 backups`). Mode 700 also keeps the dumps,
which contain password hashes and student nicknames, away from other users on the host.
A dump written by root may need `sudo` to restore.

**Option 1: compose profile** (a container that loops):

```bash
mkdir -p backups && chmod 700 backups
docker compose --profile backup up -d
ls backups/     # nusaquest-<UTC>.dump + uploads-<UTC>.tar.gz, first run immediately, then daily
```

Tune with `BACKUP_INTERVAL_SECONDS` (default 86400), `BACKUP_KEEP_DAYS` (14) and
`BACKUP_DIR` (`./backups`). Script: [`deploy/backup/backup-loop.sh`](../deploy/backup/backup-loop.sh).

**Option 2: systemd timer on the host** (exact time, e.g. 02:30):

```bash
sudo cp deploy/systemd/nusaquest-backup.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nusaquest-backup.timer
bash deploy/backup/backup.sh     # a manual backup, same output, any time (e.g. before an update)
```

**Off-site copies.** A backup on the same virtual disk is not a backup. Sync `backups/` to
a NAS or Proxmox Backup Server (`rsync`, `restic`, or a PBS client job). Proxmox `vzdump`
snapshots of the whole VM are a good _additional_ layer (fast full-VM recovery), but keep
the logical `pg_dump` files: they restore into any PostgreSQL 17 and survive a broken VM image.

**Restore** (stops the app, replaces the database in one transaction, optionally replaces
the uploads, starts the app; newer migrations are re-applied automatically):

```bash
bash deploy/backup/restore.sh backups/nusaquest-20260928T190000Z.dump \
                              backups/uploads-20260928T190000Z.tar.gz
```

Manual equivalent:

```bash
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges \
  --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/nusaquest-<ts>.dump
docker compose run --rm --no-deps -T --entrypoint sh app \
  -c 'find /app/data/uploads -mindepth 1 -delete && tar -xzf - -C /app/data/uploads' < backups/uploads-<ts>.tar.gz
docker compose up -d app
```

**Rehearse a restore once per semester** on a scratch VM (clone the repo, copy `.env`, `up
-d`, run `restore.sh`, sign in, open a report).

**Data retention (UU PDP No. 27/2022).** Players provide only a nickname, but answers are
still personal data about a class. Agree a retention period with BINUS and enforce it.
Deleting a finished session cascades to its players, answers, snapshots and events; live
rooms (`lobby`, `running`) are never touched. Replace `12 months` with the agreed period:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "delete from game_sessions where status in ('"'"'finished'"'"', '"'"'ended'"'"') and created_at < now() - interval '"'"'12 months'"'"';"'
```

---

## 9. Updates and rollback

```bash
cd /opt/nusaquest
bash deploy/backup/backup.sh                  # safety net first (backups/ must belong to you, see §8)
git pull
docker compose up -d --build                  # builds while the old container keeps serving
docker compose ps                             # app turns "healthy"
curl -s http://localhost:3000/api/health      # "mode":"database", "db":"up"
docker image prune -f                         # reclaim old image layers
```

To see the deployed commit in `/api/health`, pass `APP_VERSION` on the **same** command
that builds and starts: `APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build`.
A separate `docker compose build` followed by `docker compose up -d` does not work: compose
then sets an empty runtime `APP_VERSION`, which overrides the built-in value (see §11).

- **Migrations run automatically** at start (Drizzle, SQL files in `drizzle/`), guarded by a
  PostgreSQL advisory lock. There is no separate migrate step.
- **Downtime** is the container restart (~5–15 s). On SIGTERM the app saves every live
  game, closes the event streams and exits within ~3 s (it never waits out
  `stop_grace_period`); the new container restores the games and phones reconnect by
  themselves ("Tersambung ulang…" → "Kembali ke permainan.").
  Still, avoid updating during lecture hours.
- **Base images**: every few weeks, `docker compose build --pull app && docker compose pull db
caddy && docker compose up -d` picks up Node.js/Alpine/PostgreSQL security fixes (same
  PostgreSQL major version; a major upgrade, e.g. 17 → 18, needs a dump and restore).
- **Rollback**: `git checkout <previous tag> && docker compose up -d --build`. This needs a
  tag per deployed release (`git tag -a v0.1.1 -m …`, pushed with `git push origin v0.1.1`);
  run `git checkout main` before the next `git pull`. Migrations are forward-only; if the
  release you are leaving added one that the old code cannot handle, restore the backup
  taken before the update.
- **Prebuilt images** (optional): build in CI, push to a private registry (Harbor, Gitea,
  GitLab), set `image:` / `APP_IMAGE_TAG` accordingly and use `docker compose pull && up -d`.
  Remember that `NEXT_PUBLIC_*` values are baked into each image.

---

## 10. Monitoring and logs

`GET /api/health` is the single probe (Docker `HEALTHCHECK`, compose, proxies, uptime
monitors). It is cheap, never cached, and answers within ~2 s even if PostgreSQL hangs:

| Field                      | Meaning                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `ok`                       | `false` (HTTP **503**) only when database mode cannot reach PostgreSQL |
| `mode`                     | `database` (DATABASE_URL set) or `memory`                              |
| `db`                       | `up`, `down`, or `off` (memory mode)                                   |
| `sessions` / `subscribers` | live games in memory / open event streams (≈ connected screens)        |
| `version`                  | `APP_VERSION` (e.g. git SHA) or the `package.json` version             |

- **Uptime Kuma** (self-hosted): HTTP(s) keyword monitor on `/api/health`, keyword
  `"ok":true`, 60 s interval, alert to the IT team's chat.
- **Logs**: `docker compose logs -f app` (errors, plus the admin bootstrap messages on the
  very first boot; successful migrations log nothing) and `docker compose logs db`. Compose
  rotates them (10 MB × 5 files per service).
- **Resources**: `docker stats`, Proxmox VM summary graphs; database size with
  `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select pg_size_pretty(pg_database_size(current_database()))"'`.
- **Before a big event**: watch `subscribers` during a rehearsal, run a dry run with 20+
  real phones on the venue Wi-Fi, and keep PIN `482913` (solo demo) as a fallback.

---

## 11. Environment reference

Runtime variables are read by the server at start (change → `docker compose up -d`).
Build variables are compiled into the browser bundle (change → `docker compose up -d --build`).

| Variable                                                      | Kind                | Default                                             | Purpose                                                                                     |
| ------------------------------------------------------------- | ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_DB`                               | compose             | `nusaquest`                                         | database role and name of the bundled `db`                                                  |
| `POSTGRES_PASSWORD`                                           | compose, **secret** | (required)                                          | database password; letters+digits (goes into a URL)                                         |
| `DATABASE_URL`                                                | runtime, **secret** | empty = memory mode                                 | set by compose automatically; for `npm run dev` / bare Node                                 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                              | runtime, **secret** | empty                                               | first admin, only while no user exists (password ≥ 8 chars)                                 |
| `ADMIN_NAME`                                                  | runtime             | `Administrator`                                     | that admin's display name                                                                   |
| `APP_URL`                                                     | runtime             | `NEXT_PUBLIC_APP_URL`                               | canonical public origin (join address shown to hosts)                                       |
| `SESSION_COOKIE_SECURE`                                       | runtime             | `auto`                                              | `auto` (Secure over HTTPS via `X-Forwarded-Proto`) \| `true` \| `false`                     |
| `TRUST_PROXY`                                                 | runtime             | `false`                                             | `true` behind a proxy that overwrites `X-Forwarded-For` (only `true`/`1`/`false`/`0`)       |
| `UPLOAD_DIR`                                                  | runtime             | `/app/data/uploads` (image), `./data/uploads` (dev) | question images                                                                             |
| `TZ`                                                          | runtime             | `Asia/Jakarta`                                      | logs, backup timestamps, server-rendered dates                                              |
| `APP_VERSION`                                                 | build + runtime     | `package.json` version                              | reported by `/api/health`; set it in `.env`, or on the same command as `up -d --build` (§9) |
| `NEXT_PUBLIC_APP_URL`                                         | build               | empty = page origin                                 | origin encoded in lobby QR codes                                                            |
| `NEXT_PUBLIC_REALTIME_MODE`                                   | build               | `server`                                            | `server` (multi-device) \| `local` (single-browser demo build)                              |
| `NEXT_PUBLIC_BINUS_LOGO_SRC`                                  | build               | empty = placeholder                                 | official logo path, e.g. `/brand/binus.svg`                                                 |
| `APP_PORT`                                                    | compose             | `3000`                                              | host port; `127.0.0.1:3000` to hide the app behind a local proxy                            |
| `DOMAIN`                                                      | compose (`https`)   | empty                                               | Caddy site address (the `caddy` service exits while it is unset)                            |
| `COMPOSE_PROFILES`                                            | compose             | empty                                               | profiles enabled on every `docker compose up`, e.g. `https,backup`                          |
| `BACKUP_INTERVAL_SECONDS` / `BACKUP_KEEP_DAYS` / `BACKUP_DIR` | compose (`backup`)  | `86400` / `14` / `./backups`                        | backup loop                                                                                 |
| `APP_IMAGE_TAG`                                               | compose             | `local`                                             | tag of the built/pulled app image                                                           |
| `DB_PORT`                                                     | dev overlay         | `5432`                                              | loopback port for `npm run db:up`                                                           |
| `PORT`, `HOSTNAME`                                            | runtime             | `3000`, `0.0.0.0` (image)                           | standalone server bind address; leave as is in Docker                                       |

---

## 12. Troubleshooting

| Symptom                                                                   | Likely cause                                                                                                                           | Fix                                                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` says `required variable POSTGRES_PASSWORD is missing` | no `.env` or empty value                                                                                                               | `cp .env.example .env`, set it                                                                                                                                |
| `app` unhealthy, health shows `"db":"down"`                               | db not ready, or `POSTGRES_PASSWORD` changed after the volume was created                                                              | `docker compose logs db`; the password is fixed at first init: change it with `ALTER USER` inside Postgres, or (fresh installs only) `docker compose down -v` |
| Log: `no lecturer accounts yet: set ADMIN_EMAIL and ADMIN_PASSWORD`       | bootstrap variables missing                                                                                                            | set both, `docker compose up -d`; or create a user with `bash deploy/users.sh add`                                                                            |
| Admin not created although variables are set                              | a user already exists (bootstrap runs only on an empty table), or password < 8 chars / invalid email (see log)                         | `bash deploy/users.sh list`, `reset-password`                                                                                                                 |
| Forgot the admin password                                                 |                                                                                                                                        | `bash deploy/users.sh reset-password <email>`                                                                                                                 |
| Phones cannot open the site                                               | routing/firewall/guest-SSID isolation, wrong IP in the QR code                                                                         | phone test `http://<server>:3000/api/health`; §6; set `NEXT_PUBLIC_APP_URL` and rebuild                                                                       |
| QR code points to `localhost`                                             | projector page opened on localhost and `NEXT_PUBLIC_APP_URL` empty                                                                     | open the host screen via the server's name/IP, or set `NEXT_PUBLIC_APP_URL` and rebuild                                                                       |
| Players stuck on "Tersambung ulang…", events arrive in bursts             | proxy buffers or compresses the SSE stream, or times it out                                                                            | §7: `proxy_buffering off`, no gzip, `proxy_read_timeout 1h` for `/api/sessions/*/events`                                                                      |
| Sign-in succeeds but the next page asks to sign in again                  | `SESSION_COOKIE_SECURE=true` on plain HTTP (browser drops the cookie)                                                                  | use HTTPS, or `auto`/`false` on a plain-HTTP LAN                                                                                                              |
| Lecturer actions fail with 403 `cross_origin`                             | the request came from another origin (page embedded elsewhere; on old browsers without `Sec-Fetch-Site`, a proxy that rewrites `Host`) | open the app via `APP_URL`; pass `Host` through (`proxy_set_header Host $host`)                                                                               |
| Many students get "too many attempts" when joining                        | all traffic appears to come from one IP (proxy without `TRUST_PROXY=true`, or NAT)                                                     | set `TRUST_PROXY=true` behind a proxy that overwrites `X-Forwarded-For`                                                                                       |
| Image upload fails with 413                                               | proxy body limit                                                                                                                       | `client_max_body_size 3m` (nginx/NPM)                                                                                                                         |
| Image upload fails with EACCES                                            | uploads bind-mounted from a host folder not owned by uid 1000                                                                          | `sudo chown -R 1000:1000 <folder>`, or use the named `uploads` volume                                                                                         |
| `docker build` fails at fonts / npm                                       | no outbound internet during build                                                                                                      | allow egress or pass `HTTP_PROXY`/`HTTPS_PROXY` build args (§4)                                                                                               |
| Docker fails to start in LXC                                              | nesting/keyctl not enabled, or storage driver                                                                                          | `pct set <vmid> --features nesting=1,keyctl=1`; see §1, or use a VM                                                                                           |
| Times in reports are off by 7 hours                                       | container time zone                                                                                                                    | `TZ=Asia/Jakarta` in `.env` (default in compose)                                                                                                              |
| Port 3000 already in use                                                  | another service on the host                                                                                                            | `APP_PORT=3001` (and update `APP_URL`)                                                                                                                        |

---

## 13. Running without Docker

Possible, but you then own Node.js and PostgreSQL upgrades yourself:

```bash
# Node.js 24 LTS and PostgreSQL 17 installed on the host; a database + role created
npm ci
NEXT_PUBLIC_APP_URL=https://quiz.example.ac.id npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/ && cp -r drizzle .next/standalone/
cd .next/standalone
DATABASE_URL=postgres://nusaquest:<pw>@127.0.0.1:5432/nusaquest ADMIN_EMAIL=… ADMIN_PASSWORD=… \
  APP_URL=https://quiz.example.ac.id UPLOAD_DIR=/var/lib/nusaquest/uploads \
  PORT=3000 HOSTNAME=0.0.0.0 node server.js
```

Wrap the last command in a systemd service (`Restart=always`, `EnvironmentFile=`), and put
nginx or Caddy in front as in §7. `deploy/users.sh` and the backup scripts assume the compose
stack; with a bare install use `pg_dump`/`pg_restore` directly.
