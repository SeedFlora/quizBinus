import { describe, expect, it } from "vitest";
import { firstName } from "@/components/creator/profile-schema";

describe("firstName (dashboard greeting)", () => {
  it.each([
    ["Laras Wicaksono", "Laras"],
    ["Dr. Rina Wijaya", "Rina"],
    ["Prof. Dr. Ir. Budi Santoso", "Budi"],
    ["  Dewi  ", "Dewi"],
    ["Administrator", "Administrator"],
    ["Dr.", "Dr"],
  ])("%s → %s", (full, expected) => {
    expect(firstName(full)).toBe(expected);
  });
});
