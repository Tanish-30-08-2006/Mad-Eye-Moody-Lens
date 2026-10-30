import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local dev mirrors production: the browser calls relative /api/v1/... paths
    // and Vite forwards them to the FastAPI process, as nginx does in Docker.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: false },
    },
  },
});
