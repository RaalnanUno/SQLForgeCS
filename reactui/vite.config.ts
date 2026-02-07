import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Build output goes straight into the ASP.NET server's wwwroot
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../servercs/SQLForgeCS.Server/wwwroot"),
    emptyOutDir: true,
  },
});
