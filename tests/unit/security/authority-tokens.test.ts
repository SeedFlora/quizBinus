import { afterEach, describe, expect, it } from "vitest";
import { GameAuthority, type PersistedAuthority } from "@/lib/realtime/authority";
import { GameEngine } from "@/lib/game/engine";
import { sha256Hex } from "@/lib/security/sha256";
import { question, quiz } from "../../fixtures/quiz";

/**
 * TOKEN RULE: a player's token exists only on their device. The authority keeps
 * sha256(token), so persisted state (Postgres game_sessions.engine_state, the local
 * demo's localStorage) never holds a usable credential.
 */

const authorities: GameAuthority[] = [];

function fresh(
  tokens: Record<string, string> = {},
  engine = GameEngine.create({
    sessionId: "sess-tokens",
    roomCode: "482913",
    hostName: "Bu Laras",
    quiz: quiz([question("single", { id: "q1" })]),
    now: Date.now(),
  }),
): { authority: GameAuthority; saved: PersistedAuthority[] } {
  const saved: PersistedAuthority[] = [];
  const authority = new GameAuthority(
    { engine: engine.serialize(), tokens },
    {
      onEvent: () => undefined,
      onChange: (state) => saved.push(state),
    },
  );
  authorities.push(authority);
  return { authority, saved };
}

afterEach(() => {
  authorities.splice(0).forEach((a) => a.dispose());
});

describe("GameAuthority token hashing", () => {
  it("persists only the sha256 of each player token", () => {
    const { authority, saved } = fresh();
    const joined = authority.join({ nickname: "Rara", avatarSeed: "r" });
    if (!joined.ok) throw new Error(joined.error);
    const { playerId, token } = joined.credentials;

    const persisted = authority.persisted();
    expect(persisted.tokens[playerId]).toBe(sha256Hex(token));
    for (const state of [persisted, ...saved]) {
      expect(JSON.stringify(state)).not.toContain(token);
      for (const stored of Object.values(state.tokens)) expect(stored).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("verifies a presented token against the hash, and a hash is not itself a credential", () => {
    const { authority } = fresh();
    const joined = authority.join({ nickname: "Rara", avatarSeed: "r" });
    if (!joined.ok) throw new Error(joined.error);
    const c = joined.credentials;
    expect(authority.verify(c)).toBe(true);
    // Someone who read the database cannot replay the stored hash as a token.
    expect(authority.verify({ playerId: c.playerId, token: authority.persisted().tokens[c.playerId]! })).toBe(false);
    expect(authority.verify({ playerId: c.playerId, token: "" })).toBe(false);
    expect(authority.verify({ playerId: "constructor", token: c.token })).toBe(false);
    expect(authority.verify({ playerId: "__proto__", token: c.token })).toBe(false);
  });

  it("restores hashed tokens as-is and upgrades raw tokens saved before hashing", () => {
    const { authority: first } = fresh();
    const joined = first.join({ nickname: "Rara", avatarSeed: "r" });
    if (!joined.ok) throw new Error(joined.error);
    const c = joined.credentials;
    const snapshot = first.persisted();

    // Restart from the persisted (hashed) state: the player's token still works.
    const { authority: restored } = fresh(snapshot.tokens, GameEngine.restore(snapshot.engine));
    expect(restored.verify(c)).toBe(true);

    // A legacy save held the raw token: it is hashed on load and keeps working.
    const { authority: legacy } = fresh({ [c.playerId]: c.token }, GameEngine.restore(snapshot.engine));
    expect(legacy.persisted().tokens[c.playerId]).toBe(sha256Hex(c.token));
    expect(legacy.verify(c)).toBe(true);
  });

  it("bots answer through their registered (hashed) identity", () => {
    const { authority } = fresh();
    expect(authority.addBot({ id: "demo-p01", nickname: "rara.tiara", avatarSeed: "b" })).toBe(true);
    expect(authority.persisted().tokens["demo-p01"]).toMatch(/^[0-9a-f]{64}$/);
    authority.start();
    authority.publishQuestion();
    expect(authority.submitAsBot("demo-p01", "q1", { kind: "choice", answerIds: ["q1-a1"] })).toMatchObject({
      status: "accepted",
    });
    expect(authority.submitAsBot("ghost", "q1", { kind: "choice", answerIds: ["q1-a1"] })).toEqual({
      status: "invalid",
      reason: "unknown_player",
    });
  });
});
