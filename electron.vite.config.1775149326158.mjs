// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";
var __electron_vite_injected_dirname = "A:\\Dropbox\\stp-projects\\programs\\solodex";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    server: {
      port: 5174
    },
    base: "./",
    define: {
      // Make process.platform available in renderer without nodeIntegration
      "process.platform": JSON.stringify(process.platform)
    },
    resolve: {
      alias: {
        "@": path.resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        "@data": path.resolve(__electron_vite_injected_dirname, "data_objects-main")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
