import { describe, expect, it } from "vitest";
import {
  answerBodySchema,
  answerPayloadSchema,
  hostCommandBodySchema,
  joinBodySchema,
  playerActionBodySchema,
} from "@/lib/validation/api";

const auth = { playerId: "4f1c2b7e-8a9d-4c3b-9e2f-1a2b3c4d5e6f", token: "x".repeat(43) };

describe("API request schemas", () => {
  it("accepts every AnswerPayload kind", () => {
    for (const payload of [
      { kind: "choice", answerIds: ["os-q01-a2"] },
      { kind: "text", value: "Round Robin" },
      { kind: "number", value: 42.5 },
      { kind: "order", answerIds: ["a", "b", "c"] },
    ]) {
      expect(answerPayloadSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects oversized or malformed payloads", () => {
    expect(answerPayloadSchema.safeParse({ kind: "text", value: "x".repeat(121) }).success).toBe(false);
    expect(
      answerPayloadSchema.safeParse({ kind: "choice", answerIds: Array.from({ length: 13 }, (_, i) => `a${i}`) })
        .success,
    ).toBe(false);
    expect(answerPayloadSchema.safeParse({ kind: "choice", answerIds: ["<script>"] }).success).toBe(false);
    expect(answerPayloadSchema.safeParse({ kind: "number", value: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(answerPayloadSchema.safeParse({ kind: "vote", value: 1 }).success).toBe(false);
  });

  it("needs player credentials on player bodies", () => {
    expect(
      answerBodySchema.safeParse({ ...auth, questionId: "q1", payload: { kind: "number", value: 1 } }).success,
    ).toBe(true);
    expect(
      answerBodySchema.safeParse({ ...auth, token: "short", questionId: "q1", payload: { kind: "number", value: 1 } })
        .success,
    ).toBe(false);
    expect(playerActionBodySchema.safeParse({ ...auth, action: "resume" }).success).toBe(true);
    expect(playerActionBodySchema.safeParse({ ...auth, playerId: "p1", action: "resume" }).success).toBe(false);
  });

  it("requires a player for kick only", () => {
    expect(hostCommandBodySchema.safeParse({ command: "start" }).success).toBe(true);
    expect(hostCommandBodySchema.safeParse({ command: "kick" }).success).toBe(false);
    expect(hostCommandBodySchema.safeParse({ command: "kick", playerId: auth.playerId }).success).toBe(true);
    expect(hostCommandBodySchema.safeParse({ command: "selfDestruct" }).success).toBe(false);
  });

  it("bounds join input (the nickname is sanitized separately)", () => {
    expect(joinBodySchema.safeParse({ nickname: "Budi", avatarSeed: "k3j9x2" }).success).toBe(true);
    expect(joinBodySchema.safeParse({ nickname: "Budi", avatarSeed: "" }).success).toBe(false);
    expect(joinBodySchema.safeParse({ nickname: "Budi", avatarSeed: "<img>" }).success).toBe(false);
    expect(joinBodySchema.safeParse({ nickname: "x".repeat(65), avatarSeed: "a" }).success).toBe(false);
  });
});
