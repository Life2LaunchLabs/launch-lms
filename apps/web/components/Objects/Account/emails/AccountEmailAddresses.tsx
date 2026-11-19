'use client'

import React from 'react'
import useSWR from 'swr'
import { At } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Button } from '@components/ui/button'
import { accountEmailsApi, accountEmailsKey, type AccountEmails, type SpareEmail } from '@services/users/accountEmails'
import AddEmailForm from './AddEmailForm'

const SOURCE: Record<string, string> = { canvas: 'From your school’s Canvas', main: 'Your main email before', code: 'Added by you' }

/**
 * Settings › Your emails (DEV-198): the main email (sign-in, notifications) and spares you can also sign in with.
 * Add one with a code, make one main, take a spare off. Keeps the account yours when a school email goes away.
 */
export default function AccountEmailAddresses() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const { data, mutate } = useSWR<AccountEmails>(token ? accountEmailsKey() : null, () => accountEmailsApi.get(token as string))
  const [adding, setAdding] = React.useState(false)
  const [working, setWorking] = React.useState('')
  const [error, setError] = React.useState('')
  const [note, setNote] = React.useState('')
  if (!data || !token) return null

  const act = async (email: string, run: () => Promise<AccountEmails>, done: string, refreshSession = false) => {
    setWorking(email); setError(''); setNote('')
    try {
      await mutate(await run(), { revalidate: false })
      if (refreshSession) await session?.update?.(true)
      setNote(done)
    } catch (caught: any) {
      setError(caught?.message || 'That didn’t work. Try again.')
    } finally { setWorking('') }
  }

  const full = data.spares.length >= data.max_spares
  return <section className={`${settingsCard} p-5 sm:p-6`} aria-label="Your emails">
    <SettingsHeader icon={At} title="Your emails" description="Sign in with any of these. Notifications go to your main email. Add a personal email so you keep your account after you leave school or work." />
    <ul className="mt-4 max-w-2xl divide-y divide-border">
      <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
        <div className="min-w-0">
          <p className="break-all text-[15px] font-bold">{data.main.email}</p>
          <p className="text-sm text-muted-foreground">Main email: sign-in and notifications</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">Main</span>
      </li>
      {data.spares.map((spare: SpareEmail) => <li key={spare.email} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="break-all text-[15px] font-bold">{spare.email}</p>
          <p className="text-sm text-muted-foreground">{SOURCE[spare.source] || 'Added'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!!working}
            onClick={() => void act(spare.email, () => accountEmailsApi.makeMain(spare.email, token), `${spare.email} is your main email now.`, true)}>
            {working === spare.email ? 'Saving…' : 'Make main'}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!!working} aria-label={`Remove ${spare.email}`}
            onClick={() => void act(spare.email, () => accountEmailsApi.remove(spare.email, token), `${spare.email} was removed.`)}>
            Remove
          </Button>
        </div>
      </li>)}
    </ul>
    <div aria-live="polite" className="max-w-2xl">
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
      {note ? <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{note}</p> : null}
    </div>
    <div className="mt-4 max-w-2xl">
      {adding
        ? <AddEmailForm token={token} onCancel={() => setAdding(false)} onAdded={(next) => { void mutate(next, { revalidate: false }); setAdding(false); setNote('Email added. You can sign in with it now.') }} />
        : full
          ? <p className="text-sm text-muted-foreground">You have as many emails as an account can hold. Remove one to add another.</p>
          : <Button type="button" variant="surface" onClick={() => { setAdding(true); setNote(''); setError('') }}>Add an email</Button>}
    </div>
  </section>
}
