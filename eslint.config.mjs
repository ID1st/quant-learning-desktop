import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = [
  "apps/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
  "packages/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
  "scripts/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
];

export default defineConfig(
  globalIgnores([
    ".codex/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "out/**",
    "prototype/**",
    "release/**",
    "trading-strategies/**",
    "**/dist/**",
    "**/out/**",
  ]),
  {
    files: sourceFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": ["error", { allow: ["error", "info", "warn"] }],
    },
  },
  {
    files: [
      "apps/admin-web/src/**/*.{ts,tsx}",
      "apps/desktop/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
    ],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "apps/**/tests/**/*.{ts,tsx}",
      "packages/**/tests/**/*.{ts,tsx}",
      "scripts/**/*.{js,mjs,cjs,ts,mts,cts}",
      "apps/desktop/src/electron/*Smoke.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
);
