import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
  {
    rules: {
      // Unused code is a gate, not a preference: with this off, every dead
      // export and stale import in the tree passed `pnpm lint` clean while the
      // pre-commit checklist treated lint as a check that could catch them.
      // `_`-prefixed bindings stay exempt, which is how you say "deliberately
      // unused" — a required positional argument, or a destructured rest.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // A wrong dependency array is a stale-closure bug waiting to happen, and
      // this project has hooks reading live results. Warn rather than error:
      // some of the deliberate omissions here are correct and documented.
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-require-imports": "off",
      // `next/image` needs an optimizer, which a static export does not ship —
      // its loader throws at render. Plain <img> is the only option here.
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
