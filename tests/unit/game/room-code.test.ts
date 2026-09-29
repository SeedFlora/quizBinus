import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatRoomCode,
  generateRoomCode,
  isGuessable,
  isValidRoomCode,
  normalizeRoomInput,
  ROOM_CODE_PATTERN,
} from "@/lib/game/room-code";

/** Makes crypto.getRandomValues yield the given raw values (code = 100000 + v % 900000). */
function queueRandom(...raw: number[]) {
  const queue = [...raw];
  return vi
    .spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation(<T extends ArrayBufferView | null>(buf: T): T => {
      const next = queue.shift();
      if (next === undefined) throw new Error("random queue exhausted");
      (buf as unknown as Uint32Array)[0] = next;
      return buf;
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isValidRoomCode", () => {
  it("accepts six digits that do not start with 0", () => {
    expect(isValidRoomCode("482913")).toBe(true);
    expect(isValidRoomCode("100000")).toBe(true);
  });

  it.each(["082913", "48291", "4829130", "48 913", "abcdef", "", "４８２９１３"])("rejects %j", (code) => {
    expect(isValidRoomCode(code)).toBe(false);
  });
});

describe("isGuessable", () => {
  it.each(["111111", "121212", "112211", "123456", "987654", "234567", "385385", "900900"])("flags %s", (code) => {
    expect(isGuessable(code)).toBe(true);
  });

  it.each(["482913", "730418", "561209"])("allows %s", (code) => {
    expect(isGuessable(code)).toBe(false);
  });
});

describe("generateRoomCode", () => {
  it("produces valid, non-guessable codes", async () => {
    for (let i = 0; i < 200; i++) {
      const code = await generateRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(isGuessable(code)).toBe(false);
    }
  });

  it("skips guessable candidates", async () => {
    // 11111 → "111111" (guessable), 382913 → "482913"
    queueRandom(11_111, 382_913);
    await expect(generateRoomCode()).resolves.toBe("482913");
  });

  it("retries on collision with an active session", async () => {
    // "482913" is taken, then "730418" is free
    queueRandom(382_913, 630_418);
    const isTaken = vi.fn(async (code: string) => code === "482913");
    await expect(generateRoomCode(isTaken)).resolves.toBe("730418");
    expect(isTaken).toHaveBeenCalledTimes(2);
  });

  it("gives up after 50 attempts instead of looping forever", async () => {
    await expect(generateRoomCode(() => true)).rejects.toThrow("Could not allocate a room code");
  });
});

describe("normalizeRoomInput / formatRoomCode", () => {
  it("keeps digits only, max 6", () => {
    expect(normalizeRoomInput("482 913")).toBe("482913");
    expect(normalizeRoomInput("48-29-13-77")).toBe("482913");
    expect(normalizeRoomInput("abc")).toBe("");
  });

  it("formats 3 + 3 for display and leaves partial codes alone", () => {
    expect(formatRoomCode("482913")).toBe("482 913");
    expect(formatRoomCode("4829")).toBe("4829");
  });
});
