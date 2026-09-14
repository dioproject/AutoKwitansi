import { defineConfig } from "vite";

const variant = process.env.APP_VARIANT || "lite";
const isFull = variant === "full";

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VARIANT__: JSON.stringify(variant),
  },
  build: {
    outDir: isFull ? "dist-full" : "dist-lite",
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
