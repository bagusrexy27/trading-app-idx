/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tv: {
          bg:     '#131722',
          card:   '#1e222d',
          hover:  '#262b3a',
          border: '#2a2e39',
          text:   '#d1d4dc',
          muted:  '#787b86',
          green:  '#26a69a',
          red:    '#ef5350',
          blue:   '#2196f3',
          yellow: '#ffc107',
          purple: '#9c6bff',
          input:  '#0f1117',
        },
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
