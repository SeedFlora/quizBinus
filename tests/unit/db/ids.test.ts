import { describe, expect, it } from "vitest";
import { stableUuid } from "@/lib/db/ids";
import { isUuid } from "@/lib/db/errors";

/**
 * Golden values from the previous implementation (WebCrypto in the browser and the
 * SQL seed function). Keeping them proves ids derived for readable quiz ids never
 * change between releases.
 */
const GOLDEN: Record<string, string> = {
  "quiz:os-battle": "45f95174-1d21-882f-81e4-bb5fc1c39048",
  "quiz:cloud-fundamentals": "b103dfdd-b99e-8bf7-b026-c3df5203fc0e",
  "quiz:algo-loops": "25e5928d-7ba0-8ec8-9161-ece6783cae35",
  "quiz:netw-osi": "1d409622-5215-8d40-98a6-f1a3b35f3cc2",
  "quiz:ai-search": "90a3f1d7-231b-8778-b6fb-d35a6004c7da",
  "question:os-q01": "58090a10-1322-8d9b-ad93-af3f2fe28f70",
  "answer:os-q01-a2": "76f7f721-5f1a-864f-bb5f-c168f202d5c8",
};

describe("stableUuid", () => {
  it.each(Object.entries(GOLDEN))("%s → %s", (key, expected) => {
    expect(stableUuid(key)).toBe(expected);
  });

  it("produces RFC 9562 version-8 uuids", () => {
    const id = stableUuid("anything");
    expect(isUuid(id)).toBe(true);
    expect(id.charAt(14)).toBe("8");
    expect("89ab").toContain(id.charAt(19));
  });
});

describe("isUuid", () => {
  it("accepts uuids in any case and rejects readable ids", () => {
    expect(isUuid("45F95174-1D21-882F-81E4-BB5FC1C39048")).toBe(true);
    expect(isUuid("os-battle")).toBe(false);
    expect(isUuid("demo")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
