import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({ command }) => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // 프로덕션 빌드에서만 console.log / console.debug 제거.
  // console.error / .warn / .info 는 운영 진단을 위해 보존.
  esbuild: {
    pure: command === "build" ? ["console.log", "console.debug"] : [],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
