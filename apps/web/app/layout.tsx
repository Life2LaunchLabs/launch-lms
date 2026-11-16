'use client'
import '../styles/globals.css'
import '../styles/looks.css'
import '../styles/fonts'
import { SessionProvider } from '@components/Contexts/AuthContext'
import LHSessionProvider from '@components/Contexts/LHSessionContext'
import '../lib/i18n'
import DemoExperience from '@components/Demo/DemoExperience'
import TestPersonaBar from '@components/Admin/Platform/UserTests/TestPersonaBar'
import I18nProvider from '@components/Contexts/I18nContext'
import { AccessibilityProvider } from '@components/Accessibility/AccessibilityContext'
import { ThemeProvider } from 'next-themes'
import { LOOK_BOOT } from '@components/Looks/looks'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html className="" lang="en" suppressHydrationWarning>
      <head>
        {/* Synchronous script — blocks parsing to guarantee window.__RUNTIME_CONFIG__ exists before any JS runs.
            Next.js <Script strategy="beforeInteractive"> is not truly blocking in all browsers (Safari). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-config.js" />
        {/* The learner's look, before the page paints (components/Looks/looks.ts). */}
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT }} />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SessionProvider refetchInterval={600000}>
            <LHSessionProvider>
              <I18nProvider>
                <AccessibilityProvider>
                  <DemoExperience />
                  <TestPersonaBar />
                  <main className="animate-fade-in">
                    {children}
                  </main>
                </AccessibilityProvider>
              </I18nProvider>
            </LHSessionProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
