import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { ConfirmHost } from '@/components/ui/confirm'
import { NetworkBanner } from '@/components/ui/network-banner'
import { AndroidUpdateBanner } from '@/components/ui/android-update-banner'
import { MotionProvider } from '@/components/ui/motion-provider'
import { I18nProvider } from '@/components/ui/i18n-provider'

// Bundled with the app (npm @fontsource) rather than fetched from Google at build time, so builds work offline and in CI.

const plexSans = localFont({
  variable: '--font-sans',
  display: 'swap',
  src: [
    { path: '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2', weight: '700' },
  ],
})

const plexMono = localFont({
  variable: '--font-mono',
  display: 'swap',
  src: [
    { path: '../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
})

export const metadata: Metadata = {
  title: 'Kipd | Hotel & Restaurant Management',
  description: 'Modern SaaS platform for boutique hotels and hospitality businesses',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/kipd-app-icon.svg',
    apple: '/icons/icon-192.png',
  },
  themeColor: '#d97706',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
        <body className="font-sans bg-cream text-ink antialiased">
          <I18nProvider>
            <MotionProvider>
              <NetworkBanner />
              <AndroidUpdateBanner />
              {children}
              <Toaster />
              <ConfirmHost />
            </MotionProvider>
          </I18nProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
