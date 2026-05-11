'use client'

import Script from 'next/script'
import { SessionProvider } from '@components/Contexts/AuthContext'
import LHSessionProvider from '@components/Contexts/LHSessionContext'
import I18nProvider from '@components/Contexts/I18nContext'
import {
  getLAUNCHLMS_TELEMETRY_DISABLED_VAL,
  getLAUNCHLMS_TOP_DOMAIN_VAL,
} from '@services/config/config.client'
import '../lib/i18n'

function UmamiScript() {
  const isDevEnv = getLAUNCHLMS_TOP_DOMAIN_VAL() === 'localhost'
  const isTelemetryDisabled = getLAUNCHLMS_TELEMETRY_DISABLED_VAL() === 'true'

  if (isDevEnv || isTelemetryDisabled) {
    return null
  }

  return (
    <Script
      data-website-id="a1af6d7a-9286-4a1f-8385-ddad2a29fcbb"
      src="/umami/script.js"
    />
  )
}

export default function AppProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <UmamiScript />
      <SessionProvider refetchInterval={600000}>
        <LHSessionProvider>
          <I18nProvider>
            <main className="animate-fade-in">{children}</main>
          </I18nProvider>
        </LHSessionProvider>
      </SessionProvider>
    </>
  )
}
