import eslintPluginJsonc from "eslint-plugin-jsonc";
import eslintPluginYml from "eslint-plugin-yml";

export default [
  ...eslintPluginJsonc.configs["flat/recommended-with-jsonc"],
  ...eslintPluginYml.configs["flat/recommended"],
  {
    rules: {
      "yml/no-empty-mapping-value": "off",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/eval_results/**",
      "**/bun.lock",
      "**/mise.lock",
      "**/.git/**",
    ],
  },
];


