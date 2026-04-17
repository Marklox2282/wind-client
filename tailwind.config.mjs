/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          0:   '#ffffff',
          50:  '#fafafa',
          100: '#f5f5f5',
          150: '#eeeeee',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#3a3a3a',
          800: '#1f1f1f',
          850: '#141414',
          900: '#0a0a0a',
          950: '#050505',
          1000:'#000000',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease',
        'slide-up': 'slideUp 0.3s ease-out',
        'cloud-drift-slow': 'cloudDrift 48s linear infinite',
        'cloud-drift-mid': 'cloudDrift 34s linear infinite reverse',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        cloudDrift: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-8%)' },
        },
      },
    },
  },
  plugins: [],
}
