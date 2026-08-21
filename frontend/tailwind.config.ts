import type { Config } from 'tailwindcss';

/** Colors resolve to CSS custom properties so branding can change at runtime. */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: rgb('--color-primary'),
          hover: rgb('--color-primary-hover'),
          subtle: rgb('--color-primary-subtle'),
          fg: rgb('--color-primary-fg'),
        },
        secondary: { DEFAULT: rgb('--color-secondary') },
        app: rgb('--bg-app'),
        surface: rgb('--bg-surface'),
        subtle: rgb('--bg-subtle'),
        line: rgb('--border'),
        'line-strong': rgb('--border-strong'),
        content: {
          DEFAULT: rgb('--text-primary'),
          secondary: rgb('--text-secondary'),
          muted: rgb('--text-muted'),
          inverse: rgb('--text-inverse'),
        },
        success: { DEFAULT: rgb('--success'), bg: rgb('--success-bg') },
        warning: { DEFAULT: rgb('--warning'), bg: rgb('--warning-bg') },
        danger: { DEFAULT: rgb('--danger'), bg: rgb('--danger-bg') },
        info: { DEFAULT: rgb('--info'), bg: rgb('--info-bg') },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        sm: ['0.8125rem', { lineHeight: '1.125rem' }],
        base: ['0.875rem', { lineHeight: '1.25rem' }],
        h3: ['0.9375rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        h2: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        display: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '6px', lg: '8px', xl: '12px' },
      boxShadow: {
        sm: '0 1px 2px rgb(15 23 42 / 0.05)',
        DEFAULT: '0 1px 3px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.04)',
        lg: '0 10px 24px rgb(15 23 42 / 0.10)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'zoom-in': { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-top': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'zoom-in': 'zoom-in 140ms ease-out',
        'slide-in-right': 'slide-in-right 180ms cubic-bezier(.32,.72,0,1)',
        'slide-in-top': 'slide-in-top 140ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
