import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const API_CLIENT = "src/shared/lib/api.ts";

// One zone per feature so a feature may only import itself. Read from disk
// rather than hardcoded, so a newly added feature folder is fenced without
// anyone remembering to update this file.
const featureIsolationZones = readdirSync("./src/features", {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    target: `./src/features/${entry.name}`,
    from: "./src/features",
    except: [`./${entry.name}`],
    message:
      "Features must not import each other. Move anything two features share down into src/shared.",
  }));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    name: "fpl/architecture",
    rules: {
      // The base URL has exactly one home. Copies of this const are how we
      // ended up with 14 of them, so make re-declaring it a lint failure
      // rather than something a reviewer has to catch.
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator[id.name='API_URL']",
          message: `Import API_URL from "@/shared/lib/api" instead of re-declaring it.`,
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='NEXT_PUBLIC_API_URL']",
          message: `Read the API base URL via API_URL from "@/shared/lib/api"; ${API_CLIENT} is the only file that should touch NEXT_PUBLIC_API_URL.`,
        },
      ],
      // Dependencies point one way: app -> features -> shared.
      "import/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: "./src/shared",
              from: "./src/features",
              message:
                "shared/ is the bottom layer and must not import from features/. Invert it: take what you need as a prop or argument.",
            },
            {
              target: "./src/shared",
              from: "./src/app",
              message:
                "shared/ must not import from app/. Routing is the top layer.",
            },
            {
              target: "./src/features",
              from: "./src/app",
              message:
                "features/ must not import from app/. Routing composes features, never the reverse.",
            },
            ...featureIsolationZones,
          ],
        },
      ],
    },
  },
  {
    // The one file allowed to read the env var and name the const.
    name: "fpl/api-client-exemption",
    files: [API_CLIENT],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
