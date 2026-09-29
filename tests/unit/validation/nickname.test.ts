import { describe, expect, it } from "vitest";
import { NICKNAME_MAX, nicknameKey, sanitizeNickname } from "@/lib/validation/nickname";

const value = (raw: string) => {
  const r = sanitizeNickname(raw);
  if (!r.ok) throw new Error(`expected ok for ${JSON.stringify(raw)}, got ${r.reason}`);
  return r.value;
};

describe("sanitizeNickname", () => {
  it.each([
    ["rara.tiara", "rara.tiara"],
    ["Bima S.", "Bima S."],
    ["Kevin_T", "Kevin_T"],
    ["Made Wirā", "Made Wirā"],
    ["Ni Luh Putu Ayu", "Ni Luh Putu Ayu"],
    ["O'Brien", "OBrien"], // quote characters are always stripped
    ["andre99", "andre99"],
    ["Asuka", "Asuka"], // contains "asu" but is a real name
    ["張偉", "張偉"],
  ])("allows real names: %j", (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it("collapses whitespace and trims", () => {
    expect(value("   Siti    Aisyah  ")).toBe("Siti Aisyah");
  });

  it("strips HTML tags and markup characters", () => {
    expect(value("<b>Bima</b>")).toBe("Bima");
    expect(value('<img src=x onerror="alert(1)">Rara')).toBe("Rara");
    expect(value("<script>x</script>Nadia")).toBe("xNadia");
    // Leftover script text with punctuation is refused outright rather than "cleaned".
    expect(sanitizeNickname("<script>alert(1)</script>Nadia")).toEqual({ ok: false, reason: "invalid" });
    expect(sanitizeNickname("<script></script>")).toEqual({ ok: false, reason: "invalid" });
  });

  it("never returns markup characters", () => {
    for (const raw of ['Ra"ra', "Ra`ra", "Ra\\ra", "{Rara}", "<Rara", "Rara>"]) {
      const r = sanitizeNickname(raw);
      if (r.ok) expect(r.value).not.toMatch(/[<>"`\\{}]/);
    }
  });

  it("removes zero-width and bidi-override characters", () => {
    expect(value("Ra​ra")).toBe("Rara");
    expect(value("‮arar")).toBe("arar");
  });

  it("rejects symbols outside the friendly set", () => {
    expect(sanitizeNickname("rara!")).toEqual({ ok: false, reason: "invalid" });
    expect(sanitizeNickname("🔥🔥")).toEqual({ ok: false, reason: "invalid" });
    expect(sanitizeNickname("a@b")).toEqual({ ok: false, reason: "invalid" });
  });

  it("enforces 2..20 characters (counted as code points)", () => {
    expect(sanitizeNickname("A")).toEqual({ ok: false, reason: "invalid" });
    expect(sanitizeNickname("   ")).toEqual({ ok: false, reason: "invalid" });
    expect(value("Al")).toBe("Al");
    expect(value("x".repeat(NICKNAME_MAX))).toHaveLength(NICKNAME_MAX);
    expect(sanitizeNickname("x".repeat(NICKNAME_MAX + 1))).toEqual({ ok: false, reason: "invalid" });
    expect(value("Wirā".repeat(5))).toBe("Wirā".repeat(5));
  });

  it.each(["anjing", "Bangsat123", "b4ngs4t", "Fuck_you", "sh1t", "si goblok", "asu", "Admin", "HOST", "dosen"])(
    "blocks %j",
    (raw) => {
      expect(sanitizeNickname(raw)).toEqual({ ok: false, reason: "blocked" });
    },
  );

  it("normalizes compatibility forms (NFKC) before checking", () => {
    // full-width letters fold to ASCII
    expect(value("Ｒａｒａ")).toBe("Rara");
  });
});

describe("nicknameKey", () => {
  it("is case- and whitespace-insensitive for uniqueness", () => {
    expect(nicknameKey("Rara Tiara")).toBe(nicknameKey("  rara   TIARA "));
    expect(nicknameKey("Ｒａｒａ")).toBe(nicknameKey("rara"));
    expect(nicknameKey("Rara")).not.toBe(nicknameKey("Rara2"));
  });
});
