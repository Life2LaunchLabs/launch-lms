'use client'

import React from 'react'
import { Accessibility } from 'lucide-react'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { useAccessibility } from '@components/Accessibility/AccessibilityContext'
import { AccessibilityControls } from '@components/Accessibility/AccessibilityControls'

/** Settings › Accessibility: read aloud, voice and speed, bigger text, less motion. Saved on the account. */
export default function AccountAccessibility() {
  const { settings, save } = useAccessibility()
  const [error, setError] = React.useState('')
  const change = (patch: Parameters<typeof save>[0]) => { setError(''); save(patch).catch((err) => setError(err?.message || 'That didn’t save. Try again.')) }
  return <div className={`${settingsCard} p-5 sm:p-6`}>
    <SettingsHeader icon={Accessibility} title="Accessibility" description="Have the app read to you, and make it easier to see. These follow you to any device you sign in on." />
    {settings.set_by ? <p className="mt-4 rounded-xl bg-muted px-3.5 py-2.5 text-sm font-semibold">{settings.set_by.name} set these for you. You can change them any time.</p> : null}
    <div className="mt-3 max-w-2xl"><AccessibilityControls settings={settings} onChange={change} /></div>
    {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
  </div>
}
