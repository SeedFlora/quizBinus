import { describe, expect, it } from "vitest";
import { safeNextPath, seeOther } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each([
    ["/quizzes/os-battle/edit", "/quizzes/os-battle/edit"],
    ["/dashboard?tab=1", "/dashboard?tab=1"],
    ["/host/session/2f1d/lobby", "/host/session/2f1d/lobby"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["/dash\nboard", "/dashboard"],
    ["/dash\tboard", "/dashboard"],
    ["dashboard", "/dashboard"],
    ["/login?next=/x", "/dashboard"],
    ["/auth/signout", "/dashboard"],
    ["", "/dashboard"],
    [undefined, "/dashboard"],
    [42, "/dashboard"],
    [`/${"a".repeat(600)}`, "/dashboard"],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("https://evil.example", "")).toBe("");
  });
});

describe("seeOther", () => {
  it("answers 303 with a relative Location", () => {
    const res = seeOther("/login");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
