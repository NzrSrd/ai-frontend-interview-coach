import { defineConfig } from "vitest/config";

// Test runner config. The coverage gate is scoped to the logic core
// (lib/** + app/api/**) — the pure functions, transport, eval runners, stores,
// and route handlers. UI components get smoke tests but are excluded from the
// threshold, so the number stays honest over the code that actually matters.
export default defineConfig({
  // Resolve the `@/*` -> repo-root alias from tsconfig.json natively.
  resolve: { tsconfigPaths: true },
  test: {
    // Default to node; storage/component specs opt into happy-dom per-file via
    // `// @vitest-environment happy-dom`.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Files matching `include` are reported even when no test imports them, so
      // an untested module drags the number down honestly.
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "components/**",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "types/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
