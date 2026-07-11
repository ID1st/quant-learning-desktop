import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

const workspaceRoot = resolve(__dirname, "../..");

const packageAliases = {
  "@quant/shared": resolve(workspaceRoot, "packages/shared/src/index.ts"),
  "@quant/api-client": resolve(workspaceRoot, "packages/api-client/src/index.ts"),
  "@quant/chart": resolve(workspaceRoot, "packages/chart/src/index.tsx"),
  "@quant/pine-runtime": resolve(workspaceRoot, "packages/pine-runtime/src/index.ts"),
  "@quant/plugin-loader": resolve(workspaceRoot, "packages/plugin-loader/src/index.ts"),
  "@quant/strategy-engine": resolve(workspaceRoot, "packages/strategy-engine/src/index.ts"),
  "@quant/ui": resolve(workspaceRoot, "packages/ui/src/index.ts"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: Object.keys(packageAliases) })],
    resolve: {
      alias: packageAliases,
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/electron/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: Object.keys(packageAliases) })],
    resolve: {
      alias: packageAliases,
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: __dirname,
    plugins: [react()],
    resolve: {
      alias: packageAliases,
    },
    build: {
      outDir: resolve(__dirname, "out/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
  },
});
