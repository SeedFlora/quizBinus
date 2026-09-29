/**
 * Player-only: a mistyped PIN. The server answers "not found" and the phone says so
 * in plain words, without leaving the join screen. Runs on desktop and Pixel 7.
 */

import { expect, test } from "@playwright/test";
import { ID, UNUSED_PIN, lookupRoom, requireServerMode, trackErrors } from "./helpers";

test("an unknown PIN shows “Kode permainan tidak ditemukan.” and stays on /join", async ({ page }) => {
  await requireServerMode(page.request);
  expect((await lookupRoom(page.request, UNUSED_PIN)).status).toBe("not_found");

  // The browser logs the lookup's 404 as a console error; that is the API answering correctly.
  const errors = trackErrors(page, [/status of 404 .*\/api\/rooms\//]);
  await page.goto("/join");
  const code = page.getByLabel(ID.join.codeLabel);
  await expect(code).toBeVisible();
  await code.fill(UNUSED_PIN);

  await expect(page.getByText(ID.errors.invalidCode)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/join(\?|$)/);
  // The field is usable again for a second try.
  await expect(code).toBeEnabled();
  await code.fill("");
  await expect(page.getByText(ID.errors.invalidCode)).toBeHidden();

  expect(errors, errors.join("\n")).toEqual([]);
});
