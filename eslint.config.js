import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const rules = {
  ...reactHooks.configs.recommended.rules,
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", disallowTypeAnnotations: false },
  ],
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error",
  "no-console": ["error", { allow: ["warn", "error"] }],
};

const plugins = {
  "react-hooks": reactHooks,
  "simple-import-sort": simpleImportSort,
};

export default tseslint.config(
  { ignores: ["**/node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}", "vitest.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins,
    rules,
  },
  {
    // The reference plugin imports `lightfern:host` and `lightfern:host/react`, which only resolve through the
    // examples tsconfig's path mapping.
    files: ["examples/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.examples.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins,
    rules,
  }
);
