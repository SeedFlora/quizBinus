import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEqual, sha256Bytes, sha256Hex } from "@/lib/security/sha256";

/** FIPS 180-4 / NIST CAVP known answers. */
const VECTORS: Array<[string, string]> = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  ],
  ["The quick brown fox jumps over the lazy dog", "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"],
];

describe("sha256 (pure TypeScript, sync)", () => {
  it.each(VECTORS)("known answer for %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("one million 'a' (multi-block, length > 2^16 bits)", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });

  it("matches node:crypto around every padding boundary and for UTF-8 text", () => {
    for (let length = 0; length <= 130; length++) {
      const bytes = randomBytes(length);
      expect(sha256Hex(bytes), `length ${length}`).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    for (const text of ["Nadia ✨ Rê", "Siti Aisyah — ujian", "🎓 NUSAQUEST", "\u0000￿"]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });

  it("returns 32 raw bytes", () => {
    expect(sha256Bytes(new Uint8Array())).toHaveLength(32);
  });
});

describe("constantTimeEqual", () => {
  it("compares whole strings", () => {
    const a = sha256Hex("token-a");
    expect(constantTimeEqual(a, a)).toBe(true);
    expect(constantTimeEqual(a, sha256Hex("token-b"))).toBe(false);
    expect(constantTimeEqual(a, `${a.slice(0, -1)}0`)).toBe(a.endsWith("0"));
    expect(constantTimeEqual(a, a.slice(1))).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
