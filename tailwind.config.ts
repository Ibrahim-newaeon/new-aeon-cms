// tailwind.config.ts
import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ holds the block registry, whose class strings would otherwise be
    // purged from the production build.
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          bg: '#0c0e13',
          surface: '#14161f',
          elevated: '#1c1e2a',
          line: '#1e2028',
          text: '#f0f0f5',
          'text-secondary': '#9aa3b5',
          'text-muted': '#7d8596',
          primary: '#6366f1',
          'primary-hover': '#818cf8',
          'primary-muted': 'rgba(99, 102, 241, 0.15)',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        // next/font variables, not literal family names.
        cairo: ['var(--font-cairo)', 'system-ui', 'sans-serif'],
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      spacing: { sidebar: '16rem', header: '4rem' },
      borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
    },
  },
  // `prose prose-invert` is used by the editor; without this plugin those
  // classes did not exist and the utility was a silent no-op.
  plugins: [typography, animate],
};

export default config;
