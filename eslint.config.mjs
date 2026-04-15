import globals from "globals";
import noUnsanitized from "eslint-plugin-no-unsanitized";

const noUnsanitizedRules = {
  "no-unsanitized/method": "warn",
  "no-unsanitized/property": "off"
};

/** Fas 2: varningar för riskabla DOM-metoder. */
export default [
  { ignores: ["vendor/**", "node_modules/**", "test/**"] },
  {
    files: ["app.js", "lib/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      "no-unsanitized": noUnsanitized
    },
    rules: { ...noUnsanitizedRules }
  },
  {
    files: ["vault.js", "theme-assets.js", "sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    },
    plugins: {
      "no-unsanitized": noUnsanitized
    },
    rules: { ...noUnsanitizedRules }
  }
];
