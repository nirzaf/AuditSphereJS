import tseslint from 'typescript-eslint';
export default [
  { ignores: ['**/dist/**', '**/generated/**', 'node_modules/**', 'docs/**', 'test-results/**', 'playwright-report/**', '.angular/**'] },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, rules: { 'no-debugger': 'error' } },
];
