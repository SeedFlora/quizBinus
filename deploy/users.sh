#!/usr/bin/env bash
# NUSAQUEST account management from the server shell (database mode, compose stack running).
# Day to day, admins manage accounts in the app (Settings → Accounts). Use this script when
# nobody can sign in (forgotten admin password), for automation, or for bulk changes.
#
#   bash deploy/users.sh list
#   bash deploy/users.sh add <email> "<full name>" [lecturer|admin]    # prompts for a password
#   bash deploy/users.sh reset-password <email>                         # prompts; signs the user out everywhere
#   bash deploy/users.sh disable <email>                                # blocks sign-in, ends their sessions
#   bash deploy/users.sh enable <email>
#   bash deploy/users.sh role <email> <lecturer|admin>
#
# Non-interactive: NQ_PASSWORD='…' bash deploy/users.sh add … (the value never appears in
# the process list: it is piped to the hashing step over stdin).
#
# Passwords are hashed inside the app container with the exact scheme of
# lib/auth/password.ts (scrypt N=16384 r=8 p=1, 64-byte key, 16-byte salt, NFKC), then
# written with psql inside the db container. Nothing is sent over the network.

set -euo pipefail
# Git Bash on Windows would rewrite container paths such as /app/data/uploads; no-op on Linux.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MIN_LENGTH=8   # PASSWORD_MIN_LENGTH in lib/auth/password.ts
MAX_LENGTH=256 # PASSWORD_MAX_LENGTH

usage() {
  sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 64
}

die() {
  echo "error: $*" >&2
  exit 1
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# psql inside the db container; user and database come from the container's own env.
psql_db() {
  docker compose exec -T db sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

read_password() {
  if [ -n "${NQ_PASSWORD:-}" ]; then
    PASSWORD="$NQ_PASSWORD"
  else
    [ -t 0 ] || die "no terminal: set NQ_PASSWORD for non-interactive use"
    read -r -s -p "New password: " PASSWORD
    echo
    read -r -s -p "Repeat password: " again
    echo
    [ "$PASSWORD" = "$again" ] || die "passwords do not match"
  fi
  [ "${#PASSWORD}" -ge "$MIN_LENGTH" ] || die "password must be at least $MIN_LENGTH characters"
  [ "${#PASSWORD}" -le "$MAX_LENGTH" ] || die "password must be at most $MAX_LENGTH characters"
}

# Prints scrypt$16384$8$1$<salt>$<hash> for the password given on stdin.
HASH_JS="$(
  cat <<'JS'
const c = require("node:crypto");
let s = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const N = 16384, r = 8, p = 1;
  const salt = c.randomBytes(16);
  const key = c.scryptSync(s.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 256 * N * r });
  process.stdout.write(["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$"));
});
JS
)"

hash_password() {
  printf '%s' "$PASSWORD" | docker compose exec -T app node -e "$HASH_JS" ||
    die "hashing failed: is the app container running? (docker compose ps)"
}

require_email() {
  [ -n "${1:-}" ] || usage
  EMAIL="$(lower "$1")"
  [[ "$EMAIL" == *@*.* ]] || die "not an email address: $1"
}

# Refuses to disable or demote the last active admin (the app enforces the same rule).
guard_last_admin() {
  local state
  state="$(
    psql_db -tA -v email="$EMAIL" <<'SQL'
select case
  when not exists (select 1 from users where email = :'email') then 'missing'
  when exists (select 1 from users where email = :'email' and role = 'admin' and not disabled)
       and (select count(*) from users where role = 'admin' and not disabled) <= 1 then 'last-admin'
  else 'ok'
end;
SQL
  )"
  case "$state" in
    ok) ;;
    missing) die "no such user: $EMAIL" ;;
    *) die "$EMAIL is the last active admin; create or enable another admin first" ;;
  esac
}

require_role() {
  case "${1:-}" in
    lecturer | admin) ROLE="$1" ;;
    *) die "role must be 'lecturer' or 'admin'" ;;
  esac
}

cmd="${1:-}"
[ -n "$cmd" ] || usage
shift

case "$cmd" in
  list)
    psql_db -P pager=off <<'SQL'
select email,
       full_name as name,
       role,
       case when disabled then 'disabled' else 'active' end as status,
       to_char(last_login_at at time zone current_setting('TimeZone'), 'YYYY-MM-DD HH24:MI') as last_login,
       (select count(*) from quizzes q where q.owner_id = u.id) as quizzes
from users u
order by role, email;
SQL
    ;;

  add)
    require_email "${1:-}"
    NAME="${2:-}"
    [ -n "$NAME" ] || die "full name required: add <email> \"<full name>\" [lecturer|admin]"
    require_role "${3:-lecturer}"
    read_password
    HASH="$(hash_password)"
    psql_db -v email="$EMAIL" -v name="$NAME" -v role="$ROLE" -v hash="$HASH" <<'SQL'
insert into users (email, password_hash, full_name, role)
values (:'email', :'hash', :'name', :'role');
SQL
    echo "created $ROLE $EMAIL"
    ;;

  reset-password)
    require_email "${1:-}"
    read_password
    HASH="$(hash_password)"
    changed="$(
      psql_db -tA -v email="$EMAIL" -v hash="$HASH" <<'SQL'
with u as (update users set password_hash = :'hash', updated_at = now() where email = :'email' returning id),
     s as (delete from auth_sessions where user_id in (select id from u))
select count(*) from u;
SQL
    )"
    [ "$changed" = "1" ] || die "no such user: $EMAIL"
    echo "password changed for $EMAIL (existing sign-ins ended)"
    ;;

  disable | enable)
    require_email "${1:-}"
    flag=false
    if [ "$cmd" = "disable" ]; then
      flag=true
      guard_last_admin
    fi
    changed="$(
      psql_db -tA -v email="$EMAIL" -v flag="$flag" <<'SQL'
with u as (update users set disabled = :flag, updated_at = now() where email = :'email' returning id),
     s as (delete from auth_sessions where :flag and user_id in (select id from u))
select count(*) from u;
SQL
    )"
    [ "$changed" = "1" ] || die "no such user: $EMAIL"
    echo "${cmd}d $EMAIL"
    ;;

  role)
    require_email "${1:-}"
    require_role "${2:-}"
    [ "$ROLE" = "admin" ] || guard_last_admin
    changed="$(
      psql_db -tA -v email="$EMAIL" -v role="$ROLE" <<'SQL'
with u as (update users set role = :'role', updated_at = now() where email = :'email' returning id)
select count(*) from u;
SQL
    )"
    [ "$changed" = "1" ] || die "no such user: $EMAIL"
    echo "$EMAIL is now $ROLE"
    ;;

  -h | --help | help) usage ;;
  *) usage ;;
esac
