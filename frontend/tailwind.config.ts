import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Names are kept from the first design so every page picks up the new look at once:
      // amber = primary (teal), terra = danger, sage = success, cream = page background.
      colors: {
        cream: '#F4F5F7',
        amber: {
          DEFAULT: '#0B6B6F',
          50: '#F0F9F8',
          100: '#E0F2F1',
          200: '#B7E0DE',
          pale: '#E0F2F1',
          light: '#7DD9D4',
          deep: '#085659',
        },
        terra: {
          DEFAULT: '#AE231B',
          pale: '#FCE5E3',
        },
        sage: {
          DEFAULT: '#126B40',
          pale: '#E2F3E9',
        },
        ink: {
          DEFAULT: '#18202E',
          soft: '#434E60',
          muted: '#5B6678',
        },
        stone: {
          100: '#EDF0F4',
          200: '#DADFE7',
          300: '#B5BDCA',
          400: '#7A8596',
          500: '#5B6678',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16,24,40,0.05)',
        md: '0 2px 6px rgba(16,24,40,0.06)',
        lg: '0 8px 20px -6px rgba(16,24,40,0.14)',
        xl: '0 12px 32px -8px rgba(16,24,40,0.22)',
      },
    },
  },
  plugins: [],
}
export default config
