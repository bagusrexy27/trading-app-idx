/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tv: {
          bg:     '#0a0a0f',
          card:   '#13131a',
          hover:  '#1b1b24',
          border: 'rgba(255,255,255,0.08)',
          text:   '#ededef',
          muted:  '#8a8f98',
          green:  '#2ebd85',
          red:    '#f6465d',
          blue:   '#7c8aff',
          yellow: '#f5b950',
          purple: '#a78bfa',
          input:  '#0d0d13',
          accent: '#5e6ad2',
        },
      },
      borderRadius: {
        xl:  '1rem',
        '2xl': '1.375rem',
      },
      transitionTimingFunction: {
        cinema: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        glowGreen: {
          '0%, 100%': { boxShadow: '0 0 4px #26a69a30, inset 0 0 0px transparent' },
          '50%':      { boxShadow: '0 0 14px #26a69a70, 0 0 30px #26a69a20' },
        },
        glowRed: {
          '0%, 100%': { boxShadow: '0 0 4px #ef535030, inset 0 0 0px transparent' },
          '50%':      { boxShadow: '0 0 14px #ef535070, 0 0 30px #ef535020' },
        },
        glowBlue: {
          '0%, 100%': { boxShadow: '0 0 4px #2196f330' },
          '50%':      { boxShadow: '0 0 16px #2196f370, 0 0 32px #2196f320' },
        },
        scan: {
          '0%':   { top: '0%',   opacity: '0' },
          '5%':   { opacity: '1' },
          '95%':  { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        gradBorder: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        ticker: {
          '0%':   { transform: 'translateY(-6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out both',
        'slide-up':   'slideUp 0.35s ease-out both',
        'slide-down': 'slideDown 0.25s ease-out both',
        'glow-green': 'glowGreen 2.4s ease-in-out infinite',
        'glow-red':   'glowRed   2.4s ease-in-out infinite',
        'glow-blue':  'glowBlue  2s ease-in-out infinite',
        'scan':       'scan 5s linear infinite',
        'shimmer':    'shimmer 1.8s linear infinite',
        'grad-border':'gradBorder 3s ease infinite',
        'ticker':     'ticker 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
