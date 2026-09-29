import type { PlayerCredentials } from "./types";

/**
 * Player identity for the lifetime of one session. Stored in localStorage so it
 * survives refreshes and brief tab kills; scoped per session id and cleared when
 * the game ends. The token is an opaque bearer secret (the server keeps a hash).
 */

const PREFIX = "nq:cred:";
const LAST = "nq:cred:last";

export function saveCredentials(c: PlayerCredentials) {
  try {
    window.localStorage.setItem(PREFIX + c.sessionId, JSON.stringify(c));
    window.localStorage.setItem(LAST, c.sessionId);
  } catch {
    /* private mode: identity lasts for this page only */
  }
}

export function loadCredentials(sessionId: string): PlayerCredentials | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as PlayerCredentials) : null;
  } catch {
    return null;
  }
}

export function loadCredentialsByRoom(roomCode: string): PlayerCredentials | null {
  try {
    const last = window.localStorage.getItem(LAST);
    const c = last ? loadCredentials(last) : null;
    return c && c.roomCode === roomCode ? c : null;
  } catch {
    return null;
  }
}

export function clearCredentials(sessionId: string) {
  try {
    window.localStorage.removeItem(PREFIX + sessionId);
    if (window.localStorage.getItem(LAST) === sessionId) window.localStorage.removeItem(LAST);
  } catch {
    /* ignore */
  }
}

/** Remember the nickname/avatar a student used last time to pre-fill the profile step. */
const PROFILE = "nq:profile";
export function saveProfile(p: { nickname: string; avatarSeed: string }) {
  try {
    window.localStorage.setItem(PROFILE, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
export function loadProfile(): { nickname: string; avatarSeed: string } | null {
  try {
    const raw = window.localStorage.getItem(PROFILE);
    return raw ? (JSON.parse(raw) as { nickname: string; avatarSeed: string }) : null;
  } catch {
    return null;
  }
}
