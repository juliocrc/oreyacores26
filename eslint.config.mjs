import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Base config from Next.js plus a few tolerant overrides to allow
// incremental migration (warn on explicit any) and enable lint-staged.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Project-level overrides
  {
    rules: {
      // Relax this rule to 'warn' so we can progressively add types
      "@typescript-eslint/no-explicit-any": "warn",
      // Relax require-imports enforcement to allow legacy scripts during migration
      "@typescript-eslint/no-require-imports": "warn",
      // Some components intentionally set state during mount; warn instead of error
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Allow CommonJS utility scripts to use require() without lint errors
  {
    files: ["**/*.cjs", "scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
