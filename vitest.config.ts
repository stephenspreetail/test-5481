import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// TODO: Consider migrating to Bun's native test runner (bun test) in the future.
// Bun test is Jest-compatible and faster, but currently lacks built-in happy-dom
// environment. See: https://bun.sh/docs/test/writing

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
