import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/babel.config.js',
      '**/*-env.d.ts',
      '**/next-env.d.ts',
      'apps/backend/**', // uses its own eslint-config-next flat config
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
