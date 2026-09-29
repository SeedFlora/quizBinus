import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Two projects share one Vite setup (the `@/` alias and the React transform):
 *   unit        pure domain + realtime logic, Node environment (fast, no DOM)
 *   components  React Testing Library in jsdom, with the setup file's polyfills
 *               (also runs tests/unit/**\/*.test.tsx, i.e. hook tests)
 * Playwright specs in tests/e2e are run by `npx playwright test`, never by Vitest.
 *
 * PostgreSQL integration tests live alongside the unit tests and skip themselves unless
 * TEST_DATABASE_URL points at a throwaway database (CI provides a postgres service).
 * `.mts` keeps this file ESM for Vite's native config loader (no CommonJS warning).
 *
 * `@/` comes from tsconfig "paths". Vite 8 resolves tsconfig paths natively
 * (`resolve.tsconfigPaths`), which replaces the vite-tsconfig-paths plugin.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    testTimeout: 10_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx", "tests/unit/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
