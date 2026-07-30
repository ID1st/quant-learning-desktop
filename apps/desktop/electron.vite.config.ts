import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

const workspaceRoot = resolve(__dirname, "../..");
const authenticationDefines = {
  __QUANT_AUTH_BASE_URL__: JSON.stringify(
    process.env.QUANT_AUTH_BASE_URL?.trim() ?? "",
  ),
  __QUANT_AUTH_OFFLINE_PUBLIC_KEY_PEM__: JSON.stringify(
    (process.env.QUANT_AUTH_OFFLINE_PUBLIC_KEY_PEM ?? "").replaceAll(
      "\\n",
      "\n",
    ),
  ),
};

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
    define: authenticationDefines,
    resolve: {
      alias: packageAliases,
    },
    build: {
      rollupOptions: {
      input: {
        main: resolve(__dirname, "src/electron/main.ts"),
        authSmoke: resolve(__dirname, "src/electron/authSmoke.ts"),
        authVisualSmoke: resolve(__dirname, "src/electron/authVisualSmoke.ts"),
        marketDataSearchSmoke: resolve(__dirname, "src/electron/marketDataSearchSmoke.ts"),
        pluginRuntimeSmoke: resolve(__dirname, "src/electron/pluginRuntimeSmoke.ts"),
      },
      },
    },
  },
  preload: {
    resolve: {
      alias: packageAliases,
    },
    build: {
      // Sandboxed preload scripts must be self-contained CommonJS files.
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, "src/electron/preload.ts"),
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs",
        },
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
