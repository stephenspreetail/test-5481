import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Vite configuration for Kova web application.
 *
 * Usage:
 *   npm run dev:web     - Start development server
 *   npm run build:web   - Build for production
 *   npm run preview:web - Preview production build
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  if (!env.VITE_API_URL) {
    throw new Error("VITE_API_URL environment variable is required");
  }

  return {
    plugins: [react(), tailwindcss()],
    publicDir: "public",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@assets": path.resolve(__dirname, "./assets"),
      },
    },
    define: {
      // Define platform as 'web'
      "process.env.PLATFORM": JSON.stringify("web"),
      // Ensure process.env is available
      "process.env": {},
    },
    build: {
      outDir: "dist/web",
      sourcemap: false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
        },
      },
      // Optimize for modern browsers
      target: "esnext",
      // Chunk size warnings
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        // Proxy API requests to the backend server in development
        "/api": {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        "/ws": {
          target: env.VITE_API_URL,
          ws: true,
          changeOrigin: true,
        },
      },
      // Ignore directories that shouldn't trigger HMR reloads
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/dist/**",
          "**/backend/**",
          "**/app-container/**",
          "**/docs/**",
          "**/drizzle/**",
          "**/testing/**",
          "**/tools/**",
          "**/worker/**",
          "**/.git/**",
          "**/data/**",
          "**/logs/**",
          "**/tmp/**",
          "**/temp/**",
          "**/*.log",
          "**/*.db",
          "**/*.sqlite",
        ],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    // Optimize dependencies
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "jotai",
      ],
    },
  };
});
