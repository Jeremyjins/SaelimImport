import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
    setupFiles: ["app/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "app/loaders/**/*.server.ts",
        "app/lib/**/*.server.ts",
        "app/lib/format.ts",
        "app/lib/sanitize.ts",
        "app/lib/customs-utils.ts",
        "app/components/pdf/shared/pdf-utils.ts",
      ],
    },
  },
});
