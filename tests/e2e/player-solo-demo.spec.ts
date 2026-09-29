/**
 * Player-only, on a phone (Pixel 7): a student opens the demo PIN with no projector
 * running. With no server demo live, the PIN falls back to the offline solo demo
 * (simulated class + virtual host in the phone's own tab), and the student plays a
 * question through to the result. Desktop runs the same fallback at the end of
 * server-demo.spec.ts, right after a lecturer ends the server demo.
 */

import { expect, test } from "@playwright/test";
import {
  DEMO_PIN,
  EXPECTED_API_STATUS,
  ID,
  answerCurrentQuestionWrong,
  endServerDemo,
  health,
  joinSoloDemo,
  lookupRoom,
  runTag,
  trackErrors,
} from "./helpers";

test("a student plays the solo demo from /join to a result", async ({ page, isMobile }) => {
  test.skip(!isMobile, "desktop: covered by server-demo.spec.ts (fallback after the lecturer ends the demo)");
  // Timer-driven (virtual host + simulated class): ~50 s per question on a warm server.
  test.slow();

  // Only the memory-mode server lets an anonymous caller end the shared demo.
  const { mode } = await health(page.request);
  if (mode === "memory") {
    const { lookup } = await endServerDemo(page.request);
    expect(lookup.status, "the demo PIN is free once the server demo has ended").toBe("not_found");
  } else {
    const lookup = await lookupRoom(page.request, DEMO_PIN);
    test.skip(lookup.status === "ok", "a server demo is live and only a signed-in lecturer can end it");
  }

  // The server lookup of the demo PIN answers 404 (no server demo): that is what triggers the fallback.
  const errors = trackErrors(page, [EXPECTED_API_STATUS]);
  const streams: string[] = [];
  const serverJoins: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/sessions/demo/events")) streams.push(r.url());
    if (r.method() === "POST" && r.url().endsWith(`/api/rooms/${DEMO_PIN}/join`)) serverJoins.push(r.url());
  });
  await joinSoloDemo(page, `Bima ${runTag()}`);
  // The demo is shared server state: if another client (a projector tab, a screenshot
  // script) opened /host/session/demo meanwhile, the phone rightly joins THAT demo.
  expect(
    serverJoins,
    "a server demo was (re)started by another client during this test; rerun on an idle server",
  ).toEqual([]);

  // The virtual host starts the game on its own; answer whatever question is up.
  const answers = page.locator("button[data-state]");
  await expect(answers.first()).toBeVisible({ timeout: 90_000 });

  // Answer targets are big enough for thumbs (≥ 44px), and nothing scrolls sideways.
  for (const box of await Promise.all((await answers.all()).map((a) => a.boundingBox()))) {
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Pick a wrong answer on purpose: the result must still be honest and friendly.
  await answerCurrentQuestionWrong(page);
  await expect(page.getByText(ID.play.locked).first()).toBeVisible();

  // Every simulated student answers or the timer runs out; then the reveal arrives.
  await expect(page.getByRole("heading", { name: ID.result.incorrect })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(ID.result.correctAnswerWas)).toBeVisible();

  // It really was the local solo demo: the phone never opened a server event stream.
  expect(streams, "solo demo must not stream from the server").toEqual([]);
  expect(errors, errors.join("\n")).toEqual([]);
});
