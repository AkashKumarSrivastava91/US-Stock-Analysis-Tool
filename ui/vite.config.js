import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Default: project root is always the parent of the ui/ folder.
  // Override with VITE_DATA_ROOT in ui/.env only if you move the UI elsewhere.
  const dataRoot = env.VITE_DATA_ROOT || path.resolve(__dirname, "..");

  return {
    plugins: [react()],
    define: {
      // Injected at build-time so dataLoaders.js can build @fs URLs without a .env file
      __DATA_ROOT__: JSON.stringify(dataRoot),
    },
    server: {
      fs: {
        allow: [dataRoot],
      },
    },
  };
});
