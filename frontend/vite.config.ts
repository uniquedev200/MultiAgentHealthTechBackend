import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/hospitals": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/emergencies": "http://localhost:3000",
      "/resources": "http://localhost:3000",
      "/audit-log": "http://localhost:3000",
      "/settings": "http://localhost:3000",
      "/allocations": "http://localhost:3000",
    },
  },
});
