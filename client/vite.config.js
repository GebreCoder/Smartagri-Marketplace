import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express server runs on http://localhost:5000 by default.
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/uploads": { target: API_TARGET, changeOrigin: true },
      "/socket.io": { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          icons: ["react-icons"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
});
