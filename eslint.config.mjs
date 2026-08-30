// eslint.config.mjs
/**
 * Flat config, driven by the ESLint CLI rather than `next lint`.
 *
 * There was no ESLint config at all, so `npm run lint` fell into `next lint`'s
 * interactive "How would you like to configure ESLint?" prompt — it hung rather
 * than linting, and would hang CI the same way. `next lint` is also deprecated
 * and removed in Next 16, so wiring it up again would have bought one release.
 *
 * eslint-config-next 15.x still ships eslintrc-style configs, hence FlatCompat
 * rather than a direct import. When it ships flat configs natively, this file
 * collapses to a plain spread and @eslint/eslintrc can go.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    // Flat config has no .eslintignore; ignores live here or not at all.
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      /**
       * Unused args prefixed with _ are deliberate — a signature that has to
       * match an interface, or a positional argument being skipped. Without
       * this the only way to silence them is to delete a parameter the caller
       * still passes.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    /**
     * Storefront files already converted to design slots.
     *
     * A raw palette class cannot be rebranded — that is the whole reason the
     * slots exist — so reintroducing one here fails the build rather than
     * quietly undoing the conversion. Theming rots because nobody notices the
     * first `bg-gray-800` going back in; this is what noticing looks like.
     *
     * The list grows as components are converted. When it covers
     * components/site entirely, this becomes a directory glob and the list
     * goes away.
     */
    files: [
      'components/site/navbar.tsx',
      'components/site/footer.tsx',
      'components/site/blocks/slider.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/\\b(bg|text|border|ring|divide|from|via|to)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)([-/][0-9]{1,3})?\\b/]",
          message:
            'Use a design slot (var(--site-*)) or a .site-btn-* class instead of a raw Tailwind colour. See the STOREFRONT DESIGN SLOTS block in app/globals.css.',
        },
        {
          selector:
            "TemplateElement[value.raw=/\\b(bg|text|border|ring|divide|from|via|to)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)([-/][0-9]{1,3})?\\b/]",
          message:
            'Use a design slot (var(--site-*)) or a .site-btn-* class instead of a raw Tailwind colour. See the STOREFRONT DESIGN SLOTS block in app/globals.css.',
        },
      ],
    },
  },

  {
    /**
     * Admin thumbnails stay on plain <img>. next/image wants every host in
     * next.config's remotePatterns, and these render whatever storage URL an
     * upload produced — local, S3 or R2 — so the list cannot be known ahead of
     * time. The panel is behind auth and never indexed, so the LCP argument
     * the rule is making does not apply to it. The public site is untouched by
     * this override and still has to use next/image.
     */
    files: ['components/admin/**/*.tsx', 'app/(admin)/**/*.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },

  {
    // Scripts are operator tools run by hand against a real database. They log
    // progress deliberately, and assert with `cond ? ok(...) : bad(...)` as a
    // statement, which is the house idiom there rather than an accident.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];

// Named rather than exported inline: import/no-anonymous-default-export, which
// this config enables for the rest of the repo, applies to this file too.
export default config;
