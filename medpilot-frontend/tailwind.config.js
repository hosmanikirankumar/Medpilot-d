/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#141218',
          50:  '#2b2930',
          100: '#211f26',
          200: '#1d1b20',
          300: '#0f0d13',
        },
        glass: 'rgba(255,255,255,0.05)',
        accent: {
          DEFAULT: '#d0bcff',
          light:   '#eaddff',
          dark:    '#4f378b',
        },
        warning: {
          DEFAULT: '#ffb4ab',
          light:   '#ffdad6',
          dark:    '#93000a',
        },
        critical: {
          DEFAULT: '#f2b8b5',
          light:   '#f9dedc',
          dark:    '#8c1d18',
        },
        safe: '#81c995',
        info:  '#a8c7fa',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass:    '0 4px 16px rgba(0,0,0,0.2)',
        glow:     '0 0 24px rgba(208,188,255,0.15)',
        'glow-red':'0 0 32px rgba(242,184,181,0.25)',
        'glow-amber':'0 0 24px rgba(255,180,171,0.2)',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':   'spin 3s linear infinite',
        'ping-slow':   'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'scan-line':   'scanLine 2s linear infinite',
        'glow-pulse':  'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(239,68,68,0.4)' },
          '50%':      { boxShadow: '0 0 32px rgba(239,68,68,0.9)' },
        },
      },
    },
  },
  plugins: [],
}
