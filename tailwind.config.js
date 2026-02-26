import { fontFamily } from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Semantic tokens — all map to CSS variables
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border:  'hsl(var(--border))',
        input:   'hsl(var(--input))',
        ring:    'hsl(var(--ring))',
        // Popover
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // Sidebar
        sidebar: {
          DEFAULT:            'hsl(var(--sidebar-background))',
          foreground:         'hsl(var(--sidebar-foreground))',
          accent:             'hsl(var(--sidebar-accent))',
          'accent-foreground':'hsl(var(--sidebar-accent-foreground))',
          border:             'hsl(var(--sidebar-border))',
        },
        // Brand palette
        'brand-sage': {
          DEFAULT: 'hsl(var(--brand-sage))',
          lightest:'hsl(var(--brand-sage-lightest))',
          lighter: 'hsl(var(--brand-sage-lighter))',
          darker:  'hsl(var(--brand-sage-darker))',
        },
        'brand-lavender': {
          DEFAULT: 'hsl(var(--brand-lavender))',
          lightest:'hsl(var(--brand-lavender-lightest))',
          lighter: 'hsl(var(--brand-lavender-lighter))',
          darker:  'hsl(var(--brand-lavender-darker))',
        },
        'brand-pink': {
          DEFAULT: 'hsl(var(--brand-pink))',
          lightest:'hsl(var(--brand-pink-lightest))',
          lighter: 'hsl(var(--brand-pink-lighter))',
          darker:  'hsl(var(--brand-pink-darker))',
        },
        'brand-amber': {
          DEFAULT: 'hsl(var(--brand-amber))',
          lightest:'hsl(var(--brand-amber-lightest))',
          lighter: 'hsl(var(--brand-amber-lighter))',
          darker:  'hsl(var(--brand-amber-darker))',
        },
      },
      borderRadius: {
        lg:  'var(--radius)',
        md:  'calc(var(--radius) - 2px)',
        sm:  'calc(var(--radius) - 4px)',
        xl:  'calc(var(--radius) + 3px)',
        '2xl':'calc(var(--radius) + 6px)',
      },
      fontFamily: {
        sans: ['Space Grotesk', ...fontFamily.sans],
        nav:  ['Space Grotesk', ...fontFamily.sans],
      },
      animation: {
        // Design system animations
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.3s ease-out',
        'scale-in':       'scale-in 0.2s ease-out',
        // Legacy app animations (kept for point-flash etc.)
        'bounce-in':  'bounceIn 0.5s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'pulse-once': 'pulseOnce 0.6s ease-out',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        bounceIn: {
          '0%':   { transform: 'scale(0.3)', opacity: '0' },
          '50%':  { transform: 'scale(1.05)' },
          '70%':  { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseOnce: {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.2)', color: '#facc15' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
};
