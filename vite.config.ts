import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: false
  },
  server: {
    port: 5173,
    proxy: {
      "/_mock": "http://127.0.0.1:7394",
      "/v1": "http://127.0.0.1:7394",
      "/v1beta": "http://127.0.0.1:7394"
    }
  }
});
