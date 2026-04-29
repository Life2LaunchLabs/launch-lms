import unusedImports from "eslint-plugin-unused-imports";
import nextConfig from "eslint-config-next";
import js from "@eslint/js";

export default [
    js.configs.recommended,
    ...nextConfig,
    {
        plugins: {
            "unused-imports": unusedImports,
        },
        rules: {
            "react/no-unescaped-entities": "off",
            "@next/next/no-page-custom-font": "off",
            "@next/next/no-img-element": "off",
            "unused-imports/no-unused-imports": "warn",
            "no-console": ["warn", { allow: ["error", "warn"] }],
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            // TypeScript's own compiler handles undefined references
            "no-undef": "off",
        },
    },
    {
        // Dev scripts and SCORM runtime use console logging intentionally
        files: ["scripts/**/*.js", "ee/services/scorm/**/*.ts", "ee/components/Activities/ScormActivity.tsx"],
        rules: {
            "no-console": "off",
        },
    },
];