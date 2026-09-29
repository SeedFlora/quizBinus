import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / tooling output (never hand-written source):
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "playwright/.cache/**",
    ".playwright-mcp/**",
    ".shots/**",
    "drizzle/**",
    // Runtime data on a self-hosted install (uploads, database dumps):
    "data/**",
    "uploads/**",
    "backups/**",
    // Local review helpers (Node scripts outside the app bundle):
    "scripts/**",
  ]),
]);

export default eslintConfig;
