import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

// Base config from Next.js plus a few tolerant overrides to allow
// incremental migration (warn on explicit any) and enable lint-staged.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Project-level overrides
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Relax this rule to 'warn' so we can progressively add types
      "@typescript-eslint/no-explicit-any": "warn",
      // Relax require-imports enforcement to allow legacy scripts during migration
      "@typescript-eslint/no-require-imports": "warn",
      // Exige (mas permite) um comentario a justificar `@ts-nocheck`.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-nocheck": "allow-with-description", "ts-expect-error": "allow-with-description" },
      ],
      // O eslint-plugin-react-hooks v6 (React Compiler) introduz varias regras
      // novas que assinalam padroes de fetching/memoizacao ja existentes em toda
      // a app. Ficam em 'warn' para que `npm run lint` falhe apenas em erros
      // reais, permitindo migrar os componentes incrementalmente. A regra de
      // correcao (rules-of-hooks) permanece 'error'.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  // Allow CommonJS utility scripts to use require() without lint errors
  {
    files: ["**/*.cjs", "scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Proibe `process.env[NOME]`.
  //
  // O Next so substitui process.env.NEXT_PUBLIC_* por literais quando a escrita
  // e um acesso ESTATICO a membro. Com indice dinamico o bundle do cliente fica
  // com process.env vazio e todas as variaveis caem em silencio no preset: o
  // servidor renderiza um nome e o cliente outro, e isso aparece como erro de
  // hidratacao em vez de erro de compilacao. Ja aconteceu nesta app; cada
  // variavel publica tem de ser lida de forma literal.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.cjs", "src/lib/resolve-database-url.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[computed=true][object.object.name='process'][object.property.name='env']",
          message:
            "process.env[NOME] nao e substituido pelo Next no cliente. Usa um acesso estatico (process.env.NEXT_PUBLIC_X) e declara a variavel no PUBLIC_ENV de src/lib/app-config.ts. Ver o comentario la para o porque.",
        },
      ],
    },
  },
  // Excepcao: resolver a base de dados percorre uma lista de nomes candidatos,
  // por isso o acesso tem de ser dinamico. E servidor-only (importado apenas por
  // prisma.ts e postgres.ts) e as variaveis nao sao NEXT_PUBLIC, logo nunca
  // chegariam ao cliente.
  {
    files: ["src/lib/resolve-database-url.ts"],
    rules: { "no-restricted-syntax": "off" },
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
