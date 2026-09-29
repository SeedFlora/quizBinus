/** UUID v4 for session/player ids. */
export function randomId(): string {
  return globalThis.crypto.randomUUID();
}

/** 256-bit url-safe secret used as a player token. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
