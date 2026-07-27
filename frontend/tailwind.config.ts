import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FAF8F4',
        amber: {
          DEFAULT: '#E8A020',
          pale: '#FFF5E1',
          light: '#FFD480',
          deep: '#C68510',
        },
        terra: {
          DEFAULT: '#C8573A',
          pale: '#FFE8E3',
        },
        sage: {
          DEFAULT: '#5E8C6A',
          pale: '#E8F0EA',
        },
        ink: {
          DEFAULT: '#1C1917',
          soft: '#3C3835',
          muted: '#6B6662',
        },
        stone: {
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        mono: ['DM Mono', 'monospace'],
      },
      boxShadow: {
        sm: '0 1px 4px rgba(0,0,0,0.04)',
        md: '0 4px 12px rgba(0,0,0,0.06)',
        lg: '0 8px 24px rgba(0,0,0,0.08)',
        xl: '0 16px 48px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
export default config
