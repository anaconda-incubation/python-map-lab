/** @type {import('tailwindcss').Config} */
// EVERY FLAT MAP IS A CHOICE — design system per design.md §3–§6.
// All bespoke visual language lives in CSS custom properties (src/index.css);
// this file only maps utilities onto them.
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paper theme (fixed tokens — design.md §3)
        paper: {
          DEFAULT: '#F5F1E8',
          2: '#EDE7D9',
          3: '#E4DCC9',
        },
        ink: {
          DEFAULT: '#1B1812',
          2: '#5C5545',
          3: '#8B8271',
        },
        hairline: '#D8D0BD',
        // Chapter accents
        accent: '#C2481F', // vermilion — Mercator / primary interactive
        ochre: '#A9822E', // Gall–Peters
        seaweed: '#3E6E5E', // Equal Earth
        indigo: '#3D4E8C', // AuthaGraph
        gold: '#8A7B4F', // metadata / UN
        // Atlas theme (fixed tokens)
        atlas: {
          DEFAULT: '#0E1216',
          2: '#151C23',
          ink: '#EDE6D6',
          'ink-2': '#9C9482',
          hair: '#2A333D',
        },
        // Theme-aware semantic aliases (flip with [data-theme] on <html>)
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        fg: 'var(--fg)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        hair: 'var(--hair)',
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'serif'],
        body: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
        ui: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Type scale (desktop / mobile baked into clamps) — design.md §4
        hero: ['clamp(2.75rem, 7vw, 6rem)', { lineHeight: '0.98', letterSpacing: '-0.015em' }],
        chapter: ['clamp(2.25rem, 4.6vw, 3.75rem)', { lineHeight: '1.03', letterSpacing: '-0.015em' }],
        subhead: ['clamp(1.5rem, 2.4vw, 1.875rem)', { lineHeight: '1.16' }],
        standfirst: ['clamp(1.125rem, 1.6vw, 1.375rem)', { lineHeight: '1.5' }],
        body: ['1.1875rem', { lineHeight: '1.66' }],
        'body-sm': ['1.0625rem', { lineHeight: '1.62' }],
        caption: ['0.8125rem', { lineHeight: '1.5' }],
        kicker: ['0.71875rem', { lineHeight: '1.4', letterSpacing: '0.22em' }],
        label: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.14em' }],
        data: ['clamp(4.5rem, 10vw, 10rem)', { lineHeight: '0.95' }],
        'data-sm': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1' }],
        pull: ['clamp(1.5rem, 2.6vw, 2.125rem)', { lineHeight: '1.3' }],
      },
      maxWidth: {
        measure: '640px', // essay text column
        container: '1520px',
      },
      transitionTimingFunction: {
        atlas: 'cubic-bezier(0.22, 1, 0.36, 1)',
        morph: 'cubic-bezier(0.65, 0, 0.35, 1)',
        settle: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        micro: '200ms',
        ui: '380ms',
        reveal: '800ms',
        morph: '1800ms',
      },
      zIndex: {
        nav: '50',
        drawer: '70',
        toast: '80',
      },
    },
  },
  plugins: [],
}
