'use client'
import '../styles/globals.css'
import '../styles/looks.css'
import { SessionProvider } from '@components/Contexts/AuthContext'
import LHSessionProvider from '@components/Contexts/LHSessionContext'
import { getLAUNCHLMS_TOP_DOMAIN_VAL, getLAUNCHLMS_TELEMETRY_DISABLED_VAL } from '@services/config/config'

const isDevEnv = getLAUNCHLMS_TOP_DOMAIN_VAL() === 'localhost'
const isTelemetryDisabled = getLAUNCHLMS_TELEMETRY_DISABLED_VAL() === 'true'
import Script from 'next/script'
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Wix+Madefor+Text:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet" />
        {/* The Gallery and Volt looks' type (styles/looks.css). */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600&family=Anton&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=Chakra+Petch:wght@500;600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {
            isDevEnv ? '' : isTelemetryDisabled ? '' :
                            <Script
                                data-website-id="a1af6d7a-9286-4a1f-8385-ddad2a29fcbb"
                                src="/umami/script.js"
                            />
        }
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
