'use client'

import React from 'react'
import useSWR from 'swr'
import { EnvelopeSimple } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Switch } from '@components/ui/switch'
import { emailNotificationsApi, emailNotificationsKey, type EmailNotifications } from '@services/users/emailNotifications'

/** Settings › Emails: one switch per kind of email the app sends you. Staff also see "Work to review". */
export default function AccountEmailNotifications() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const { data, mutate } = useSWR<EmailNotifications>(token ? emailNotificationsKey() : null, () => emailNotificationsApi.get(token as string))
  const [error, setError] = React.useState('')
  if (!data?.streams?.length) return null

  const change = async (key: string, enabled: boolean) => {
    setError('')
    const optimistic = { streams: data.streams.map((stream) => stream.key === key ? { ...stream, enabled } : stream) }
    try {
      await mutate(emailNotificationsApi.save({ [key]: enabled }, token as string), { optimisticData: optimistic, rollbackOnError: true, revalidate: false })
    } catch (caught: any) {
      setError(caught?.message || 'That didn’t save. Try again.')
    }
  }

  return <section className={`${settingsCard} p-5 sm:p-6`}>
    <SettingsHeader icon={EnvelopeSimple} title="Emails" description={`What we email you about at ${session?.data?.user?.email || 'your address'}. Every email has a link to stop that kind too.`} />
    <div className="mt-3 max-w-2xl divide-y divide-border">
      {data.streams.map((stream) => {
        const id = `email-stream-${stream.key}`
        return <div key={stream.key} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <label htmlFor={id} className="block text-[15px] font-bold">{stream.label}</label>
            <p id={`${id}-help`} className="text-sm text-muted-foreground">{stream.description}</p>
          </div>
          <Switch id={id} checked={stream.enabled} aria-describedby={`${id}-help`} onCheckedChange={(next) => void change(stream.key, next)} />
        </div>
      })}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
  </section>
}
